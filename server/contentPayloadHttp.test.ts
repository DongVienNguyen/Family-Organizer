import http from 'node:http';
import {once} from 'node:events';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createApp} from './app.js';
import {createAuth} from './auth.js';
import {NativeSessionStore} from './authStore.js';
import * as db from './db.js';
import {sqliteLoad,sqliteSave,sqliteConnection} from './sqlite.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';
async function fixture(work:(send:(route:string,role:UserRole,payload?:any)=>Promise<any>,task:any)=>Promise<void>){
 const state=sqliteLoad();state.users=Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic',avatarColor:'bg-slate-500',createdAt:'2026-10-11T00:00:00Z'}));state.tasks=[];state.rewardLedger=[];state.notes=[];state.plans=[];state.documents=[];state.notifications=[];sqliteSave(state);db.setAppSetting('rewardApprovalThreshold','0');
 const task=db.FamilyDB.saveNote({title:'Synthetic delegated note',content:'Synthetic',isShared:true,allowedRolesToEdit:[UserRole.GUEST]},UserRole.ADMIN,'synthetic-admin');
 const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-content-key'});
 const tokens=Object.fromEntries(state.users.map(user=>[user.role,deps.auth.issue(user)]));const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const send=(route:string,role:UserRole,payload?:any)=>new Promise<any>((resolve,reject)=>{const text=payload===undefined?'':JSON.stringify(payload);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false,method:payload===undefined?'GET':'POST',headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'x-request-id':randomUUID()}},res=>{let body='';res.on('data',part=>{body+=part;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});req.on('error',reject);req.end(text);});
 try{await work(send,task);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
for(const [route,payload] of [['/api/notes',[]],['/api/plans',[]],['/api/notes',{content:42}],['/api/plans',{title:'Synthetic malformed',recurrenceWeekdays:[9]}],['/api/documents',{title:'Synthetic malformed',type:'other',files:'forged'}]] as const)it('rejects malformed content HTTP '+route+' '+JSON.stringify(payload),()=>fixture(async send=>{const before=sqliteLoad();expect((await send(route,UserRole.ADMIN,payload)).status).toBe(400);expect(sqliteLoad()).toEqual(before);}));
for(const [field,value] of [['creatorId',UserRole.GUEST],['isShared',false],['allowedRolesToEdit',[UserRole.ADMIN,UserRole.MEMBER,UserRole.GUEST]]] as const)it('denies Guest content-editor '+field+' forgery over HTTP',()=>fixture(async(send,note)=>{const before=sqliteLoad();expect((await send('/api/notes',UserRole.GUEST,{id:note.id,[field]:value})).status).toBe(403);expect(sqliteLoad()).toEqual(before);}));
it('preserves Guest HTTP note edit grant without changing privacy or ownership',()=>fixture(async(send,note)=>{const response=await send('/api/notes',UserRole.GUEST,{id:note.id,content:'Synthetic authorized edit'});expect(response.status).toBe(200);expect(response.body.note).toMatchObject({content:'Synthetic authorized edit',isShared:true,creatorId:UserRole.ADMIN,allowedRolesToEdit:[UserRole.GUEST]});}));
it('preserves note full DTO updates and genuine stale409 after protected fields are stripped',()=>fixture(async(send,note)=>{const state=sqliteLoad();state.notes.find(n=>n.id===note.id)!.updatedAt='2026-01-01T00:00:00Z';sqliteSave(state);const current=db.FamilyDB.getNotes().find(n=>n.id===note.id)!;const response=await send('/api/notes',UserRole.ADMIN,{...current,title:'Synthetic owner updated',baseUpdatedAt:current.updatedAt});expect(response.status).toBe(200);const stale=await send('/api/notes',UserRole.ADMIN,{...current,title:'Synthetic stale',baseUpdatedAt:current.updatedAt});expect(stale.status).toBe(409);expect(stale.body.conflict).toBe(true);}));
