import type { AppJobStore, AppJobLease, AppJobKind } from './jobStore.js';
import { withAppCommandContext } from './commandContext.js';
export type JobHandler = (signal: AbortSignal, job?: AppJobLease) => void | Promise<void>;
interface ScheduledJob {
  handler: JobHandler;
  everyMs: number;
  initialMs?: number;
  timer?: ReturnType<typeof setTimeout>;
  active?: Promise<void>;
  controller?: AbortController;
  hasStarted?: boolean;
  durableOnly: boolean;
  kind: AppJobKind;
  nextIntervalAt?: number;
}

/** One registry owns both legacy intervals and persistent namespaced commands. */
export class AppJobs {
  private jobs = new Map<string, ScheduledJob>();
  private running = false;
  private stopped = false;
  private leaseMs: number;
  private pollMs: number;
  constructor(private onError: (error: unknown, key: string) => void = (error, key) => console.error(`Job ${key} failed`, error), private storage?: AppJobStore, options: { leaseMs?: number; pollMs?: number } = {}) {
    this.leaseMs = options.leaseMs ?? 60_000; this.pollMs = options.pollMs ?? 250;
    if (!Number.isSafeInteger(this.leaseMs) || this.leaseMs < 3 || !Number.isSafeInteger(this.pollMs) || this.pollMs < 1) throw new Error('Invalid durable job timing');
  }
  get durableEnabled(): boolean { return !!this.storage; }

  registerAppJob(namespace: string, type: string, handler: JobHandler, schedule?: { everyMs: number; initialMs?: number; kind?: AppJobKind }): void {
    const key = `${namespace}:${type}`;
    if (!namespace || !type || namespace.includes(':') || type.includes(':')) throw new Error('Invalid job namespace/type');
    if (this.running || this.stopped) throw new Error('Register jobs before starting');
    if (this.jobs.has(key)) throw new Error(`Job already registered: ${key}`);
    if (!schedule && !this.storage) throw new Error('Durable handlers require the shared job storage port');
    if (schedule && (!(schedule.everyMs > 0) || !Number.isFinite(schedule.everyMs) || (schedule.initialMs !== undefined && (!Number.isFinite(schedule.initialMs) || !(schedule.initialMs >= 0))))) throw new Error('Invalid job interval');
    this.jobs.set(key, { handler, everyMs: schedule?.everyMs ?? this.pollMs, initialMs: schedule?.initialMs ?? (schedule ? undefined : 0), durableOnly: !schedule, kind: schedule?.kind ?? 'command' });
  }

  private async executePersisted(key: string, job: ScheduledJob): Promise<void> {
    const [namespace, type] = key.split(':'); const storage = this.storage!;
    const now = Date.now();
    if (!job.durableOnly && (job.nextIntervalAt === undefined || job.nextIntervalAt <= now)) {
      // Align daily buckets with the product timezone; minute/hour schedules
      // retain stable slots. Restarts reuse the slot rather than replaying it.
      const slot = Math.floor((now + 7 * 3600_000) / job.everyMs);
      storage.enqueue({ namespace, type, key: `interval:${slot}`, payload: {}, kind: job.kind });
      job.nextIntervalAt = now + job.everyMs;
    }
    const lease = storage.claim(namespace, type, now, this.leaseMs);
    if (!lease) return;
    let lost: unknown;
    const heartbeat = setInterval(() => {
      try { if (!storage.renew(lease, Date.now(), this.leaseMs)) throw new Error('Job lease renewal lost ownership'); }
      catch (error) { lost = error; job.controller?.abort(); }
    }, Math.max(1, Math.floor(this.leaseMs / 3)));
    try {
      await withAppCommandContext({ actorId: `system:job:${namespace}`, requestId: lease.id, assertWriteOwnership: () => storage.assertLease(lease, Date.now()) }, () => job.handler(job.controller!.signal, lease));
      if (lost) throw lost;
      if (!storage.complete(lease, Date.now())) throw new Error('Job lease lost before completion');
    } catch (error) {
      storage.fail(lease, Date.now(), 'handler-failed', (error as { unknownOutcome?: boolean })?.unknownOutcome === true);
      throw error;
    } finally { clearInterval(heartbeat); }
  }

  private nextDelay(key: string, job: ScheduledJob): number {
    if (!this.storage) return job.everyMs;
    const [namespace, type] = key.split(':'); const due = this.storage.nextDue(namespace, type);
    const next = Math.min(job.durableOnly ? Date.now() + this.pollMs : job.nextIntervalAt ?? Date.now() + job.everyMs, due ?? Infinity);
    return Math.max(1, next - Date.now());
  }

  private schedule(key: string, job: ScheduledJob, ms: number): void {
    if (!this.running) return;
    job.timer = setTimeout(() => {
      job.timer = undefined;
      if (!this.running) return;
      job.hasStarted = true;
      job.controller = new AbortController();
      job.active = Promise.resolve().then(() => this.storage ? this.executePersisted(key, job) : job.handler(job.controller!.signal))
        .catch(error => this.onError(error, key))
        .finally(() => {
          job.active = undefined;
          job.controller = undefined;
          this.schedule(key, job, this.nextDelay(key, job));
        });
    }, ms);
  }

  start(): void { this.resume(); }
  resume(): void {
    if (this.stopped) throw new Error('Job registry stopped');
    if (this.running) return;
    if ([...this.jobs.values()].some(job => job.active)) throw new Error('Active jobs have not drained');
    this.running = true;
    for (const [key, job] of this.jobs) {
      if (job.hasStarted && !job.durableOnly) job.nextIntervalAt = Date.now() + job.everyMs;
      this.schedule(key, job, job.hasStarted ? job.everyMs : job.initialMs ?? job.everyMs);
    }
  }
  async pause(): Promise<void> {
    this.running = false;
    for (const job of this.jobs.values()) {
      clearTimeout(job.timer);
      job.timer = undefined;
      job.controller?.abort();
    }
    await Promise.all([...this.jobs.values()].map(job => job.active));
  }
  async stop(): Promise<void> { this.stopped = true; await this.pause(); }
}
