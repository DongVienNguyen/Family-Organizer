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

import {legacyTask} from '../../tests/fixtures/productivity.js';
import {registerLegacyCutoverMigration} from './legacyCutoverSchema.js';
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args)as any,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)as any[]};
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:preview-http',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const ctx=(revision=0)=>({actor:{userId:UserRole.ADMIN,role:UserRole.ADMIN},requestId:randomUUID(),expectedRevision:revision});
const tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction}),store=createRecurrenceSeriesStore({reader,write:gateway.withAppWriteTransaction});
const policy={timezone:'Asia/Saigon',base:'due',cadence:{kind:'calendar',frequency:'monthly',interval:1,invalidDate:'clamp'},end:{kind:'count',count:4},missed:'skip',rotationMembers:[UserRole.CHILD,UserRole.MEMBER]};
let server:http.Server,handle:Awaited<ReturnType<typeof createApp>>,auth:ReturnType<typeof createAuth>,tokens:Record<string,string>,deps:any;
beforeAll(async()=>{
 write(tx=>{tx.legacy.tasks=[];tx.legacy.rewardLedger=[];tx.legacy.notifications=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));});
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot:snapshots});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));
 registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerBoardViewMigration(migrations.registerDomainMigration);registerGroupedViewMigration(migrations.registerDomainMigration);registerSeriesMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerOccurrenceMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerOccurrenceSkipMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerLegacyCutoverMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
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
const rows=()=>Object.fromEntries(['productivity_tasks','productivity_legacy_cutovers','productivity_series','productivity_series_exceptions','productivity_occurrences','productivity_series_occurrences','productivity_occurrence_skips','app_commands','reward_ledger','notifications','wallet_accounts','wallet_records','wallet_postings'].map(table=>[table,reader.all('SELECT * FROM '+table)]));


function legacyFamily(){const root=randomUUID(),id=randomUUID();write(tx=>tx.legacy.tasks.push(legacyTask(root,{creatorId:UserRole.ADMIN,assigneeId:UserRole.CHILD,status:'completed' as any,recurrenceType:'monthly',dueDate:'2027-01-31',sourceRecurringTaskId:null}),legacyTask(id,{creatorId:UserRole.ADMIN,assigneeId:UserRole.CHILD,recurrenceType:'monthly',dueDate:'2027-02-28',sourceRecurringTaskId:root,pendingApproval:true,proofNote:'Synthetic HTTP pending proof'})));return {root,id};}
const cutoverPath=(id:string)=>'/legacy-recurrence/'+id;
async function conversion(id:string){const preview=await send(cutoverPath(id)+'/preview');expect(preview.status,preview.text).toBe(200);return {expectedRevision:reader.get('SELECT revision FROM productivity_tasks WHERE id=?',id).revision,input:{fingerprint:preview.body.preview.fingerprint,policy:{...policy,missed:'catch_up'},anchor:{kind:'all_day',date:'2027-02-28',timezone:'Asia/Saigon'},acknowledgeOtherActive:false}};}
it('authenticated administrator preview is read-only and one scoped cutover retains pending proof without rewards',async()=>{const f=legacyFamily(),before=rows(),body=await conversion(f.id);expect(rows()).toEqual(before);const request=randomUUID(),result=await send(cutoverPath(f.id)+'/cutover',UserRole.ADMIN,body,request);expect(result.status,result.text).toBe(200);expect(result.body.series).toMatchObject({taskId:f.id,revision:1,acceptedCount:0,nextOrdinal:1,rotationCursor:0});expect(result.body.changedTaskIds.sort()).toEqual([f.root,f.id].sort());expect(result.headers['cache-control']).toContain('no-store');const editor=await send('/'+f.id+'/series');expect(editor.status,editor.text).toBe(200);expect(editor.body).toEqual({series:result.body.series,ordinal:0});expect((await send(cutoverPath(f.id)+'/cutover',UserRole.ADMIN,body,request)).body).toEqual(result.body);expect(rows().reward_ledger).toEqual(before.reward_ledger);expect(rows().notifications).toEqual(before.notifications);expect(deps.productivity.access.getTask(ctx().actor,f.id)).toMatchObject({pendingApproval:true,legacy:{proofNote:'Synthetic HTTP pending proof'}});});
it.each([null,UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST])('preview and apply reject nonadministrator session %s without disclosing the family',async role=>{const f=legacyFamily(),body=await conversion(f.id),before=rows();for(const suffix of ['/preview','/cutover']){const response=await send(cutoverPath(f.id)+suffix,role,suffix==='/cutover'?body:undefined);expect(response.status,response.text).toBe(role===null?401:403);expect(response.text).not.toContain(f.root);expect(rows()).toEqual(before);}});
it('malformed or forged command fields and stale preview refuse without stopping legacy generators',async()=>{const f=legacyFamily(),body=await conversion(f.id),before=rows();for(const value of [{...body,actor:{userId:UserRole.ADMIN}},{...body,expectedRevision:0},{...body,input:{...body.input,fingerprint:'f'.repeat(64)}},{...body,input:{...body.input,acceptedCount:999}}]){const result=await send(cutoverPath(f.id)+'/cutover',UserRole.ADMIN,value);expect([400,409,422]).toContain(result.status);expect(rows()).toEqual(before);}expect((await send(cutoverPath(f.id)+'/preview?apply=true')).status).toBe(400);expect(rows()).toEqual(before);});
it('administrator role revocation prevents a cached conversion receipt from replaying through HTTP',async()=>{const f=legacyFamily(),body=await conversion(f.id),request=randomUUID();expect((await send(cutoverPath(f.id)+'/cutover',UserRole.ADMIN,body,request)).status).toBe(200);write(tx=>{tx.legacy.users.find(u=>u.id===UserRole.ADMIN)!.role=UserRole.MEMBER;});try{const before=rows();expect((await send(cutoverPath(f.id)+'/cutover',UserRole.ADMIN,body,request)).status).toBe(401);expect(rows()).toEqual(before);}finally{write(tx=>{tx.legacy.users.find(u=>u.id===UserRole.ADMIN)!.role=UserRole.ADMIN;});}});
it('missing cutover port refuses instead of acknowledging an unapplied conversion',async()=>{const f=legacyFamily(),body=await conversion(f.id),saved=deps.productivity.legacyCutover;delete deps.productivity.legacyCutover;try{const before=rows();expect((await send(cutoverPath(f.id)+'/cutover',UserRole.ADMIN,body)).status).toBe(409);expect((await send(cutoverPath(f.id)+'/preview')).status).toBe(409);expect(rows()).toEqual(before);}finally{deps.productivity.legacyCutover=saved;}});
