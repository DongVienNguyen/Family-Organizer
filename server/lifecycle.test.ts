import express from 'express';
import http from 'node:http';
import { describe, it, expect } from 'vitest';
import { AppJobs } from './appJobs.js';
import { request } from '../tests/app-fixture.js';
const load = async () => import('./lifecycle.js').catch(() => ({} as any));
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
describe('runtime lifecycle', () => {
  it('drains an accepted request and active job before closing storage exactly once', async () => {
    const { startManagedServer } = await load(); expect(startManagedServer).toBeTypeOf('function');
    const app = express(), jobs = new AppJobs(); const order: string[] = [];
    let releaseJob!: () => void, releaseRequest!: () => void, entered!: () => void;
    const jobHeld = new Promise<void>(resolve => { releaseJob = resolve; });
    const requestHeld = new Promise<void>(resolve => { releaseRequest = resolve; });
    const accepted = new Promise<void>(resolve => { entered = resolve; });
    jobs.registerAppJob('legacy','held', async () => { order.push('job-start'); await jobHeld; order.push('job-end'); }, { everyMs: 1000, initialMs: 0 });
    app.get('/held', async (_req,res) => { entered(); await requestHeld; order.push('request-end'); res.json({ ok: true }); });
    const runtime = await startManagedServer({ app, jobs, dispose: async () => { order.push('dispose'); }, endStreams: () => {} }, { port: 0, host: '127.0.0.1', closeStorage: () => { order.push('db-close'); }, timeoutMs: 1500 });
    const pending = request(runtime.server,'/held'); await accepted; await delay(15);
    let closed = false; const close = runtime.close().then(() => { closed = true; });
    await delay(15); expect(closed).toBe(false); expect(order).not.toContain('db-close');
    releaseRequest(); expect((await pending).status).toBe(200); releaseJob(); await close; await runtime.close();
    expect(order.indexOf('db-close')).toBeGreaterThan(order.indexOf('request-end'));
    expect(order.indexOf('db-close')).toBeGreaterThan(order.indexOf('job-end'));
    expect(order.filter(x => x === 'db-close')).toHaveLength(1);
    expect(runtime.server.listening).toBe(false);
  });
  it('a shutdown timeout fails and leaves storage open while a handler still owns it', async () => {
    const { startManagedServer } = await load(); expect(startManagedServer).toBeTypeOf('function');
    const app = express(), jobs = new AppJobs(); let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); let closed = false;
    jobs.registerAppJob('legacy','held', () => held, { everyMs: 1000, initialMs: 0 });
    const runtime = await startManagedServer({ app,jobs,dispose: async () => {},endStreams: () => {} }, { port:0, host:'127.0.0.1',closeStorage: () => { closed=true; },timeoutMs:40 });
    await delay(15); await expect(runtime.close()).rejects.toThrow(/timed out/); expect(closed).toBe(false);
    release(); await jobs.stop();
  });
  it('failed listen releases storage and disposes the created app', async () => {
    const { startManagedServer } = await load(); expect(startManagedServer).toBeTypeOf('function');
    const blocker = http.createServer().listen(0,'127.0.0.1'); await new Promise<void>(resolve => blocker.once('listening',resolve));
    let closed=0, disposed=0;
    try { await expect(startManagedServer({ app:express(), jobs:new AppJobs(),endStreams:()=>{},dispose:async()=>{disposed++;} }, { port:(blocker.address() as any).port,host:'127.0.0.1',closeStorage:()=>{closed++;} })).rejects.toThrow(/EADDRINUSE/); expect(closed).toBe(1); expect(disposed).toBe(1); }
    finally { await new Promise<void>(resolve=>blocker.close(()=>resolve())); }
  });
  it('failed maintenance drain stays unavailable and never resumes an active worker', async () => {
    const { startManagedServer } = await load(); const jobs=new AppJobs(); let release!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;});
    jobs.registerAppJob('legacy','held',()=>held,{everyMs:1000,initialMs:0});
    const runtime=await startManagedServer({app:express(),jobs,endStreams:()=>{},dispose:async()=>{}},{port:0,host:'127.0.0.1',timeoutMs:40,closeStorage:()=>{}});
    await delay(15); await expect(runtime.maintenance(async()=>{})).rejects.toThrow();
    expect(runtime.state.phase).toBe('failed'); release();await jobs.stop();await runtime.close();
  });
  it('close waits for maintenance ownership before releasing storage', async () => {
    const { startManagedServer } = await load(); let release!:()=>void, entered!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;}), started=new Promise<void>(resolve=>{entered=resolve;}); let closed=false;
    const runtime=await startManagedServer({app:express(),jobs:new AppJobs(),endStreams:()=>{},dispose:async()=>{}},{port:0,host:'127.0.0.1',timeoutMs:1000,closeStorage:()=>{closed=true;}});
    const maintenance=runtime.maintenance(async()=>{entered();await held;});await started;
    const close=runtime.close();await delay(15);expect(closed).toBe(false);release();await maintenance;await close;expect(closed).toBe(true);
  });

});
