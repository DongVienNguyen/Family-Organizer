import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {createApp} from './app.js';
import {createAuth} from './auth.js';
import {NativeSessionStore} from './authStore.js';
import * as db from './db.js';
import {sqliteLoad,sqliteSave} from './sqlite.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';

async function fixture(work:(send:(route:string,role?:UserRole,payload?:unknown)=>Promise<any>,restart:()=>Promise<void>)=>Promise<void>) {
  const state=sqliteLoad();
  state.users=Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic',createdAt:'2026-10-11T00:00:00Z'}));
  sqliteSave(state); db.setAppSetting('rewardsEnabled',null); db.setAppSetting('rewardApprovalThreshold',null);
  const auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-flags-key'});
  const tokens=Object.fromEntries(state.users.map(user=>[user.role,auth.issue(user)]));
  let handle:Awaited<ReturnType<typeof createApp>>,server:http.Server;
  const start=async()=>{const deps=syntheticDependencies({phase:'ready',storageWritable:true});Object.assign(deps,{db,auth});handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');};
  const stop=async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await handle.drainHandlers();await handle.dispose();};
  await start();
  const send=(route:string,role?:UserRole,payload?:unknown)=>new Promise<any>((resolve,reject)=>{
    const text=payload===undefined?'':JSON.stringify(payload);let timer:ReturnType<typeof setTimeout>;
    const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false,method:payload===undefined?'GET':'POST',headers:{...(role?{Authorization:'Bearer '+tokens[role]}:{}),'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'x-request-id':randomUUID()}},res=>{
      let body='';res.on('data',part=>{body+=part;});res.on('error',reject);res.on('aborted',()=>reject(Error('Synthetic response aborted')));res.on('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(body)});}catch(error){reject(error);}});
    });
    timer=setTimeout(()=>req.destroy(Error('Synthetic absolute HTTP deadline')),5000);
    req.on('error',reject);req.end(text);
    // Response end settles this request; clear the timer on either settlement.
    req.once('close',()=>clearTimeout(timer));
  });
  try{await work(send,async()=>{await stop();await start();});}finally{await stop();}
}

it('keeps the existing reward default and persists explicit flags across HTTP app reconstruction',()=>fixture(async(send,restart)=>{
  const initial=await send('/api/version',UserRole.CHILD);expect(initial.status).toBe(200);expect(initial.body).toMatchObject({rewardsEnabled:true,rewardApprovalThreshold:0});
  const changed=await send('/api/settings/features',UserRole.ADMIN,{rewards:false,rewardApprovalThreshold:7.9});expect(changed.status).toBe(200);expect(changed.body).toEqual({rewardsEnabled:false,rewardApprovalThreshold:7});
  expect(db.getAppSettings()).toMatchObject({rewardsEnabled:'0',rewardApprovalThreshold:'7'});
  await restart();
  const version=await send('/api/version',UserRole.MEMBER);expect(version.status).toBe(200);expect(version.body).toMatchObject({rewardsEnabled:false,rewardApprovalThreshold:7});expect(version.headers['cache-control']).toBe('no-store');
  expect((await send('/api/settings/features',UserRole.ADMIN,{rewards:true,rewardApprovalThreshold:-3})).body).toEqual({rewardsEnabled:true,rewardApprovalThreshold:0});
  expect(db.getAppSettings().rewardApprovalThreshold).toBeUndefined();
}));

it('refuses unauthenticated and non-admin flag writes without changing legacy rows or settings',()=>fixture(async send=>{
  const before=db.FamilyDB.getFullSnapshot(),settings=db.getAppSettings();
  for(const role of [undefined,UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST]){
    const result=await send('/api/settings/features',role,{rewards:false,rewardApprovalThreshold:999});expect(result.status).toBe(role===undefined?401:403);
    expect(result.headers['cache-control']).toBe('no-store');expect(db.FamilyDB.getFullSnapshot()).toEqual(before);expect(db.getAppSettings()).toEqual(settings);
  }
}));

it('does not accept new module flags through the existing rewards settings route',()=>fixture(async send=>{
  const before=db.FamilyDB.getFullSnapshot(),settings=db.getAppSettings();
  const result=await send('/api/settings/features',UserRole.ADMIN,{matrix:true,kanban:true,wallet:true});expect(result.status).toBe(200);expect(result.body).toEqual({rewardsEnabled:true,rewardApprovalThreshold:0});
  expect(db.getAppSettings()).toEqual(settings);expect(db.FamilyDB.getFullSnapshot()).toEqual(before);
}));
