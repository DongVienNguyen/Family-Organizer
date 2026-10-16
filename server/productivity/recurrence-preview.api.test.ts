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
 registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerBoardViewMigration(migrations.registerDomainMigration);registerGroupedViewMigration(migrations.registerDomainMigration);registerSeriesMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 configureWalletStorage({migrations,snapshot:snapshots});migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});
 openWalletStore({write:gateway.withAppWriteTransaction}).transaction({actorId:UserRole.ADMIN,command:'wallet:synthetic:preview-control',requestId:randomUUID(),payloadHash:'synthetic'},tx=>{tx.accounts.insert({id:'synthetic-preview-wallet-account',name:'Synthetic private finance',type:'bank',currency:'VND',ownerUserId:UserRole.ADMIN,accessMode:'private',openingMinor:'1000',openingDate:'2026-10-16',revision:1});tx.records.insert({id:'synthetic-preview-wallet-record',kind:'expense',effectiveDate:'2026-10-16',timezone:'Asia/Saigon',source:'manual',note:'Synthetic retained record',settlementStatus:'uncleared',creatorId:UserRole.ADMIN,revision:1});tx.postings.insert({recordId:'synthetic-preview-wallet-record',accountId:'synthetic-preview-wallet-account',deltaMinor:'-500'});});
 deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.sqlite=sqlite;deps.productivity=createProductivityPorts(sqlite,gateway);auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-preview-http-secret'});deps.auth=auth;tokens=Object.fromEntries(db.FamilyDB.getUsers().map(user=>[user.id,auth.issue(user)]));handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!}as any,deps);server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
});
afterAll(async()=>{if(server){handle.endStreams();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}});
const send=(route:string,role:string|null=UserRole.ADMIN,body?:unknown,requestId=randomUUID())=>new Promise<any>((resolve,reject)=>{
 const data=body===undefined?'':JSON.stringify(body),request=http.request({hostname:'127.0.0.1',port:(server.address()as any).port,path:'/api/productivity/tasks/series'+route,method:body===undefined?'GET':'POST',agent:false,headers:{...(role?{authorization:'Bearer '+tokens[role]}:{}),'content-type':'application/json','content-length':Buffer.byteLength(data),'x-request-id':requestId}},response=>{const chunks:Buffer[]=[];let size=0;response.on('data',part=>{size+=part.length;if(size>1024*1024)response.destroy(Error('Synthetic preview response budget'));else chunks.push(part);});response.on('error',reject);response.on('end',()=>{const text=Buffer.concat(chunks).toString();let body;try{body=JSON.parse(text);}catch{}resolve({status:response.statusCode,body,text,headers:response.headers});});});request.on('error',reject);request.end(data);
});
function fixture(shared=true){const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic preview HTTP '+randomUUID(),due:{kind:'all_day',date:'2027-01-31',timezone:'Asia/Saigon'},isShared:shared});return {task,series:store.create(ctx(task.revision),task.id,policy)};}
const route=(id:string)=>'/'+id+'/preview?from=2027-02-01&toExclusive=2027-05-01';
const rows=()=>Object.fromEntries(['productivity_tasks','productivity_series','productivity_series_exceptions','productivity_occurrences','reward_ledger','notifications','wallet_accounts','wallet_records','wallet_postings'].map(table=>[table,reader.all('SELECT * FROM '+table)]));
it('creates a series once through internal adult auth and previews it without domain writes or cacheable private responses',async()=>{
 const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic HTTP registration',due:{kind:'all_day',date:'2027-01-31',timezone:'Asia/Saigon'},isShared:true}),request=randomUUID(),body={taskId:task.id,expectedRevision:task.revision,policy};
 const created=await send('',UserRole.ADMIN,body,request);expect(created.status,created.text).toBe(200);expect(created.body.series).toMatchObject({taskId:task.id,revision:1});expect((await send('',UserRole.ADMIN,body,request)).body).toEqual(created.body);expect(reader.all('SELECT id FROM productivity_series WHERE task_id=?',task.id)).toHaveLength(1);
 const before=rows(),result=await send(route(created.body.series.id),UserRole.CHILD);expect(result.status,result.text).toBe(200);expect(result.headers['cache-control']).toContain('no-store');expect(result.body.occurrences.map((r:any)=>r.due.date)).toEqual(['2027-02-28','2027-03-31','2027-04-30']);expect(result.text).not.toMatch(/rotationMembers|policy|rewardPoints|synthetic-preview-wallet/);expect(rows()).toEqual(before);
});
it('requires a current session and ignores no forged authority in query or create payload',async()=>{
 const f=fixture();expect((await send(route(f.series.id),null)).status).toBe(401);const before=rows();expect((await send(route(f.series.id)+'&acceptedCompletedAt=2027-03-01T00:00:00Z')).status).toBe(422);
 const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic bad create'}),bad=await send('',UserRole.ADMIN,{taskId:task.id,expectedRevision:task.revision,policy,actor:{userId:UserRole.ADMIN,role:UserRole.ADMIN}});expect(bad.status).toBe(400);expect(reader.all('SELECT id FROM productivity_series WHERE task_id=?',task.id)).toEqual([]);expect(rows().productivity_series).toEqual(before.productivity_series);
});
it.each([UserRole.CHILD,UserRole.GUEST])('prevents %s configuration while allowing authorized shared preview',async role=>{
 const f=fixture(),before=rows();expect((await send(route(f.series.id),role)).status).toBe(200);expect((await send('',role,{taskId:f.task.id,expectedRevision:f.task.revision,policy})).status).toBe(403);expect(rows()).toEqual(before);
});
it('has identical private and missing preview responses and rejects a stale registration without writes',async()=>{
 const f=fixture(false),privateResult=await send(route(f.series.id),UserRole.CHILD),missing=await send(route(randomUUID()),UserRole.CHILD);expect(privateResult.status).toBe(404);expect(privateResult.body).toEqual(missing.body);expect(privateResult.text).not.toContain(f.series.id);
 const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic stale registration',due:{kind:'all_day',date:'2027-01-31',timezone:'Asia/Saigon'}}),before=rows();expect((await send('',UserRole.ADMIN,{taskId:task.id,expectedRevision:task.revision+1,policy})).status).toBe(409);expect(rows()).toEqual(before);
});
it('refuses excessive ranges and unavailable preview ports instead of returning truncated or fabricated success',async()=>{
 const f=fixture(),before=rows();expect((await send('/'+f.series.id+'/preview?from=2027-01-01&toExclusive=2028-01-03')).status).toBe(422);
 const saved=deps.productivity.recurrencePreview;delete deps.productivity.recurrencePreview;try{expect((await send(route(f.series.id))).status).toBe(409);}finally{deps.productivity.recurrencePreview=saved;}expect(rows()).toEqual(before);
});
it('returns409 on supported pre-series schema9 without automatically upgrading it',async()=>{
 const f=fixture(),fault=new Database(sqlite.sqliteConnection().name);try{fault.prepare("UPDATE app_migrations SET namespace='synthetic-preview-parked' WHERE namespace='productivity' AND version=10").run();const before=rows(),identity=reader.all('SELECT * FROM app_migrations ORDER BY namespace,version');expect((await send(route(f.series.id))).status).toBe(409);expect(rows()).toEqual(before);expect(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").version).toBe(9);expect(reader.all('SELECT * FROM app_migrations ORDER BY namespace,version')).toEqual(identity);}finally{fault.prepare("UPDATE app_migrations SET namespace='productivity' WHERE namespace='synthetic-preview-parked' AND version=10").run();fault.close();}
});
it('confirms the existing authentication storage guard rejects a future identity before the preview handler',()=>{
 const fault=new Database(sqlite.sqliteConnection().name);try{fault.prepare("UPDATE app_migrations SET version=11 WHERE namespace='productivity' AND version=10").run();const before=rows();expect(()=>auth.verify(tokens[UserRole.ADMIN])).toThrow('Unsupported productivity migration before activation');expect(rows()).toEqual(before);expect(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").version).toBe(11);}finally{fault.prepare("UPDATE app_migrations SET version=10 WHERE namespace='productivity' AND version=11").run();fault.close();}
});
