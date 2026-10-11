import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { startManagedServer } from '../server/lifecycle.js';
import { AppJobs } from '../server/appJobs.js';
import { AppJobStore } from '../server/jobStore.js';
import { syntheticDependencies } from './app-fixture.js';
import * as db from '../server/db.js';
import * as sqlite from '../server/sqlite.js';
import * as media from '../server/media.js';
import * as fullBackup from '../server/fullBackup.js';
import { createAuth } from '../server/auth.js';
import { NativeSessionStore } from '../server/authStore.js';
function useNativeAuth(deps:any){deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:db.getSessionSecret});}
const repo=fileURLToPath(new URL('..',import.meta.url));
function send(server:http.Server,pathname:string,body?:Buffer,token?:string,requestId=crypto.randomUUID()){
  let req:http.ClientRequest;
  const promise=new Promise<{status:number;body:any}>((resolve,reject)=>{
    req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:pathname,method:body?'POST':'GET',agent:false,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/zip','Content-Length':body.length,'X-Request-Id':requestId}: {})}},res=>{let text='';res.on('data',bytes=>{text+=bytes;});res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(text)}));});req.on('error',reject);req.end(body);
  });return {req:req!,promise};
}
async function capture(){const out=new PassThrough();const chunks:Buffer[]=[];out.on('data',bytes=>chunks.push(bytes));const ended=once(out,'end');await fullBackup.streamFullBackup(out);await ended;return Buffer.concat(chunks);}
it.each([false,true])('owns restore while client disconnect=%s, drains other workers and avoids waiting for itself',async disconnect=>{
  const state={phase:'starting',storageWritable:true};const deps=syntheticDependencies(state);Object.assign(deps,{db,sqlite,media,fullBackup});
  useNativeAuth(deps);
  const store=new AppJobStore();const errors:unknown[]=[];deps.jobs=new AppJobs(error=>errors.push(error),store);
  let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  deps.jobs.registerAppJob('synthetic_http','held',async signal=>{entered();await held;expect(signal.aborted).toBe(true);});
  const buffer=await capture();store.enqueue({namespace:'synthetic_http',type:'held',key:crypto.randomUUID(),payload:{}});
  const handle=await createApp({production:true,codeRoot:repo,dataRoot:process.env.DATA_DIR!,configRoot:process.env.DATA_DIR!,logRoot:path.join(process.env.DATA_DIR!,'logs')},deps);
  let closed=0;const runtime=await startManagedServer(handle,{port:0,host:'127.0.0.1',state:state as any,closeStorage:()=>{closed++;}});
  await started;const user=db.FamilyDB.getUsers().find(user=>user.role==='admin')!;const token=deps.auth.issue(user);
  const restore=send(runtime.server,'/api/admin/backups/full/import',buffer,token);const response=restore.promise.then(value=>({value}),error=>({error}));
  try{
    await vi.waitFor(()=>expect(runtime.state.phase).toBe('maintenance'));
    expect((await send(runtime.server,'/api/ready').promise).status).toBe(503);
    if(disconnect){restore.req.destroy();const closing=runtime.close();await new Promise(resolve=>setTimeout(resolve,20));expect(closed).toBe(0);release();await closing;expect(closed).toBe(1);expect((await response) as any).toHaveProperty('error');}
    else{release();expect((await response) as any).toMatchObject({value:{status:200,body:{success:true}}});expect(runtime.state.phase).toBe('ready');}
    expect(errors).toEqual([]);
  }finally{release();await response;await runtime.close();}
},15_000);
it.each(['zip','json'])('returns HTTP409 for changed %s restore input reusing a committed request',async format=>{
  const state={phase:'starting',storageWritable:true};const deps=syntheticDependencies(state);Object.assign(deps,{db,sqlite,media,fullBackup});
  useNativeAuth(deps);
  const handle=await createApp({production:true,codeRoot:repo,dataRoot:process.env.DATA_DIR!,configRoot:process.env.DATA_DIR!,logRoot:path.join(process.env.DATA_DIR!,'logs')},deps);
  const runtime=await startManagedServer(handle,{port:0,host:'127.0.0.1',state:state as any,closeStorage:()=>{}});
  const user=db.FamilyDB.getUsers().find(user=>user.role==='admin')!;const token=deps.auth.issue(user);const id=crypto.randomUUID();
  try{
    if(format==='zip'){
      const first=await capture(),different=await capture();expect(different.equals(first)).toBe(false);
      expect((await send(runtime.server,'/api/admin/backups/full/import',first,token,id).promise).status).toBe(200);
      expect(deps.auth.verify(token)).toBeNull();const fresh=deps.auth.issue(db.FamilyDB.getUsers().find(user=>user.role==='admin')!);
      expect((await send(runtime.server,'/api/admin/backups/full/import',different,fresh,id).promise).status).toBe(409);
    }else{
      db.FamilyDB.createBackup('manual',user.id,user.username);const backup=db.FamilyDB.getBackups()[0];
      expect((await send(runtime.server,`/api/admin/backups/${backup.id}/restore`,Buffer.from('{}'),token,id).promise).status).toBe(200);
      expect(deps.auth.verify(token)).toBeNull();const fresh=deps.auth.issue(db.FamilyDB.getUsers().find(user=>user.role==='admin')!);
      expect((await send(runtime.server,'/api/admin/backups/synthetic-different/restore',Buffer.from('{}'),fresh,id).promise).status).toBe(409);
    }
  }finally{await runtime.close();}
},15_000);
