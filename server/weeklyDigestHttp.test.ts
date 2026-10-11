import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createApp} from './app.js';
import {createAuth} from './auth.js';
import {NativeSessionStore} from './authStore.js';
import * as db from './db.js';
import * as digest from './weeklyDigest.js';
import * as telegram from './telegramBackup.js';
import {withAppWriteTransaction} from './appStore.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';
import {appConfig} from './config.js';
const seed=db.FamilyDB.getUsers()[0];
const admin={...seed,id:'digest-http-admin',username:'digest-http-admin',role:UserRole.ADMIN,isDeleted:false};
const alternate={...seed,id:'digest-http-other',username:'digest-http-other',role:UserRole.ADMIN,isDeleted:false};
beforeEach(()=>{withAppWriteTransaction({actorId:admin.id,command:'synthetic:digest-http-fixture',requestId:randomUUID(),payloadHash:'fixture'},tx=>{tx.legacy.users=[admin,alternate];tx.legacy.documents=[];});db.replaceAppSettings({telegramBotToken:'synthetic-http-token',telegramChatId:'synthetic-http-chat'});});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function serve(work:(send:(route:string,body:any,user?:any)=>Promise<any>,deps:any)=>Promise<void>,setup?:(deps:any)=>void){
 const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.digest={...digest};deps.telegram=telegram;deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-digest-http-secret'});
 setup?.(deps);
 const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);
 const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const send=(route:string,body:any,user=admin)=>new Promise<any>((resolve,reject)=>{
  const text=JSON.stringify(body);const token=deps.auth.issue(user);let response:http.IncomingMessage|undefined;
  const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,method:'POST',agent:false,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),Authorization:'Bearer '+token}},res=>{
   response=res;let content='';res.on('data',chunk=>{content+=chunk;if(Buffer.byteLength(content)>65536)req.destroy(new Error('Synthetic response size limit'));});res.once('error',reject);res.once('aborted',()=>reject(new Error('Synthetic response aborted')));res.once('end',()=>{clearTimeout(timer);try{resolve({status:res.statusCode,body:JSON.parse(content)});}catch(error){reject(error);}});
  });
  const timer=setTimeout(()=>{response?.destroy();req.destroy(new Error('Synthetic absolute HTTP deadline'));},3000);req.once('error',error=>{clearTimeout(timer);reject(error);});req.once('close',()=>clearTimeout(timer));req.end(text);
 });
 try{await work(send,deps);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
it('binds digest configuration to the current authenticated Admin',()=>serve(async send=>{expect((await send('/api/settings/telegram-backup',{weeklyDigestEnabled:true})).status).toBe(200);expect(db.getAppSettings().telegramWeeklyDigestOwnerId).toBe(admin.id);}));
it('refuses a forged owner rather than binding to a body-supplied ID',()=>serve(async send=>{const before=db.getAppSettings();expect((await send('/api/settings/telegram-backup',{weeklyDigestEnabled:true,telegramWeeklyDigestOwnerId:alternate.id})).status).toBe(400);expect(db.getAppSettings()).toEqual(before);}));
it.each([{weeklyDigestEnabled:'false'},{enabled:'false'},{botToken:42},{chatId:{}},{botToken:'x'.repeat(513)},{chatId:'x'.repeat(129)},[],{}])('rejects malformed Telegram settings atomically %#',payload=>serve(async send=>{const before=db.getAppSettings();expect((await send('/api/settings/telegram-backup',payload)).status).toBe(400);expect(db.getAppSettings()).toEqual(before);}));
it.each([UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST])('keeps existing %s Telegram configuration forbidden',role=>serve(async send=>{withAppWriteTransaction({actorId:admin.id,command:'synthetic:digest-http-role',requestId:randomUUID(),payloadHash:'fixture'},tx=>{tx.legacy.users[0].role=role;});const before=db.getAppSettings();expect((await send('/api/settings/telegram-backup',{weeklyDigestEnabled:true},{...admin,role})).status).toBe(403);expect(db.getAppSettings()).toEqual(before);}));
it('returns save failure without acknowledging or partially replacing settings',()=>serve(async send=>{
 const before=db.getAppSettings(),write=fs.writeFileSync.bind(fs);const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 vi.spyOn(fs,'writeFileSync').mockImplementation((file:any,...args:any[])=>{if(typeof file==='number'||String(file).includes('app_settings.json'))throw new Error('SYNTHETIC_PRIVATE_FS_PATH');return (write as any)(file,...args);});
 const result=await send('/api/settings/telegram-backup',{botToken:'synthetic-new',chatId:'synthetic-new-chat',weeklyDigestEnabled:true});expect(result.status).toBe(503);expect(result.body.error).not.toContain('SYNTHETIC_PRIVATE');expect(db.getAppSettings()).toEqual(before);expect(JSON.stringify(log.mock.calls)).not.toContain('SYNTHETIC_PRIVATE');
 expect(fs.readdirSync(appConfig.configRoot).filter(name=>name.includes('.tmp-'))).toEqual([]);
}));
it('keeps raw provider payloads out of the manual digest response',()=>serve(async send=>{const result=await send('/api/settings/telegram-digest/test',{});expect(result.status).toBe(400);expect(JSON.stringify(result.body)).not.toContain('SYNTHETIC_PRIVATE');},deps=>{deps.digest.sendWeeklyDigest=async()=>{throw new Error('SYNTHETIC_PRIVATE_PROVIDER_KEY');};}));
it('does not let another Admin route the bound owner digest manually',()=>serve(async send=>{db.setAppSetting('telegramWeeklyDigestOwnerId',admin.id);const fetch=vi.fn(async()=>({ok:true,status:200,json:async()=>({ok:true})}));vi.stubGlobal('fetch',fetch);expect((await send('/api/settings/telegram-digest/test',{},alternate)).status).toBe(400);expect(fetch).not.toHaveBeenCalled();}));
it('preserves ordinary backup enable toggles without changing an existing digest owner',()=>serve(async send=>{db.setAppSetting('telegramWeeklyDigestOwnerId',alternate.id);expect((await send('/api/settings/telegram-backup',{enabled:true})).status).toBe(200);expect(db.getAppSettings().telegramWeeklyDigestOwnerId).toBe(alternate.id);expect(db.getAppSettings().telegramBackupEnabled).toBe('1');}));
