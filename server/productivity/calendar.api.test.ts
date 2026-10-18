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
 const data=body===undefined?'':JSON.stringify(body),request=http.request({hostname:'127.0.0.1',port:(server.address()as any).port,path:'/api/productivity/calendar'+route,method:body===undefined?'GET':'POST',agent:false,headers:{...(role?{authorization:'Bearer '+tokens[role]}:{}),'content-type':'application/json','content-length':Buffer.byteLength(data),'x-request-id':requestId}},response=>{const chunks:Buffer[]=[];let size=0;response.on('data',part=>{size+=part.length;if(size>1024*1024)response.destroy(Error('Synthetic preview response budget'));else chunks.push(part);});response.on('error',reject);response.on('end',()=>{const text=Buffer.concat(chunks).toString();let body;try{body=JSON.parse(text);}catch{}resolve({status:response.statusCode,body,text,headers:response.headers});});});request.on('error',reject);request.end(data);
});
function fixture(shared=true){const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic preview HTTP '+randomUUID(),due:{kind:'all_day',date:'2027-01-31',timezone:'Asia/Saigon'},isShared:shared});return {task,series:store.create(ctx(task.revision),task.id,policy)};}
const route=(id:string)=>'/'+id+'/preview?from=2027-02-01&toExclusive=2027-05-01';
const rows=()=>Object.fromEntries(['productivity_tasks','productivity_series','productivity_series_exceptions','productivity_occurrences','reward_ledger','notifications','wallet_accounts','wallet_records','wallet_postings'].map(table=>[table,reader.all('SELECT * FROM '+table)]));

const calendarRange={fromDate:'2027-01-01',toDateExclusive:'2027-02-01',timezone:'Asia/Saigon'};
it('calendar HTTP preserves one canonical source and denies anonymous calls',async()=>{const f=fixture();const page=await send('/query',UserRole.ADMIN,{range:calendarRange});expect(page.status).toBe(200);expect(page.body.items.filter((row:any)=>row.sourceId===f.task.id)).toHaveLength(1);expect((await send('/query',null,{range:calendarRange})).status).toBe(401);});
it('calendar HTTP preview cancel does not write and explicit apply retry uses one receipt without touching reward or Wallet',async()=>{const f=fixture(),before=rows(),input={taskId:f.task.id,startUtc:'2027-01-15T02:00:00.000Z',endUtc:'2027-01-15T03:00:00.000Z'},preview=await send('/reschedule/preview',UserRole.ADMIN,{input});expect(preview.status,preview.text).toBe(200);expect(rows()).toEqual(before);const body={expectedRevision:f.task.revision,input:{taskId:f.task.id,previewId:preview.body.preview.id}},nonce=randomUUID(),saved=await send('/reschedule/apply',UserRole.ADMIN,body,nonce);expect(saved.status,saved.text).toBe(200);expect(saved.body.task).toMatchObject({id:f.task.id,revision:2,due:f.task.due,scheduledStart:input.startUtc});expect((await send('/reschedule/apply',UserRole.ADMIN,body,nonce)).body).toEqual(saved.body);expect(reader.all('SELECT * FROM wallet_postings')).toEqual(before.wallet_postings);expect(reader.all('SELECT * FROM reward_ledger')).toEqual(before.reward_ledger);});
it('direct child calendar response excludes hidden task and private plan bodies including IDs',async()=>{const hidden=fixture(false);write(tx=>{tx.legacy.plans.push({id:'synthetic-http-private-plan',title:'SYNTHETIC_HTTP_PRIVATE_CALENDAR_PLAN',description:'Synthetic secret',startDate:'2027-01-15',endDate:'2027-01-15',isRecurring:false,recurrenceType:'none',creatorId:UserRole.ADMIN,isShared:false,color:'sky',createdAt:'2026-10-18T00:00:00.000Z'});});const result=await send('/query',UserRole.CHILD,{range:calendarRange});expect(result.status).toBe(200);expect(result.text).not.toContain(hidden.task.id);expect(result.text).not.toContain('SYNTHETIC_HTTP_PRIVATE_CALENDAR_PLAN');expect(result.text).not.toContain('synthetic-http-private-plan');});
it('new calendar handlers reject forged context and invalid ranges before a financial write',async()=>{const f=fixture(),before=rows();expect((await send('/query',UserRole.ADMIN,{range:{...calendarRange,toDateExclusive:'2029-01-01'}})).status).toBe(422);expect((await send('/reschedule/preview',UserRole.ADMIN,{input:{taskId:f.task.id,startUtc:'2027-01-15T02:00:00.000Z',endUtc:'2027-01-15T03:00:00.000Z',actor:{userId:UserRole.ADMIN}}})).status).toBe(422);expect(rows()).toEqual(before);});
