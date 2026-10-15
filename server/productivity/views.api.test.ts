import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import * as db from '../db.js';
import {createAuth} from '../auth.js';
import {NativeSessionStore} from '../authStore.js';
import {createApp} from '../app.js';
import {syntheticDependencies} from '../../tests/app-fixture.js';
import {UserRole,TaskStatus} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createProductivityPorts} from './ports.js';
import {createTaskCommands} from './tasks.js';
import {createStructureCommands} from './structure.js';
import type {TaskReader} from './access.js';
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:views-http',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const reader:TaskReader={get:(sql,...args)=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql,...args)=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction}),structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction});
const ctx=(role=UserRole.ADMIN,revision=0)=>({actor:{userId:role,role},expectedRevision:revision,requestId:randomUUID()});
let initialized=false;
async function fixture(work:(f:any)=>Promise<void>){
 if(!initialized){write(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;}
 write(tx=>{tx.legacy.tasks=[];tx.run('DELETE FROM productivity_tasks WHERE deleted_at IS NOT NULL');tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER);tx.run('DELETE FROM productivity_views');});
 write(tx=>tx.run('DELETE FROM productivity_tasks WHERE deleted_at IS NOT NULL'));
 const board=structure.saveList(ctx(),{title:'Synthetic private query board',isShared:false}),privateTask=tasks.createTask(ctx(),{listId:board.id,title:'Đưa đón trẻ riêng tư'}),shared=[0,1,2].map(n=>tasks.createTask(ctx(),{listId:'legacy-family',title:'Đưa đón trẻ chung '+n,isShared:true}));
 let now=Date.parse('2026-10-15T01:00:00Z');
 const deps:any=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.sqlite=sqlite;deps.productivity=(createProductivityPorts as any)(sqlite,gateway,{queryNow:()=>now,queryPageSize:2,querySelectionBudget:{references:2,rows:100,bytes:100000}});deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-query-session-key'});
 const tokens=Object.fromEntries(db.FamilyDB.getUsers().map(user=>[user.id,deps.auth.issue(user)])),handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!}as any,deps),server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');const streams:http.IncomingMessage[]=[];
 const send=(route:string,role:string|null=UserRole.ADMIN,body?:unknown,requestId=randomUUID(),method?:string)=>new Promise<any>((resolve,reject)=>{
  const text=body===undefined?'':JSON.stringify(body);let size=0;const req=http.request({hostname:'127.0.0.1',port:(server.address()as any).port,path:'/api/productivity'+route,agent:false,method:method??(body===undefined?'GET':'POST'),headers:{...(role?{Authorization:'Bearer '+tokens[role]}:{}),'content-type':'application/json','content-length':Buffer.byteLength(text),'x-request-id':requestId}},res=>{const chunks:Buffer[]=[];res.on('data',part=>{size+=part.length;if(size>2*1024*1024)res.destroy(Error('Synthetic response budget'));else chunks.push(part);});res.on('error',reject);res.on('aborted',()=>reject(Error('Synthetic response aborted')));res.on('end',()=>{const text=Buffer.concat(chunks).toString();let body;try{body=JSON.parse(text);}catch{}resolve({status:res.statusCode,body,text,headers:res.headers});});});const deadline=setTimeout(()=>req.destroy(Error('Synthetic absolute HTTP deadline')),5000);req.once('close',()=>clearTimeout(deadline));req.setTimeout(3000,()=>req.destroy(Error('Synthetic HTTP timeout')));req.on('error',reject);req.end(text);
 });
 const open=(role:string)=>new Promise<any>((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:(server.address()as any).port,path:'/api/realtime',agent:false,headers:{Authorization:'Bearer '+tokens[role]}},res=>{streams.push(res);const stream={text:''};res.on('data',part=>stream.text+=String(part));resolve(stream);});req.on('error',reject);});
 try{await work({send,open,board,privateTask,shared,setNow:(value:number)=>now=value,deps});}finally{streams.forEach(s=>s.destroy());handle.endStreams();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
const filter={rootsOnly:true,query:'dua don tre'},timezone='Asia/Saigon';
it('authenticates query reads and rejects client-owned clocks and actor overrides',()=>fixture(async({send,deps}:any)=>{
 expect((await send('/query',null,{filter,timezone})).status).toBe(401);
 for(const extra of [{nowUtc:'1900-01-01T00:00:00Z'},{actor:{userId:'admin',role:'admin'}},{expiresAt:'9999-01-01T00:00:00Z'}])expect((await send('/query',UserRole.MEMBER,{filter,timezone,...extra})).status).toBe(400);
 deps.productivity.active=()=>false;expect((await send('/query',UserRole.ADMIN,{filter,timezone})).status).toBe(409);
}));
it.each([UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST])('query SQL excludes private hits/count and keeps Vietnamese search for %s',role=>fixture(async({send,privateTask}:any)=>{
 const result=await send('/query',role,{filter,timezone});expect(result.status).toBe(200);expect(result.body.totalUnique).toBe(3);expect(result.body.items).toHaveLength(2);expect(result.text).not.toContain(privateTask.id);expect(result.text).not.toContain(privateTask.title);expect(result.headers['cache-control']).toBe('no-store');
}));
it('keeps one server clock across pages and owner-only opaque sessions',()=>fixture(async({send,setNow,shared}:any)=>{
 const first=await send('/query',UserRole.MEMBER,{filter,timezone});expect(first.status).toBe(200);expect(first.body.clock).toEqual({nowUtc:'2026-10-15T01:00:00.000Z',timezone});expect(first.body.nextCursor).toEqual(expect.any(String));setNow(Date.parse('2026-10-15T01:01:00Z'));
 expect((await send('/query',UserRole.CHILD,{queryId:first.body.queryId,cursor:first.body.nextCursor})).status).toBe(404);
 const next=await send('/query',UserRole.MEMBER,{queryId:first.body.queryId,cursor:first.body.nextCursor});expect(next.status).toBe(200);expect(next.body.clock).toEqual(first.body.clock);expect(next.body.nextCursor).toBeNull();expect([...first.body.items,...next.body.items].map((row:any)=>row.id).sort()).toEqual(shared.map((row:any)=>row.id).sort());
 expect((await send('/query',UserRole.MEMBER,{queryId:first.body.queryId,cursor:first.body.nextCursor,filter:{rootsOnly:true}})).status).toBe(400);
 setNow(Date.parse('2026-10-15T01:15:00Z'));expect((await send('/query',UserRole.MEMBER,{queryId:first.body.queryId,cursor:first.body.nextCursor})).status).toBe(409);
}));
it('revalidates query grant and selection revisions on each use',()=>fixture(async({send,board,privateTask}:any)=>{
 write(tx=>tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)',board.id,UserRole.MEMBER,'read'));const first=await send('/query',UserRole.MEMBER,{filter,timezone});expect(first.status).toBe(200);expect(first.body.totalUnique).toBe(4);
 const selected=await send('/query/'+first.body.queryId+'/selection',UserRole.MEMBER,{});expect(selected.status).toBe(200);expect(new Set(selected.body.taskIds).size).toBe(4);expect(selected.body.taskIds).toContain(privateTask.id);
 expect((await send('/selections/'+selected.body.id+'/resolve',UserRole.CHILD,{})).status).toBe(404);
 const resolved=await send('/selections/'+selected.body.id+'/resolve',UserRole.MEMBER,{});expect(resolved.status).toBe(200);expect(resolved.body.rows).toHaveLength(4);
 write(tx=>tx.run('DELETE FROM productivity_list_grants WHERE list_id=? AND user_id=?',board.id,UserRole.MEMBER));expect((await send('/query',UserRole.MEMBER,{queryId:first.body.queryId,cursor:first.body.nextCursor})).status).toBe(409);expect((await send('/selections/'+selected.body.id+'/resolve',UserRole.MEMBER,{})).status).toBe(409);
}));
it('saved configuration is private, revisioned, retryable and emits actor-only metadata',()=>fixture(async({send,open}:any)=>{
 const member=await open(UserRole.MEMBER),admin=await open(UserRole.ADMIN),guest=await open(UserRole.GUEST),key=randomUUID(),body={expectedRevision:0,input:{title:'Synthetic private saved title',filter,kind:'list',config:{kind:'list',sort:'rank',group:'none'}}};
 const saved=await send('/views',UserRole.MEMBER,body,key);expect(saved.status).toBe(200);expect(saved.body.view).toMatchObject({ownerId:UserRole.MEMBER,revision:1,title:body.input.title});expect((await send('/views',UserRole.MEMBER,body,key)).body).toEqual(saved.body);
 expect((await send('/views/'+saved.body.view.id,UserRole.ADMIN)).status).toBe(404);expect((await send('/views',UserRole.GUEST,body)).status).toBe(403);expect((await send('/views',UserRole.MEMBER,{...body,input:{...body.input,id:saved.body.view.id}})).status).toBe(409);
 expect((await send('/views',UserRole.MEMBER)).body.views.map((row:any)=>row.id)).toEqual([saved.body.view.id]);expect((await send('/views',UserRole.ADMIN)).body.views).toEqual([]);
 await new Promise(resolve=>setTimeout(resolve,30));expect(member.text).toContain('PRODUCTIVITY_VIEW_UPDATE');for(const stream of [admin,guest])expect(stream.text).not.toContain('PRODUCTIVITY_VIEW_UPDATE');for(const stream of [member,admin,guest]){expect(stream.text).not.toContain(saved.body.view.id);expect(stream.text).not.toContain(body.input.title);expect(stream.text).not.toContain('dua don tre');}
}));
it('Trash detail is authorized and read-only while ordinary task writes remain unavailable',()=>fixture(async({send,privateTask}:any)=>{
 write(tx=>tx.run('UPDATE productivity_tasks SET deleted_at=? WHERE id=?','2026-10-15T00:30:00Z',privateTask.id));
 const result=await send('/query',UserRole.ADMIN,{smart:'trash',timezone});expect(result.status).toBe(200);expect(result.body.items.map((row:any)=>row.id)).toEqual([privateTask.id]);
 const detail=await send('/query/tasks/'+privateTask.id);expect(detail.status).toBe(200);expect(detail.body.task.deletedAt).toBe('2026-10-15T00:30:00Z');expect(detail.body.readOnly).toBe(true);
 expect((await send('/query/tasks/'+privateTask.id,UserRole.MEMBER)).status).toBe(404);expect((await send('/tasks/'+privateTask.id)).status).toBe(404);expect((await send('/tasks/'+privateTask.id,UserRole.ADMIN,{expectedRevision:privateTask.revision,patch:{title:'Forbidden deleted edit'}},randomUUID(),'PATCH')).status).toBe(404);
}));
it('ordinary canonical DTO preserves the validated completion reference used by query filters',()=>fixture(async({send,shared}:any)=>{
 write(tx=>{const row=tx.legacy.tasks.find(row=>row.id===shared[0].id)!;row.status=TaskStatus.COMPLETED;row.completedAt='2026-10-14T01:00:00Z';});
 const detail=await send('/tasks/'+shared[0].id);expect(detail.status).toBe(200);expect(detail.body.task.completedReferenceAt).toBe('2026-10-14T01:00:00.000Z');expect(detail.body.task).not.toHaveProperty('legacy');expect(detail.body.task).not.toHaveProperty('rank');
}));

it('selection HTTP enforces finite admission and keeps recent expiry identity private',()=>fixture(async({send,setNow}:any)=>{
 const page=await send('/query',UserRole.MEMBER,{filter,timezone});expect(page.status).toBe(200);const first=await send('/query/'+page.body.queryId+'/selection',UserRole.MEMBER,{});expect(first.status).toBe(200);expect((await send('/query/'+page.body.queryId+'/selection',UserRole.MEMBER,{})).status).toBe(200);expect((await send('/query/'+page.body.queryId+'/selection',UserRole.MEMBER,{})).status).toBe(429);
 setNow(Date.parse('2026-10-15T01:15:00Z'));expect((await send('/selections/'+first.body.id+'/resolve',UserRole.MEMBER,{})).status).toBe(409);expect((await send('/selections/'+first.body.id+'/resolve',UserRole.CHILD,{})).status).toBe(404);
}));
it('refines a smart view without replacing its assignee scope or lifecycle',()=>fixture(async({send}:any)=>{
 tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic assigned member',assigneeId:UserRole.MEMBER});tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic assigned admin',assigneeId:UserRole.ADMIN});
 const inbox=await send('/query',UserRole.MEMBER,{smart:'inbox',refine:{query:'dua don tre',priority:['none']},timezone});expect(inbox.status).toBe(200);expect(inbox.body.totalUnique).toBe(3);
 const assigned=await send('/query',UserRole.ADMIN,{smart:'assigned',refine:{assigneeIds:[UserRole.MEMBER]},timezone});expect(assigned.status).toBe(200);expect(assigned.body.totalUnique).toBe(0);
 for(const refine of [{includeTrash:true},{lifecycle:['completed']},{rootsOnly:false}])expect((await send('/query',UserRole.MEMBER,{smart:'inbox',refine,timezone})).status).toBe(400);
}));
