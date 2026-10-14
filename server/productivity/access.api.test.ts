import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {it,expect,vi} from 'vitest';
const provider=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{models={generateContent:provider.generate};}}));
import {registerPushDelivery} from '../registerOutbox.js';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import * as db from '../db.js';
import * as media from '../media.js';
import {mediaKey} from '../mediaPolicy.js';
import {createAuth} from '../auth.js';
import {NativeSessionStore} from '../authStore.js';
import {createApp} from '../app.js';
import {syntheticDependencies} from '../../tests/app-fixture.js';
import {UserRole} from '../../src/types.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {createTaskCommands} from './tasks.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=','base64');
const command=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'productivity:http-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
let initialized=false;
function setup(){
 if(initialized)return;
 command(tx=>{tx.legacy.users=[...Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'})),{id:'other-child',username:'synthetic-other-child',fullName:'Synthetic other child',role:UserRole.CHILD,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}];tx.legacy.tasks=[];});
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 command(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;
}
async function fixture(work:(f:any)=>Promise<void>,grant?:'read'|'write'|'manage'){
 setup();const id=randomUUID(),sharedId=randomUUID(),url='/uploads/notes/'+id+'.png';
 fs.mkdirSync(path.join(media.UPLOADS_DIR,'notes'),{recursive:true});fs.writeFileSync(path.join(media.UPLOADS_DIR,url.slice(9)),png);
 command(tx=>{tx.legacy.tasks=[];tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER);if(grant)tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)','legacy-family',UserRole.MEMBER,grant);
 tx.run('INSERT OR REPLACE INTO app_meta VALUES(?,?)',mediaKey(url),JSON.stringify({version:1,ownerId:null,createdAt:0,bindings:[{domain:'tasks',id}]}));
 tx.legacy.tasks.push(legacyTask(id,{title:'P03 private child synthetic '+id,creatorId:'other-child',assigneeId:'other-child',isShared:false,proofImage:url,rotationMemberIds:[],sourceRecurringTaskId:null}),legacyTask(sharedId,{title:'P03 shared synthetic '+sharedId,creatorId:UserRole.ADMIN,assigneeId:null,isShared:true,proofImage:null,rotationMemberIds:[],sourceRecurringTaskId:null}));
 });media.initializeMediaMetadata();
 const connection=sqlite.sqliteConnection(),reader:TaskReader={get:(sql:string,...args:any[])=>connection.prepare(sql).get(...args),all:(sql:string,...args:any[])=>connection.prepare(sql).all(...args)};
 const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.sqlite=sqlite;deps.media=media;
 deps.productivity={active:()=>reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value==='1',access:createTaskAccess(reader),commands:createTaskCommands({write:gateway.withAppWriteTransaction,reader})};
 deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-p03-http-key'});
 const tokens=Object.fromEntries(db.FamilyDB.getUsers().map(user=>[user.id,deps.auth.issue(user)]));const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);
 const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');const streams:http.IncomingMessage[]=[];
 const send=(route:string,role:string|undefined=UserRole.ADMIN,body?:unknown,method?:string,requestId=randomUUID(),raw=false)=>new Promise<any>((resolve,reject)=>{
  const text=body===undefined?'':raw?String(body):JSON.stringify(body);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false,method:method??(body===undefined?'GET':'POST'),headers:{...(role?{Authorization:'Bearer '+tokens[role]}:{}),'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'x-request-id':requestId}},res=>{const chunks:Buffer[]=[];res.on('data',part=>chunks.push(part));res.on('end',()=>{const bytes=Buffer.concat(chunks),text=bytes.toString();let parsed;try{parsed=JSON.parse(text);}catch{}resolve({status:res.statusCode,body:parsed,text,bytes,headers:res.headers});});});req.on('error',reject);req.end(text);
 });
 const open=(role:string)=>new Promise<any>((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:(server.address() as any).port,path:'/api/realtime',agent:false,headers:{Authorization:'Bearer '+tokens[role]}},res=>{streams.push(res);const stream={text:'',status:res.statusCode};res.on('data',part=>stream.text+=String(part));resolve(stream);});req.on('error',reject);});
 try{await work({send,open,id,sharedId,url,deps,reader});}finally{streams.forEach(s=>s.destroy());handle.endStreams();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
it.each([UserRole.CHILD,UserRole.GUEST,UserRole.MEMBER])('private direct canonical and legacy GET remain404 for %s',role=>fixture(async({send,id}:any)=>{
 for(const route of ['/api/productivity/tasks/','/api/tasks/']){const privateResult=await send(route+id,role),missing=await send(route+'missing',role);expect(privateResult.status).toBe(404);expect(privateResult.body).toEqual(missing.body);expect(privateResult.text).not.toContain(id);}
}));
it('authenticates canonical routes and returns only intended DTO without storage provenance',()=>fixture(async({send,id}:any)=>{
 expect((await send('/api/productivity/tasks/'+id,null)).status).toBe(401);
 const result=await send('/api/productivity/tasks/'+id);expect(result.status).toBe(200);expect(result.body.task).toMatchObject({id,title:'P03 private child synthetic '+id});
 expect(result.body.task).not.toHaveProperty('legacy');expect(result.text).not.toContain('proofImage');expect(result.headers['cache-control']).toBe('no-store');
}));
it.each([UserRole.CHILD,UserRole.GUEST,UserRole.MEMBER])('shared read does not grant edit through either route: %s',role=>fixture(async({send,sharedId}:any)=>{
 const read=await send('/api/productivity/tasks/'+sharedId,role);expect(read.status).toBe(200);
 expect((await send('/api/productivity/tasks/'+sharedId,role,{expectedRevision:read.body.task.revision,patch:{title:'Denied'}},'PATCH')).status).toBe(403);
 expect((await send('/api/tasks',role,{id:sharedId,title:'Denied'})).status).toBe(403);
}));
it('read grant allows private read/media, but not edit/approve/reject/delete',()=>fixture(async({send,id,url}:any)=>{
 const read=await send('/api/productivity/tasks/'+id,UserRole.MEMBER);expect(read.status).toBe(200);expect((await send(url,UserRole.MEMBER)).status).toBe(200);
 expect((await send('/api/productivity/tasks/'+id,UserRole.MEMBER,{expectedRevision:read.body.task.revision,patch:{title:'Denied'}},'PATCH')).status).toBe(403);
 for(const suffix of ['/approve','/reject'])expect((await send('/api/tasks/'+id+suffix,UserRole.MEMBER,{})).status).toBe(403);
 expect((await send('/api/tasks/'+id,UserRole.MEMBER,{},'DELETE')).status).toBe(403);
},'read'));
it.each([UserRole.CHILD,UserRole.GUEST,UserRole.MEMBER])('private child task is absent from lists/count/search/media/export/notifications/rewards for %s',role=>fixture(async({send,id,url}:any)=>{
 const list=await send('/api/productivity/tasks',role);expect(list.status).toBe(200);expect(list.body.totalUnique).toBe(list.body.tasks.length);expect(list.text).not.toContain(id);
 const legacy=await send('/api/tasks',role);expect(legacy.status).toBe(200);expect(legacy.text).not.toContain(id);
 expect(JSON.stringify((await send('/api/search?q='+encodeURIComponent(id),role)).body.results)).not.toContain(id);expect((await send(url,role)).status).toBe(404);
 expect((await send('/api/admin/backups/full/export',role)).status).toBe(403);
 command(tx=>{tx.legacy.notifications.push({id:'notice-'+id,userId:role,type:'task',title:'Private '+id,content:'Private proof '+url,isRead:false,createdAt:'2026-10-10T00:00:00Z',sourceRef:{domain:'task',id}});tx.legacy.rewardLedger.push({id:'reward-'+id,userId:'other-child',points:1,reason:'Private '+id,taskId:id,createdAt:'2026-10-10T00:00:00Z'} as any);});
 expect((await send('/api/notifications',role)).text).not.toContain(id);expect((await send('/api/rewards',role)).text).not.toContain(id);
}));
it('keeps private invalidations audience-filtered and emits no task IDs/body/proof to SSE',()=>fixture(async({send,open,id}:any)=>{
 const child=await open(UserRole.CHILD),guest=await open(UserRole.GUEST),member=await open(UserRole.MEMBER),owner=await open('other-child');
 const row=await send('/api/productivity/tasks/'+id);
 expect((await send('/api/productivity/tasks/'+id,UserRole.ADMIN,{expectedRevision:row.body.task.revision,patch:{title:'Synthetic private event '+id}},'PATCH')).status).toBe(200);
 await new Promise(resolve=>setTimeout(resolve,30));expect(owner.text).toContain('TASKS_UPDATE');
 for(const stream of [child,guest,member])expect(stream.text).not.toContain('TASKS_UPDATE');
 for(const stream of [child,guest,member,owner]){expect(stream.text).not.toContain(id);expect(stream.text).not.toContain('Synthetic private event');expect(stream.text).not.toContain('proofImage');}
}));
it('creates no-date task, rejects forged fields, preserves legacy full-form edit and HTTP retry/conflict',()=>fixture(async({send}:any)=>{
 const requestId=randomUUID(),input={expectedRevision:0,input:{listId:'legacy-family',title:'Synthetic HTTP none',body:'x'.repeat(22000),priority:'none',due:{kind:'none'}}};
 const created=await send('/api/productivity/tasks',UserRole.CHILD,input,'POST',requestId);expect(created.status).toBe(200);
 expect((await send('/api/productivity/tasks',UserRole.CHILD,input,'POST',requestId)).body).toEqual(created.body);
 const id=created.body.task.id;const legacy=(await send('/api/tasks/'+id,UserRole.CHILD)).body.task;
 const edited=await send('/api/tasks',UserRole.CHILD,{...legacy,title:'Synthetic legacy form edit',baseUpdatedAt:legacy.updatedAt});expect(edited.status).toBe(200);
 const current=(await send('/api/productivity/tasks/'+id,UserRole.CHILD)).body.task;expect(current).toMatchObject({priority:'none',due:{kind:'none'}});
 expect((await send('/api/productivity/tasks/'+id,UserRole.CHILD,{expectedRevision:created.body.task.revision,patch:{title:'Stale'}},'PATCH')).status).toBe(409);
 for(const field of ['creatorId','rewardPoints','pendingApproval','comments','lifecycle'])expect((await send('/api/productivity/tasks/'+id,UserRole.CHILD,{expectedRevision:current.revision,patch:{[field]:'forged'}},'PATCH')).status).toBe(400);
 expect((await send('/api/productivity/tasks',UserRole.CHILD,{...input,input:{...input.input,creatorId:UserRole.ADMIN}})).status).toBe(400);
}));
it('binds new task Markdown media to task ACL and refuses copying private proof into another task',()=>fixture(async({send,url}:any)=>{
 const uploaded=await send('/api/uploads',UserRole.CHILD,{dataUrl:'data:image/png;base64,'+png.toString('base64'),category:'avatars'});expect(uploaded.status).toBe(200);
 const ownUrl=uploaded.body.url,created=await send('/api/productivity/tasks',UserRole.CHILD,{expectedRevision:0,input:{listId:'legacy-family',title:'Synthetic media task',body:'![Synthetic]('+ownUrl+')'}});expect(created.status).toBe(200);
 expect((await send(ownUrl,UserRole.CHILD)).status).toBe(200);expect((await send(ownUrl,UserRole.GUEST)).status).toBe(404);
 const metadata=command(tx=>JSON.parse(tx.get('SELECT value FROM app_meta WHERE key=?',mediaKey(ownUrl)).value));expect(metadata.bindings).toEqual([{domain:'tasks',id:created.body.task.id}]);
 expect((await send('/api/productivity/tasks',UserRole.CHILD,{expectedRevision:0,input:{listId:'legacy-family',title:'Synthetic stolen ref',body:'![Stolen]('+url+')',isShared:true}})).status).toBe(403);
}));
it('returns typed client errors and keeps revoked permission from cached HTTP command results',()=>fixture(async({send,id}:any)=>{
 const before=(await send('/api/productivity/tasks/'+id,UserRole.MEMBER)).body.task,requestId=randomUUID(),payload={expectedRevision:before.revision,patch:{title:'Synthetic granted edit'}};
 expect((await send('/api/productivity/tasks/'+id,UserRole.MEMBER,payload,'PATCH',requestId)).status).toBe(200);
 command(tx=>tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER));
 expect((await send('/api/productivity/tasks/'+id,UserRole.MEMBER,payload,'PATCH',requestId)).status).toBe(404);
 const current=(await send('/api/productivity/tasks/'+id)).body.task;
 expect((await send('/api/productivity/tasks/'+id,UserRole.ADMIN,{expectedRevision:current.revision,patch:{assigneeId:'missing'}},'PATCH')).status).toBe(422);
 expect((await send('/api/productivity/tasks/'+id,UserRole.ADMIN,{actor:{userId:'forged'},expectedRevision:current.revision,patch:{title:'Denied'}},'PATCH')).status).toBe(400);
 expect((await send('/api/productivity/tasks',UserRole.ADMIN,{expectedRevision:0,input:{listId:'legacy-family',title:'Synthetic null',body:null}})).status).toBe(400);
},'write'));
it('preserves private Child submit/Admin approve and hides both task and reward invalidation from nonreaders',()=>fixture(async({send,open,id}:any)=>{
 db.setAppSetting('rewardApprovalThreshold','0');const owner=await open('other-child'),others=await Promise.all([UserRole.CHILD,UserRole.GUEST,UserRole.MEMBER].map(role=>open(role)));
 const submitted=await send('/api/tasks','other-child',{id,status:'completed',proofNote:'Synthetic private proof'});expect(submitted.status).toBe(200);expect(submitted.body.task.pendingApproval).toBe(true);
 expect((await send('/api/tasks/'+id+'/approve',UserRole.MEMBER,{})).status).toBe(404);
 expect((await send('/api/tasks/'+id+'/approve',UserRole.ADMIN,{})).status).toBe(200);
 const deadline=Date.now()+1000;while(!owner.text.includes('REWARDS_UPDATE')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 expect(owner.text).toContain('TASKS_UPDATE');expect(owner.text).toContain('REWARDS_UPDATE');
 for(const stream of others){expect(stream.text).not.toContain('TASKS_UPDATE');expect(stream.text).not.toContain('REWARDS_UPDATE');expect(stream.text).not.toContain(id);}
 expect(db.FamilyDB.getRewardLedger().filter(row=>row.taskId===id).map(row=>row.points)).toEqual([7]);
}));
it('invalidates a prior assignee once after a semantic reassignment without revealing later private edits',()=>fixture(async({send,open}:any)=>{
 const task=db.FamilyDB.saveTask({title:'Synthetic reassigned private',assigneeId:UserRole.CHILD,isShared:false},UserRole.ADMIN,'synthetic-admin');
 const child=await open(UserRole.CHILD),next=await open('other-child'),before=(await send('/api/productivity/tasks/'+task.id)).body.task;
 const changed=await send('/api/productivity/tasks/'+task.id,UserRole.ADMIN,{expectedRevision:before.revision,patch:{assigneeId:'other-child'}},'PATCH');expect(changed.status).toBe(200);
 expect((await send('/api/productivity/tasks/'+task.id,UserRole.ADMIN,{expectedRevision:changed.body.task.revision,patch:{title:'Synthetic later private'}},'PATCH')).status).toBe(200);
 await new Promise(resolve=>setTimeout(resolve,30));expect(child.text.match(/TASKS_UPDATE/g)).toHaveLength(1);expect(next.text.match(/TASKS_UPDATE/g)).toHaveLength(2);
 expect(child.text).not.toContain(task.id);expect(child.text).not.toContain('Synthetic later private');expect((await send('/api/productivity/tasks/'+task.id,UserRole.CHILD)).status).toBe(404);
}));

it('filters private tasks from the offline assistant context and rechecks queued push against current grants',()=>fixture(async({send,id}:any)=>{
 db.setAppSetting('geminiApiKey','synthetic-p03-never-used');provider.generate.mockReset().mockResolvedValue({text:'{"reply":"Synthetic reply","actions":[]}'});
 expect((await send('/api/assistant/chat',UserRole.MEMBER,{message:'Synthetic scheduling advice'})).status).toBe(200);
 expect(provider.generate).toHaveBeenCalledOnce();expect(provider.generate.mock.calls[0][0].contents).not.toContain(id);
 const endpoint='https://push.invalid/synthetic/'+randomUUID(),notice=randomUUID();db.FamilyDB.addPushSubscription(UserRole.MEMBER,{endpoint,keys:{p256dh:'synthetic',auth:'synthetic'}},'synthetic-member');
 command(tx=>tx.legacy.notifications.push({id:notice,userId:UserRole.MEMBER,type:'task',title:'Private '+id,content:'Private synthetic',isRead:false,createdAt:'2026-10-10T00:00:00Z',sourceRef:{domain:'task',id}}));
 let deliver:any;const sendQueuedNotification=vi.fn().mockResolvedValue('sent');
 registerPushDelivery({durableEnabled:true,registerAppJob:(_ns:string,_type:string,handler:any)=>{deliver=handler;}} as any,db.FamilyDB,{sendQueuedNotification} as any);
 const job={payload:{notificationId:notice,endpoint,userId:UserRole.MEMBER}};await deliver(new AbortController().signal,job);expect(sendQueuedNotification).not.toHaveBeenCalled();
 command(tx=>tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)','legacy-family',UserRole.MEMBER,'read'));
 await deliver(new AbortController().signal,job);expect(sendQueuedNotification).toHaveBeenCalledOnce();
 command(tx=>tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER));await deliver(new AbortController().signal,job);expect(sendQueuedNotification).toHaveBeenCalledTimes(1);
}));
it('private and missing legacy delete have the same404 on an active canonical installation',()=>fixture(async({send,id}:any)=>{
 const hidden=await send('/api/tasks/'+id,UserRole.MEMBER,{},'DELETE'),missing=await send('/api/tasks/missing',UserRole.MEMBER,{},'DELETE');
 expect(hidden.status).toBe(404);expect(missing.status).toBe(404);expect(hidden.body).toEqual(missing.body);
}));

it('returns400 for malformed task JSON without logging private payload/proof bytes',()=>fixture(async({send}:any)=>{
 const logging=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{const result=await send('/api/productivity/tasks',UserRole.CHILD,'{"proofNote":"synthetic-P03-private-proof", bad}','POST',randomUUID(),true);
 expect(result.status).toBe(400);expect(result.text).not.toContain('synthetic-P03-private-proof');expect(JSON.stringify(logging.mock.calls)).not.toContain('synthetic-P03-private-proof');}
 finally{logging.mockRestore();}
}));

it.each(['approve','reject','save','comment'])('revoked permission prevents cached legacy %s results without repeating effects',operation=>fixture(async({send,id}:any)=>{
 db.setAppSetting('rewardApprovalThreshold','0');
 if(operation==='approve'||operation==='reject'){
  const submitted=await send('/api/tasks','other-child',{id,status:'completed',proofNote:'Synthetic cache private proof'});expect(submitted.status).toBe(200);expect(submitted.body.task.pendingApproval).toBe(true);
 }
 const route=operation==='save'?'/api/tasks':'/api/tasks/'+id+(operation==='comment'?'/comments':'/'+operation),payload=operation==='save'?{id,title:'Synthetic legacy cache edit'}:operation==='comment'?{content:'Synthetic reader discussion'}:operation==='reject'?{reason:'Synthetic retry rejection'}:{};
 const requestId=randomUUID(),first=await send(route,UserRole.MEMBER,payload,'POST',requestId);expect(first.status).toBe(200);
 expect((await send(route,UserRole.MEMBER,payload,'POST',requestId)).body).toEqual(first.body);
 const stored=JSON.stringify(db.FamilyDB.getTasks().find(task=>task.id===id)),rewards=JSON.stringify(db.FamilyDB.getRewardLedger());
 command(tx=>tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER));
 const replay=await send(route,UserRole.MEMBER,payload,'POST',requestId);expect(replay.status).toBe(404);expect(replay.text).not.toContain(id);expect(replay.text).not.toContain('Synthetic cache private proof');
 expect(JSON.stringify(db.FamilyDB.getTasks().find(task=>task.id===id))).toBe(stored);expect(JSON.stringify(db.FamilyDB.getRewardLedger())).toBe(rewards);
},'manage'));
it.each(['approve','reject'])('active legacy %s masks unknown and private tasks identically',operation=>fixture(async({send,id}:any)=>{
 const hidden=await send('/api/tasks/'+id+'/'+operation,UserRole.MEMBER,{}),missing=await send('/api/tasks/missing/'+operation,UserRole.MEMBER,{});
 expect(hidden.status).toBe(404);expect(missing.status).toBe(404);expect(hidden.body).toEqual(missing.body);
}));
it('recurring Markdown media survives approval, rotation and retry without allowing foreign copies',()=>fixture(async({send,id,url}:any)=>{
 db.setAppSetting('rewardApprovalThreshold','0');
 const uploaded=await send('/api/uploads','other-child',{dataUrl:'data:image/png;base64,'+png.toString('base64'),category:'avatars'});expect(uploaded.status).toBe(200);const image=uploaded.body.url;
 const created=await send('/api/productivity/tasks','other-child',{expectedRevision:0,input:{listId:'legacy-family',title:'Synthetic recurring image',body:'![Recurring]('+image+')',due:{kind:'all_day',date:'2026-10-14',timezone:'Asia/Ho_Chi_Minh'},assigneeId:'other-child'}});expect(created.status).toBe(200);const source=created.body.task.id;
 expect((await send('/api/tasks',UserRole.ADMIN,{id:source,recurrenceType:'daily',rotationMemberIds:['other-child',UserRole.CHILD],rewardPoints:7})).status).toBe(200);
 const submitted=await send('/api/tasks','other-child',{id:source,status:'completed',proofNote:'Synthetic recurring proof'});expect(submitted.status).toBe(200);expect(submitted.body.task.pendingApproval).toBe(true);
 const requestId=randomUUID(),approved=await send('/api/tasks/'+source+'/approve',UserRole.ADMIN,{},'POST',requestId);expect(approved.status).toBe(200);expect(approved.body.task.status).toBe('completed');
 const successors=db.FamilyDB.getTasks().filter(task=>task.sourceRecurringTaskId===source);expect(successors).toHaveLength(1);const next=successors[0];
 expect(next).toMatchObject({status:'todo',description:'![Recurring]('+image+')',assigneeId:UserRole.CHILD,proofImage:null,proofNote:null,pendingApproval:false});expect(next.dueDate).toContain('2026-10-15');
 expect((await send('/api/tasks/'+source+'/approve',UserRole.ADMIN,{},'POST',requestId)).body).toEqual(approved.body);expect(db.FamilyDB.getTasks().filter(task=>task.sourceRecurringTaskId===source)).toHaveLength(1);
 expect(db.FamilyDB.getRewardLedger().filter(row=>row.taskId===source).map(row=>row.points)).toEqual([7]);
 const bindings=command(tx=>JSON.parse(tx.get('SELECT value FROM app_meta WHERE key=?',mediaKey(image)).value).bindings);expect(bindings).toEqual(expect.arrayContaining([{domain:'tasks',id:source},{domain:'tasks',id:next.id}]));expect(bindings).toHaveLength(2);
 expect((await send(image,UserRole.CHILD)).status).toBe(200);expect((await send(image,UserRole.GUEST)).status).toBe(404);
 const count=db.FamilyDB.getTasks().length;expect((await send('/api/productivity/tasks',UserRole.CHILD,{expectedRevision:0,input:{listId:'legacy-family',title:'Forbidden copied recurring image',body:'![Copied]('+image+')'}})).status).toBe(403);
 expect((await send('/api/tasks',UserRole.ADMIN,{id:next.id,description:'![Foreign]('+url+')',sourceRecurringTaskId:id})).status).toBe(403);expect(db.FamilyDB.getTasks()).toHaveLength(count);expect(db.FamilyDB.getTasks().find(task=>task.id===next.id)?.description).toBe(next.description);
}));
it('read-grant Member keeps existing semantic comments without generic edit permission',()=>fixture(async({send,id}:any)=>{
 const commented=await send('/api/tasks/'+id+'/comments',UserRole.MEMBER,{content:'Synthetic read-only discussion'});expect(commented.status).toBe(200);expect(commented.body.task.comments.at(-1)).toMatchObject({userId:UserRole.MEMBER,content:'Synthetic read-only discussion'});
 expect((await send('/api/tasks',UserRole.MEMBER,{id,title:'Forbidden field edit'})).status).toBe(403);
},'read'));

it('each HTTP fixture contains only its own live tasks, independent of earlier scenarios',()=>fixture(async({id,sharedId}:any)=>{
 expect(db.FamilyDB.getTasks().map(task=>task.id).sort()).toEqual([id,sharedId].sort());
}));
