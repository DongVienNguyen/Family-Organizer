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

  it('closes storage once even when asset disposal rejects after drained shutdown', async () => {
    const { startManagedServer } = await load(); let closed=0;
    const runtime=await startManagedServer({app:express(),jobs:new AppJobs(),endStreams:()=>{},dispose:async()=>{throw new Error('asset disposal failed');}},{port:0,host:'127.0.0.1',closeStorage:()=>{closed++;}});
    await expect(runtime.close()).rejects.toThrow('asset disposal failed');
    await expect(runtime.close()).rejects.toThrow('asset disposal failed');
    expect(closed).toBe(1);expect(runtime.state.phase).toBe('failed');expect(runtime.server.listening).toBe(false);
  });
  it('failed startup still closes storage if asset disposal rejects', async () => {
    const { startManagedServer } = await load();const blocker=http.createServer().listen(0,'127.0.0.1');await new Promise<void>(resolve=>blocker.once('listening',resolve));let closed=0;
    try{
      await expect(startManagedServer({app:express(),jobs:new AppJobs(),endStreams:()=>{},dispose:async()=>{throw new Error('asset disposal failed');}},{port:(blocker.address() as any).port,host:'127.0.0.1',closeStorage:()=>{closed++;}})).rejects.toThrow();
      expect(closed).toBe(1);
    }finally{await new Promise<void>(resolve=>blocker.close(()=>resolve()));}
  });
  it('bounds pending asset disposal and still closes drained storage', async () => {
    const { startManagedServer } = await load();let release!:()=>void,closed=0;
    const held=new Promise<void>(resolve=>{release=resolve;});
    const runtime=await startManagedServer({app:express(),jobs:new AppJobs(),endStreams:()=>{},dispose:()=>held},{port:0,host:'127.0.0.1',timeoutMs:40,closeStorage:()=>{closed++;}});
    const close=runtime.close();let timer:ReturnType<typeof setTimeout>|undefined;
    const outcome=await Promise.race([close.then(()=> 'resolved',error=>String(error)),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve('unbounded disposal'),200);})]);
    clearTimeout(timer);release();await close.catch(()=>{});
    expect(outcome).toMatch(/timed out/);expect(closed).toBe(1);
  });
  it('bounds asynchronous storage closure and reports shutdown failure', async () => {
    const { startManagedServer } = await load();let release!:()=>void,closed=0;
    const held=new Promise<void>(resolve=>{release=resolve;});
    const runtime=await startManagedServer({app:express(),jobs:new AppJobs(),endStreams:()=>{},dispose:async()=>{}},{port:0,host:'127.0.0.1',timeoutMs:40,closeStorage:()=>{closed++;return held;}});
    const close=runtime.close();let timer:ReturnType<typeof setTimeout>|undefined;
    const outcome=await Promise.race([close.then(()=> 'resolved',error=>String(error)),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve('unbounded storage closure'),200);})]);
    clearTimeout(timer);release();await close.catch(()=>{});
    expect(outcome).toMatch(/timed out/);expect(closed).toBe(1);expect(runtime.state.phase).toBe('failed');
  });
});

it('passes the exact internal restore owner to handler drain while retaining normal shutdown ownership', async () => {
  const { startManagedServer } = await load(); const owner = {}; const drained: (object | undefined)[] = [];
  let maintenancePort: any;
  const handle = { app: express(), jobs: new AppJobs(), endStreams: () => {}, dispose: async () => {},
    drainHandlers: async (exceptOwner?: object) => { drained.push(exceptOwner); },
    setMaintenance: (port: any) => { maintenancePort = port; },
  };
  const runtime = await startManagedServer(handle, { port: 0, host: '127.0.0.1', closeStorage: () => {} });
  try {
    expect(maintenancePort).toBeTypeOf('function');
    await maintenancePort(async () => {}, owner);
    expect(drained).toEqual([owner]);
    await runtime.close(); expect(drained).toEqual([owner, undefined]);
  } finally { await runtime.close(); }
});
it('defaults the managed HTTP listener to loopback before reverse-proxy acceptance',async()=>{
  const {startManagedServer}=await load();const runtime=await startManagedServer({app:express(),jobs:new AppJobs(),endStreams:()=>{},dispose:async()=>{}},{port:0,closeStorage:()=>{}});
  try{expect((runtime.server.address() as any).address).toBe('127.0.0.1');}finally{await runtime.close();}
});

it('holds readiness, writes and jobs until owned startup validation completes',async()=>{
 const {startManagedServer}=await load();const jobs=new AppJobs(),app=express(),state:any={phase:'starting',storageWritable:true};let release!:()=>void,jobRuns=0,writes=0;
 const held=new Promise<void>(resolve=>{release=resolve;});jobs.registerAppJob('legacy','startup-gated',async()=>{jobRuns++;},{everyMs:1000,initialMs:0});
 app.get('/health',(_req,res)=>res.json({phase:state.phase}));app.post('/write',(_req,res)=>{if(state.phase!=='ready'){res.status(503).json({held:true});return;}writes++;res.json({ok:true});});
 const runtime=await startManagedServer({app,jobs,endStreams:()=>{},dispose:async()=>{}},{port:0,state,closeStorage:()=>{},validateStartup:async()=>held} as any);
 try{expect(runtime.ready).toBeInstanceOf(Promise);expect(state.phase).toBe('starting');await delay(15);expect(jobRuns).toBe(0);expect((await request(runtime.server,'/health')).body).toEqual({phase:'starting'});expect((await request(runtime.server,'/write','POST')).status).toBe(503);expect(writes).toBe(0);release();await runtime.ready;expect(state.phase).toBe('ready');expect((await request(runtime.server,'/write','POST')).status).toBe(200);expect(writes).toBe(1);await delay(15);expect(jobRuns).toBe(1);}finally{release();await runtime.close();}
});
it('failed startup validation never starts jobs and closes owned storage once',async()=>{
 const {startManagedServer}=await load();const jobs=new AppJobs();let jobRuns=0,closed=0;jobs.registerAppJob('legacy','startup-failed',async()=>{jobRuns++;},{everyMs:1000,initialMs:0});
 const runtime=await startManagedServer({app:express(),jobs,endStreams:()=>{},dispose:async()=>{}},{port:0,closeStorage:()=>{closed++;},validateStartup:async()=>{throw new Error('synthetic validation failed');}} as any);
 try{expect(runtime.ready).toBeInstanceOf(Promise);await expect(runtime.ready).rejects.toThrow('synthetic validation failed');expect(runtime.state.phase).toBe('failed');expect(jobRuns).toBe(0);}finally{await runtime.close();}expect(closed).toBe(1);expect(runtime.state.phase).toBe('failed');
});
it('abort and drain pending startup validation before closing storage',async()=>{
 const {startManagedServer}=await load(),order:string[]=[];let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
 const runtime=await startManagedServer({app:express(),jobs:new AppJobs(),endStreams:()=>{},dispose:async()=>{order.push('dispose');}},{port:0,closeStorage:()=>{order.push('db-close');},validateStartup:async(_server:any,signal:AbortSignal)=>new Promise<void>((_resolve,reject)=>{entered();signal.addEventListener('abort',()=>{order.push('validation-aborted');reject(new Error('synthetic aborted'));},{once:true});})} as any);
 try{expect(runtime.ready).toBeInstanceOf(Promise);await started;await runtime.close();await expect(runtime.ready).rejects.toThrow('synthetic aborted');expect(order).toEqual(['validation-aborted','dispose','db-close']);expect(runtime.state.phase).toBe('stopped');}finally{await runtime.close();}
});
