import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { startManagedServer } from './lifecycle.js';
import { once } from 'node:events';
import { describe, it, expect } from 'vitest';
import { syntheticDependencies, request } from '../tests/app-fixture.js';
const load = async () => import('./app.js').catch(() => ({} as any));
describe('application factory', () => {
  it('import and creation do not open SQLite, start jobs, or bind HTTP', async () => {
    const before = fs.existsSync(process.env.DATA_DIR!) ? fs.readdirSync(process.env.DATA_DIR!).sort() : null;
    const { createApp } = await load(); expect(createApp).toBeTypeOf('function');
    const state = { phase: 'ready', storageWritable: true, migrating: false };
    const handle = await createApp({ production: true, codeRoot: process.cwd(), dataRoot: process.env.DATA_DIR! }, syntheticDependencies(state));
    expect(fs.existsSync(process.env.DATA_DIR!) ? fs.readdirSync(process.env.DATA_DIR!).sort() : null).toEqual(before);
    expect(handle.app).toBeTypeOf('function'); await handle.dispose();
  });
  it('keeps liveness while readiness rejects migration, storage failure and maintenance', async () => {
    const { createApp } = await load(); expect(createApp).toBeTypeOf('function');
    const state = { phase: 'ready', storageWritable: true, migrating: false };
    const handle = await createApp({ production: true, codeRoot: process.cwd(), dataRoot: process.env.DATA_DIR! }, syntheticDependencies(state));
    const server = http.createServer(handle.app).listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      expect((await request(server, '/api/health')).body).toMatchObject({ ok: true, version: 'synthetic' });
      expect((await request(server, '/api/ready')).status).toBe(200);
      state.migrating = true; expect((await request(server, '/api/ready')).status).toBe(503);
      state.migrating = false; state.storageWritable = false; expect((await request(server, '/api/ready')).status).toBe(503);
      state.storageWritable = true; state.phase = 'maintenance';
      expect((await request(server, '/api/ready')).status).toBe(503);
      expect((await request(server, '/api/health')).status).toBe(200);
      expect((await request(server, '/api/users')).status).toBe(503);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); await handle.dispose(); }
  });
  it('removes all app auto-apply/restart and Immich management endpoints', async () => {
    const { createApp } = await load(); expect(createApp).toBeTypeOf('function');
    const handle = await createApp({ production: true, codeRoot: process.cwd(), dataRoot: process.env.DATA_DIR! }, syntheticDependencies({ phase: 'ready', storageWritable: true }));
    const server = http.createServer(handle.app).listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      for (const [method, route] of [['GET','/api/system/update'],['POST','/api/system/update/check'],['PUT','/api/system/update/config'],['POST','/api/system/update/apply'],['POST','/api/system/restart'],['GET','/api/system/immich'],['POST','/api/system/immich/check'],['POST','/api/system/immich/update']]) {
        expect((await request(server, route, method)).status, route).toBe(404);
      }
      expect((await request(server, '/api/users')).status).toBe(401);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); await handle.dispose(); }
  });
  it('maintenance drains an accepted partial body before executing storage work', async () => {
    const { createApp } = await load(); const state={phase:'ready',storageWritable:true};
    const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!},syntheticDependencies(state));
    const runtime=await startManagedServer(handle,{port:0,host:'127.0.0.1',state:state as any,closeStorage:()=>{},timeoutMs:1000});
    const body=JSON.stringify({username:'synthetic',password:'synthetic'});
    const seen=once(runtime.server,'request');
    const req=http.request({hostname:'127.0.0.1',port:(runtime.server.address() as any).port,path:'/api/auth/login',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>res.resume());
    const response=once(req,'response');req.write(body.slice(0,5));await seen;
    let worked=false;const maintenance=runtime.maintenance(async()=>{worked=true;});
    await new Promise(resolve=>setTimeout(resolve,15));expect(worked).toBe(false);
    req.end(body.slice(5));const [res]=await response;expect(res.statusCode).toBe(503);await maintenance;expect(worked).toBe(true);await runtime.close();
  });
  it('client disconnect does not release an unfinished async route owner', async () => {
    const { createApp } = await load(); const state={phase:'ready',storageWritable:true}; const deps=syntheticDependencies(state);
    deps.db.FamilyDB.getUsers=()=>[{id:'synthetic',username:'synthetic',fullName:'Synthetic',role:'admin'}];
    let release!:()=>void, entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    const metrics=deps.metrics;deps.metrics={async sample(){entered();await held;return metrics.sample();}};
    const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!},deps);
    const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
    const sig=crypto.createHmac('sha256','synthetic-key').update('synthetic').digest('hex');
    const req=http.get({hostname:'127.0.0.1',port:(server.address() as any).port,path:'/api/server/stats',headers:{Authorization:`Bearer synthetic.${sig}`}});req.on('error',()=>{});
    await started;req.destroy();let drained=false;const draining=handle.drainHandlers().then(()=>{drained=true;});
    await new Promise(resolve=>setTimeout(resolve,15));expect(drained).toBe(false);release();await draining;expect(drained).toBe(true);
    await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.dispose();
  });

  it('readiness never probes or recreates storage while maintenance owns it', async () => {
    const { createApp }=await load();const state={phase:'ready',storageWritable:true,migrating:false};const deps=syntheticDependencies(state);
    const probeRoot=process.env.DATA_DIR!+'/readiness-owned';let probes=0;
    deps.checkStorage=()=>{probes++;fs.mkdirSync(probeRoot,{recursive:true});};
    const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!},deps);
    const runtime=await startManagedServer(handle,{port:0,host:'127.0.0.1',state:state as any,closeStorage:()=>{}});
    try{
      expect((await request(runtime.server,'/api/ready')).status).toBe(200);expect(probes).toBe(1);
      await runtime.maintenance(async()=>{
        fs.rmSync(probeRoot,{recursive:true});
        for(let i=0;i<3;i++)expect((await request(runtime.server,'/api/ready')).status).toBe(503);
        expect(fs.existsSync(probeRoot)).toBe(false);expect(probes).toBe(1);
      });
      for(const phase of ['starting','draining','failed','stopped']){
        state.phase=phase;expect((await request(runtime.server,'/api/ready')).status).toBe(503);expect(probes).toBe(1);
      }
      state.phase='ready';state.migrating=true;expect((await request(runtime.server,'/api/ready')).status).toBe(503);expect(probes).toBe(1);
    }finally{await runtime.close();}
  });
  it('backup failure does not suppress birthday generation', async () => {
    const { createApp }=await load();const deps=syntheticDependencies({phase:'ready',storageWritable:true});let birthdays=0,backups=0;
    deps.db.FamilyDB.createBackup=()=>{backups++;throw new Error('Synthetic backup destination unwritable');};
    let done!:()=>void;const generated=new Promise<void>(resolve=>{done=resolve;});
    deps.db.FamilyDB.generateBirthdayNotifications=()=>{birthdays++;done();};
    const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!},deps);
    handle.jobs.start();let timer:ReturnType<typeof setTimeout>|undefined;
    await Promise.race([generated,new Promise<void>(resolve=>{timer=setTimeout(resolve,100);})]);clearTimeout(timer);
    await handle.jobs.stop();await handle.dispose();expect(backups).toBe(1);expect(birthdays).toBe(1);
  });
  it('malformed and oversized JSON keep client error status codes', async () => {
    const { createApp }=await load();const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!},syntheticDependencies({phase:'ready',storageWritable:true}));
    const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
    const send=(body:string)=>new Promise<number>((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:'/api/auth/login',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});req.on('error',reject);req.end(body);});
    try{expect(await send('{')).toBe(400);expect(await send(JSON.stringify({padding:'x'.repeat(15*1024*1024)}))).toBe(413);}
    finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.dispose();}
  });
});
