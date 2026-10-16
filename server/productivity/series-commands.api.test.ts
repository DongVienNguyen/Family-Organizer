import http from 'node:http';
import Database from 'better-sqlite3';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,expect,it} from 'vitest';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshots from '../appSnapshot.js';
import * as db from '../db.js';
import {createApp} from '../app.js';
import {createAuth} from '../auth.js';
import {NativeSessionStore} from '../authStore.js';
import {syntheticDependencies} from '../../tests/app-fixture.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {registerBoardMigration} from './boardMigration.js';
import {registerBoardViewMigration} from './boardViewSchema.js';
import {registerGroupedViewMigration} from './groupViewSchema.js';
import {registerOccurrenceMigration} from './occurrenceSchema.js';
import {registerOccurrenceSkipMigration} from './occurrenceSkipSchema.js';
import {registerSeriesMigration} from './seriesSchema.js';
import {createRecurrenceSeriesStore} from './seriesStore.js';
import {createTaskCommands} from './tasks.js';
import {createProductivityPorts} from './ports.js';
import {configureWalletStorage} from '../wallet/integration.js';
import {openWalletStore} from '../wallet/store.js';

const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args)as any,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)as any[]};
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:preview-http',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const ctx=(revision=0)=>({actor:{userId:UserRole.ADMIN,role:UserRole.ADMIN},requestId:randomUUID(),expectedRevision:revision});
const tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction}),store=createRecurrenceSeriesStore({reader,write:gateway.withAppWriteTransaction});
const policy={timezone:'Asia/Saigon',base:'due',cadence:{kind:'calendar',frequency:'monthly',interval:1,invalidDate:'clamp'},end:{kind:'count',count:4},missed:'skip',rotationMembers:[UserRole.CHILD,UserRole.MEMBER]};
let server:http.Server,handle:Awaited<ReturnType<typeof createApp>>,auth:ReturnType<typeof createAuth>,tokens:Record<string,string>,deps:any;
beforeAll(async()=>{
 write(tx=>{tx.legacy.tasks=[];tx.legacy.rewardLedger=[];tx.legacy.notifications=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));});
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot:snapshots});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));
 registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerBoardViewMigration(migrations.registerDomainMigration);registerGroupedViewMigration(migrations.registerDomainMigration);registerSeriesMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerOccurrenceMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerOccurrenceSkipMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 configureWalletStorage({migrations,snapshot:snapshots});migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});
 openWalletStore({write:gateway.withAppWriteTransaction}).transaction({actorId:UserRole.ADMIN,command:'wallet:synthetic:preview-control',requestId:randomUUID(),payloadHash:'synthetic'},tx=>{tx.accounts.insert({id:'synthetic-preview-wallet-account',name:'Synthetic private finance',type:'bank',currency:'VND',ownerUserId:UserRole.ADMIN,accessMode:'private',openingMinor:'1000',openingDate:'2026-10-16',revision:1});tx.records.insert({id:'synthetic-preview-wallet-record',kind:'expense',effectiveDate:'2026-10-16',timezone:'Asia/Saigon',source:'manual',note:'Synthetic retained record',settlementStatus:'uncleared',creatorId:UserRole.ADMIN,revision:1});tx.postings.insert({recordId:'synthetic-preview-wallet-record',accountId:'synthetic-preview-wallet-account',deltaMinor:'-500'});});
 deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.sqlite=sqlite;deps.productivity=createProductivityPorts(sqlite,gateway,{legacyCompletion:db.FamilyDB});auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-preview-http-secret'});deps.auth=auth;tokens=Object.fromEntries(db.FamilyDB.getUsers().map(user=>[user.id,auth.issue(user)]));handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!}as any,deps);server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
});
afterAll(async()=>{if(server){handle.endStreams();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}});
const send=(route:string,role:string|null=UserRole.ADMIN,body?:unknown,requestId=randomUUID())=>new Promise<any>((resolve,reject)=>{
 const data=body===undefined?'':JSON.stringify(body),request=http.request({hostname:'127.0.0.1',port:(server.address()as any).port,path:'/api/productivity/tasks'+route,method:body===undefined?'GET':'POST',agent:false,headers:{...(role?{authorization:'Bearer '+tokens[role]}:{}),'content-type':'application/json','content-length':Buffer.byteLength(data),'x-request-id':requestId}},response=>{const chunks:Buffer[]=[];let size=0;response.on('data',part=>{size+=part.length;if(size>1024*1024)response.destroy(Error('Synthetic preview response budget'));else chunks.push(part);});response.on('error',reject);response.on('end',()=>{const text=Buffer.concat(chunks).toString();let body;try{body=JSON.parse(text);}catch{}resolve({status:response.statusCode,body,text,headers:response.headers});});});request.on('error',reject);request.end(data);
});
function fixture(shared=true){const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic preview HTTP '+randomUUID(),due:{kind:'all_day',date:'2027-01-31',timezone:'Asia/Saigon'},isShared:shared,assigneeId:UserRole.CHILD});return {task,series:store.create(ctx(task.revision),task.id,policy)};}
const route=(id:string)=>'/'+id+'/preview?from=2027-02-01&toExclusive=2027-05-01';
const rows=()=>Object.fromEntries(['productivity_tasks','productivity_series','productivity_series_exceptions','productivity_occurrences','productivity_series_occurrences','productivity_occurrence_skips','app_commands','reward_ledger','notifications','wallet_accounts','wallet_records','wallet_postings'].map(table=>[table,reader.all('SELECT * FROM '+table)]));

it('authenticated skip commits one stopped source and clean successor with zero points or accepted rotation, and replays exactly once',async()=>{
 const f=fixture(),request=randomUUID(),body={expectedRevision:f.task.revision,input:{expectedSeriesRevision:1}},ledger=rows().reward_ledger;
 const first=await send('/occurrences/'+f.task.id+'/skip',UserRole.ADMIN,body,request);expect(first.status,first.text).toBe(200);expect(first.body).toMatchObject({task:{id:f.task.id,lifecycle:'wont_do'},actualColumn:'wont_do',approvalNeeded:false});expect(first.body.spawnedTaskIds).toHaveLength(1);expect((await send('/occurrences/'+f.task.id+'/skip',UserRole.ADMIN,body,request)).body).toEqual(first.body);expect(rows().reward_ledger).toEqual(ledger);expect(store.get(ctx().actor,f.series.id)).toMatchObject({acceptedCount:0,rotationCursor:0,nextOrdinal:2});expect(first.headers['cache-control']).toContain('no-store');
});
it('authenticated scoped edits preserve current work for future scope and apply only explicit current deadlines',async()=>{
 const f=fixture(),future=await send('/series/'+f.series.id+'/edit',UserRole.ADMIN,{expectedRevision:1,scope:'future',patch:{policy:{...policy,missed:'latest'}}});expect(future.status,future.text).toBe(200);expect(future.body.series).toMatchObject({revision:2,policy:{missed:'latest'}});expect(future.body.changedTaskIds).toEqual([]);expect(deps.productivity.access.getTask(ctx().actor,f.task.id).due).toEqual(f.task.due);
 const edited=await send('/series/'+f.series.id+'/edit',UserRole.ADMIN,{expectedRevision:2,scope:'this',patch:{ordinal:0,expectedTaskRevision:f.task.revision,due:{kind:'none'}}});expect(edited.status,edited.text).toBe(200);expect(edited.body.changedTaskIds).toEqual([f.task.id]);expect(edited.body.series).toMatchObject({revision:3,anchor:f.task.due});expect(deps.productivity.access.getTask(ctx().actor,f.task.id).due).toEqual({kind:'none'});
});
it.each([null,UserRole.CHILD,UserRole.GUEST])('skip and edit require current adult session authority for %s',async role=>{const f=fixture(),before=rows();expect((await send('/occurrences/'+f.task.id+'/skip',role,{expectedRevision:f.task.revision,input:{expectedSeriesRevision:1}})).status).toBe(role===null?401:403);expect((await send('/series/'+f.series.id+'/edit',role,{expectedRevision:1,scope:'future',patch:{policy}})).status).toBe(role===null?401:403);expect(rows()).toEqual(before);});
it('forged fields stale revisions and malformed scope fail without writing a command receipt or domain data',async()=>{const f=fixture(),before=rows();const cases:[string,any,number][]=[
 ['/occurrences/'+f.task.id+'/skip',{expectedRevision:f.task.revision,input:{expectedSeriesRevision:1},actor:{userId:UserRole.ADMIN}},400],
 ['/occurrences/'+f.task.id+'/skip',{expectedRevision:999,input:{expectedSeriesRevision:1}},409],
 ['/series/'+f.series.id+'/edit',{expectedRevision:999,scope:'future',patch:{policy}},409],
 ['/series/'+f.series.id+'/edit',{expectedRevision:1,scope:'history',patch:{policy}},422],
 ['/series/'+f.series.id+'/edit',{expectedRevision:1,scope:'future',patch:{policy},acceptedAt:'2027-01-01T00:00:00Z'},400],
 ];for(const [path,body,status]of cases){const result=await send(path,UserRole.ADMIN,body);expect(result.status,result.text).toBe(status);expect(rows()).toEqual(before);}});
it('revoked grant blocks cached HTTP edit and hides private/missing source identically',async()=>{const f=fixture(false),request=randomUUID(),body={expectedRevision:1,scope:'future',patch:{policy}},first=await send('/series/'+f.series.id+'/edit',UserRole.MEMBER,body,request);expect(first.status,first.text).toBe(200);write(tx=>tx.run('DELETE FROM productivity_list_grants WHERE list_id=? AND user_id=?','legacy-family',UserRole.MEMBER));try{const before=rows(),denied=await send('/series/'+f.series.id+'/edit',UserRole.MEMBER,body,request);expect(denied.status).toBe(404);expect(rows()).toEqual(before);const privateSkip=await send('/occurrences/'+f.task.id+'/skip',UserRole.MEMBER,{expectedRevision:f.task.revision,input:{expectedSeriesRevision:2}}),missing=await send('/occurrences/'+randomUUID()+'/skip',UserRole.MEMBER,{expectedRevision:1,input:{expectedSeriesRevision:1}});expect(privateSkip.status).toBe(404);expect(privateSkip.body).toEqual(missing.body);expect(rows()).toEqual(before);}finally{write(tx=>tx.run("INSERT INTO productivity_list_grants VALUES(?,?,'manage')",'legacy-family',UserRole.MEMBER));}});
it('unavailable command ports refuse instead of acknowledging unapplied skip/edit',async()=>{const f=fixture(),saved=deps.productivity.seriesCommands;delete deps.productivity.seriesCommands;try{const before=rows();expect((await send('/occurrences/'+f.task.id+'/skip',UserRole.ADMIN,{expectedRevision:f.task.revision,input:{expectedSeriesRevision:1}})).status).toBe(409);expect((await send('/series/'+f.series.id+'/edit',UserRole.ADMIN,{expectedRevision:1,scope:'future',patch:{policy}})).status).toBe(409);expect(rows()).toEqual(before);}finally{deps.productivity.seriesCommands=saved;}});
it('current authorized adult can resolve the selected Task series while an unregistered Task returns explicit null',async()=>{const f=fixture(),result=await send('/'+f.task.id+'/series');expect(result.status,result.text).toBe(200);expect(result.body).toEqual({series:f.series,ordinal:0});expect(result.headers['cache-control']).toContain('no-store');const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic unregistered editor',isShared:true});expect((await send('/'+task.id+'/series')).body).toEqual({series:null,ordinal:null});expect((await send('/'+f.task.id+'/series',UserRole.CHILD)).status).toBe(403);expect((await send('/'+randomUUID()+'/series')).status).toBe(404);});
it('series lookup follows the actual current successor and does not grant edit authority via a visible shared source',async()=>{const f=fixture(),skip=await send('/occurrences/'+f.task.id+'/skip',UserRole.ADMIN,{expectedRevision:f.task.revision,input:{expectedSeriesRevision:1}});expect(skip.status,skip.text).toBe(200);const successor=skip.body.spawnedTaskIds[0],result=await send('/'+successor+'/series');expect(result.status,result.text).toBe(200);expect(result.body).toMatchObject({series:{id:f.series.id,revision:2},ordinal:1});const before=rows();expect((await send('/'+successor+'/series',UserRole.GUEST)).status).toBe(403);expect(rows()).toEqual(before);});
