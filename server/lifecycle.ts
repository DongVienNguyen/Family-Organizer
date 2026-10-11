import http from 'node:http';
import type { Express } from 'express';
import type { AppJobs } from './appJobs.js';
import type { RuntimeState } from './runtimeState.js';

interface ManagedApp {
  app: Express;
  jobs: AppJobs;
  endStreams(): void;
  drainHandlers?(exceptOwner?: object): Promise<void>;
  setMaintenance?(port: <T>(work: () => Promise<T>, exceptOwner?: object) => Promise<T>): void;
  dispose(): Promise<void>;
}

async function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Runtime drain timed out')), ms);
    })]);
  } finally { clearTimeout(timer!); }
}

/** Call only after storage owners have drained; asset disposal never owns DB. */
export async function disposeDrainedResources(dispose: () => Promise<void>, closeStorage: () => void | Promise<void>, timeoutMs = 30_000): Promise<void> {
  const failures: unknown[] = [];
  try { await bounded(Promise.resolve().then(dispose), timeoutMs); }
  catch (error) { failures.push(error); }
  try { await bounded(Promise.resolve().then(closeStorage), timeoutMs); }
  catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'Runtime resource cleanup failed');
}

export async function startManagedServer(handle: ManagedApp, options: {
  port: number; host?: string; timeoutMs?: number; state?: RuntimeState;
  closeStorage(): void | Promise<void>;
  drainEffects?(): Promise<void>;
}) {
  const state = options.state ?? { phase: 'starting', storageWritable: true };
  const server = http.createServer(handle.app);
  const timeout = options.timeoutMs ?? 30_000;
  const disposeAndCloseStorage = () => disposeDrainedResources(() => handle.dispose(), () => options.closeStorage(), timeout);
  try {
    await new Promise<void>((resolve, reject) => {
      const error = (cause: Error) => reject(cause);
      server.once('error', error);
      server.listen(options.port, options.host ?? '0.0.0.0', () => { server.off('error', error); resolve(); });
    });
    state.phase = 'ready';
    handle.jobs.start();
  } catch (error) {
    state.phase = 'failed';
    const drained = server.listening
      ? new Promise<void>((resolve, reject) => server.close(cause => cause ? reject(cause) : resolve()))
      : Promise.resolve();
    server.closeIdleConnections();
    await bounded(Promise.all([drained, handle.jobs.stop(), handle.drainHandlers?.()]), timeout);
    await bounded(options.drainEffects?.() ?? Promise.resolve(), timeout);
    try { await disposeAndCloseStorage(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Runtime startup and cleanup failed'); }
    throw error;
  }
  let closing: Promise<void> | undefined;
  let maintenanceWork: Promise<unknown> | undefined;
  function maintenance<T>(work: () => Promise<T>, exceptOwner?: object): Promise<T> {
    if (state.phase !== 'ready' || maintenanceWork) return Promise.reject(new Error('Runtime is not ready for maintenance'));
    state.phase = 'maintenance';
    const operation = (async () => {
      try {
        handle.endStreams();
        await bounded(Promise.all([handle.jobs.pause(), handle.drainHandlers?.(exceptOwner)]), timeout);
        await bounded(options.drainEffects?.() ?? Promise.resolve(), timeout);
        return await work();
      } catch (error) {
        if (state.phase === 'maintenance') state.phase = 'failed';
        throw error;
      } finally {
        maintenanceWork = undefined;
        if (state.phase === 'maintenance') { state.phase = 'ready'; handle.jobs.resume(); }
      }
    })();
    maintenanceWork = operation;
    return operation;
  }
  function close(): Promise<void> {
    if (closing) return closing;
    state.phase = 'draining';
    handle.endStreams();
    const drained = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeIdleConnections();
    closing = (async () => {
      try {
        await bounded(Promise.all([drained, handle.jobs.stop(), handle.drainHandlers?.(), maintenanceWork]), timeout);
        await bounded(options.drainEffects?.() ?? Promise.resolve(), timeout);
        await disposeAndCloseStorage();
        state.phase = 'stopped';
      } catch (error) {
        state.phase = 'failed'; server.closeAllConnections(); throw error;
      }
    })();
    return closing;
  }
  handle.setMaintenance?.(maintenance);
  return { server, state, close, maintenance };
}
