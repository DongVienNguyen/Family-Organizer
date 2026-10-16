import {beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshots from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {registerBoardMigration} from './boardMigration.js';
import {registerBoardViewMigration} from './boardViewSchema.js';
import {registerGroupedViewMigration} from './groupViewSchema.js';
import {registerSeriesMigration,productivitySeriesChecksum} from './seriesSchema.js';
import {createRecurrenceSeriesStore} from './seriesStore.js';
import {createTaskCommands} from './tasks.js';
import {validateProductivitySnapshotData} from './snapshot.js';
import {inspectProductivityStorage} from './inspection.js';
import {inspectRecoverySnapshot} from '../recoverySnapshotInspection.js';
import {createTaskViews} from './views.js';
import {createBoardCatalog} from './boardCatalog.js';
import {configureTaskStorage} from './bootstrap.js';
import {transitionRotation} from './recurrencePolicy.js';

const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args)as any,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)as any[]};
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:series',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const actor=(role=UserRole.ADMIN)=>({userId:role,role}),ctx=(revision=0,role=UserRole.ADMIN)=>({actor:actor(role),expectedRevision:revision,requestId:randomUUID()});
const policy=(extra:any={})=>({timezone:'Asia/Saigon',base:'due',cadence:{kind:'calendar',frequency:'monthly',interval:1,invalidDate:'clamp'},end:{kind:'count',count:5},missed:'skip',rotationMembers:[UserRole.CHILD,UserRole.MEMBER],...extra});
let clock=Date.parse('2026-10-16T00:00:00.000Z'),defaultVersion=0;
const store=createRecurrenceSeriesStore({reader,write:gateway.withAppWriteTransaction,now:()=>clock}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction});
let frozenMigrations:any[],frozenDdl:any[];
beforeAll(()=>{
 write(tx=>{tx.legacy.tasks=[];tx.legacy.rewardLedger=[];tx.legacy.notifications=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));});
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot:snapshots});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});defaultVersion=migrations.getDomainVersions().productivity;
 write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));
 registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerBoardViewMigration(migrations.registerDomainMigration);registerGroupedViewMigration(migrations.registerDomainMigration);migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 frozenMigrations=reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' ORDER BY version");frozenDdl=reader.all("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name");
});
function upgrade(){registerSeriesMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});}
function task(extra:any={}){return tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic durable series '+randomUUID(),due:{kind:'all_day',date:'2027-01-31',timezone:'Asia/Saigon'},isShared:true,...extra});}
function fixture(){const source=task();return {source,series:store.create(ctx(source.revision),source.id,policy())};}
const allRows=()=>Object.fromEntries(['productivity_tasks','productivity_task_tags','productivity_occurrences','productivity_series','productivity_series_exceptions','reward_ledger','notifications','app_commands'].map(name=>[name,reader.all('SELECT * FROM '+name)]));

it('keeps default6 and requires explicit10 without modifying frozen1–9 or any prior table DDL',()=>{
 expect(defaultVersion).toBe(6);const source=task();expect(()=>store.create(ctx(source.revision),source.id,policy())).toThrow(expect.objectContaining({status:409}));const rows=reader.all('SELECT * FROM productivity_tasks');upgrade();
 expect(reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' AND version<=9 ORDER BY version")).toEqual(frozenMigrations);expect(reader.get("SELECT checksum FROM app_migrations WHERE namespace='productivity' AND version=10")).toEqual({checksum:productivitySeriesChecksum});expect(reader.all('SELECT * FROM productivity_tasks')).toEqual(rows);
 const ddl=reader.all("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT IN('productivity_series','productivity_series_exceptions') ORDER BY name");expect(ddl).toEqual(frozenDdl);expect(inspectProductivityStorage(reader)).toBe(true);
});
it('stores detached canonical policy and anchor without Task, points, notification or occurrence mutation',()=>{
 const source=task(),before=allRows(),input=policy(),value=store.create(ctx(source.revision),source.id,input);input.rotationMembers.push('foreign');value.policy.rotationMembers.push('mutated-result');
 const current=store.get(actor(),value.id);expect(current).toMatchObject({taskId:source.id,revision:1,anchor:source.due,nextOrdinal:1,acceptedCount:0,rotationCursor:0,endedAt:null,createdAt:new Date(clock).toISOString(),updatedAt:new Date(clock).toISOString()});expect(current.policy).toEqual(policy());
 for(const name of ['productivity_tasks','productivity_task_tags','productivity_occurrences','reward_ledger','notifications'])expect(reader.all('SELECT * FROM '+name),name).toEqual(before[name]);
});
it('exact command retry returns current authorized series and a changed payload conflicts without duplicates',()=>{
 const source=task(),request=ctx(source.revision),first=store.create(request,source.id,policy());expect(store.create(request,source.id,policy())).toEqual(first);expect(()=>store.create(request,source.id,policy({missed:'latest'}))).toThrow(expect.objectContaining({status:409}));expect(reader.all('SELECT id FROM productivity_series WHERE task_id=?',source.id)).toEqual([{id:first.id}]);expect(()=>store.create(ctx(source.revision),source.id,policy())).toThrow(expect.objectContaining({status:409}));
});
it.each([UserRole.CHILD,UserRole.GUEST])('refuses %s configuration before revealing series policy',role=>{const f=fixture(),before=allRows();expect(()=>store.get(actor(role),f.series.id)).toThrow(expect.objectContaining({status:403}));expect(()=>store.create(ctx(f.source.revision,role),f.source.id,policy())).toThrow(expect.objectContaining({status:403}));expect(allRows()).toEqual(before);});
it('checks current role and object grant before replaying a committed command',()=>{
 const source=task({isShared:false}),request=ctx(source.revision,UserRole.MEMBER),first=store.create(request,source.id,policy());write(tx=>tx.run('DELETE FROM productivity_list_grants WHERE list_id=? AND user_id=?','legacy-family',UserRole.MEMBER));
 try{expect(()=>store.create(request,source.id,policy())).toThrow(expect.objectContaining({status:404}));expect(()=>store.get(actor(UserRole.MEMBER),first.id)).toThrow(expect.objectContaining({status:404}));}finally{write(tx=>tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)','legacy-family',UserRole.MEMBER,'manage'));}
 write(tx=>{tx.legacy.users.find(user=>user.id===UserRole.MEMBER)!.role=UserRole.GUEST;});try{expect(()=>store.create(request,source.id,policy())).toThrow(expect.objectContaining({status:403}));}finally{write(tx=>{tx.legacy.users.find(user=>user.id===UserRole.MEMBER)!.role=UserRole.MEMBER;});}
});
it.each(['stale','no-anchor','timezone','unknown-member','legacy-repeat'])('refuses unsafe registration %s atomically',cause=>{
 const source=task(cause==='no-anchor'?{due:{kind:'none'}}:{});if(cause==='legacy-repeat')write(tx=>{tx.legacy.tasks.find(t=>t.id===source.id)!.recurrenceType='weekly';});const before=allRows(),input=policy(cause==='timezone'?{timezone:'UTC'}:cause==='unknown-member'?{rotationMembers:['foreign']}:{});
 expect(()=>store.create(ctx(cause==='stale'?source.revision+1:source.revision),source.id,input)).toThrow(expect.objectContaining({status:['stale','legacy-repeat'].includes(cause)?409:422}));expect(allRows()).toEqual(before);
});
it('completion-based configuration explicitly retains a missing deadline without generating future Tasks',()=>{const source=task({due:{kind:'none'}}),value=store.create(ctx(source.revision),source.id,policy({base:'completion'}));expect(value.anchor).toEqual({kind:'none'});expect(value.policy.base).toBe('completion');expect(reader.all('SELECT * FROM productivity_occurrences')).toEqual([]);});
it('future exceptions retain independent revisions and never advance accepted rotation or rewards',()=>{
 const f=fixture(),before=allRows(),first=store.saveException(ctx(f.series.revision),f.series.id,1,{kind:'skip'});expect(first).toMatchObject({revision:2,nextOrdinal:1,acceptedCount:0,rotationCursor:0});expect(store.exceptions(actor(),f.series.id)).toEqual([{seriesId:f.series.id,ordinal:1,revision:1,kind:'skip'}]);
 const due={kind:'all_day',date:'2027-03-02',timezone:'Asia/Saigon'},request=ctx(first.revision),second=store.saveException(request,f.series.id,1,{kind:'due',due});expect(second.revision).toBe(3);expect(store.saveException(request,f.series.id,1,{kind:'due',due})).toEqual(second);expect(store.exceptions(actor(),f.series.id)).toEqual([{seriesId:f.series.id,ordinal:1,revision:2,kind:'due',due}]);
 for(const name of ['productivity_tasks','productivity_occurrences','reward_ledger','notifications'])expect(reader.all('SELECT * FROM '+name),name).toEqual(before[name]);
});
it.each(['materialized','end-count','timezone','forged-field','stale','clock-rollback'])('refuses exception %s without persisting state',cause=>{
 const f=fixture(),before=allRows();if(cause==='clock-rollback')clock--;try{expect(()=>store.saveException(ctx(cause==='stale'?0:f.series.revision),f.series.id,cause==='materialized'?0:cause==='end-count'?5:1,cause==='timezone'?{kind:'due',due:{kind:'all_day',date:'2027-02-28',timezone:'UTC'}}:cause==='forged-field'?{kind:'skip',rewardPoints:999}:{kind:'skip'})).toThrow(expect.objectContaining({status:['stale','clock-rollback'].includes(cause)?409:422}));expect(allRows()).toEqual(before);}finally{if(cause==='clock-rollback')clock++;}
});
it('post-write failure rolls back series, exceptions and the gateway command receipt together',()=>{
 const failing=createRecurrenceSeriesStore({reader,write:gateway.withAppWriteTransaction,now:()=>clock,afterWrite:()=>{throw Error('synthetic series rollback');}}),source=task(),before=allRows();expect(()=>failing.create(ctx(source.revision),source.id,policy())).toThrow('synthetic series rollback');expect(allRows()).toEqual(before);const f=fixture(),next=allRows();expect(()=>failing.saveException(ctx(1),f.series.id,1,{kind:'skip'})).toThrow('synthetic series rollback');expect(allRows()).toEqual(next);
});
it('mixed snapshot recovery retains series, exception and committed command identities without effects',async()=>{
 const f=fixture(),request=ctx(1),savedSeries=store.saveException(request,f.series.id,1,{kind:'skip'}),saved=write(tx=>snapshots.collectAppSnapshot(tx)),before=allRows();expect(saved.manifest.domains.productivity).toBe(10);expect(()=>snapshots.validateAppSnapshot(saved)).not.toThrow();expect(()=>inspectRecoverySnapshot(saved,sqlite.sqliteConnection().name)).not.toThrow();write(tx=>tx.run('DELETE FROM productivity_series_exceptions WHERE series_id=?',f.series.id));await snapshots.restoreAppSnapshot(snapshots.validateAppSnapshot(saved),{maintenance:async work=>work()});
 const after=allRows(),keys=new Set(saved.tables.app_commands.map(row=>JSON.stringify([row.command,row.request_id]))),receipts=after.app_commands.filter(row=>!keys.has(JSON.stringify([row.command,row.request_id])));expect(receipts).toHaveLength(1);expect(receipts[0]).toMatchObject({actor_id:'system:restore',command:'core:snapshot:restore',result:JSON.stringify({value:{restoredFiles:0}})});expect(receipts[0].request_id).toMatch(/^[a-f0-9-]{36}$/);expect(receipts[0].payload_hash).toMatch(/^[a-f0-9]{64}$/);expect(new Date(receipts[0].committed_at).toISOString()).toBe(receipts[0].committed_at);
 const expected={...before,app_commands:[...saved.tables.app_commands,...receipts]};expect(after).toEqual(expected);expect(store.saveException(request,f.series.id,1,{kind:'skip'})).toEqual(savedSeries);expect(allRows()).toEqual(expected);
});
it.each(['missing-series','missing-task','duplicate-root','malformed-policy','unknown-member','unsorted-dates','bad-anchor','accepted-overflow','timestamp-order','orphan-exception','exception-revision','skip-deadline'])('rejects corrupt recurrence snapshot %s without mutating live storage',cause=>{
 const f=fixture();store.saveException(ctx(1),f.series.id,1,{kind:'skip'});const saved=write(tx=>snapshots.collectAppSnapshot(tx)),bad=structuredClone(saved),row=bad.tables.productivity_series.find(r=>r.id===f.series.id)!,exception=bad.tables.productivity_series_exceptions.find(r=>r.series_id===f.series.id)!;
 if(cause==='missing-series')delete bad.tables.productivity_series;else if(cause==='missing-task')row.task_id='private-missing';else if(cause==='duplicate-root')bad.tables.productivity_series.push({...row,id:randomUUID()});else if(cause==='malformed-policy')row.policy_json=JSON.stringify({...policy(),rewardPoints:900});else if(cause==='unknown-member')row.policy_json=JSON.stringify(policy({rotationMembers:['private-missing']}));else if(cause==='unsorted-dates')row.policy_json=JSON.stringify(policy({cadence:{kind:'dates',dates:['2027-03-01','2027-02-01']}}));else if(cause==='bad-anchor')row.anchor_json=JSON.stringify({kind:'none'});else if(cause==='accepted-overflow')row.accepted_count=2;else if(cause==='timestamp-order')row.updated_at='2026-10-15T00:00:00.000Z';else if(cause==='orphan-exception')exception.series_id='missing';else if(cause==='exception-revision')exception.revision=999;else exception.due_json=JSON.stringify({kind:'none'});
 const before=allRows();expect(()=>validateProductivitySnapshotData(bad)).toThrow();expect(allRows()).toEqual(before);
});
it('private series and unknown IDs have indistinguishable not-found responses',()=>{
 const source=task({isShared:false}),value=store.create(ctx(source.revision),source.id,policy());write(tx=>tx.run('DELETE FROM productivity_list_grants WHERE list_id=? AND user_id=?','legacy-family',UserRole.MEMBER));
 try{const error=(id:string)=>{try{store.get(actor(UserRole.MEMBER),id);throw Error('expected denial');}catch(error){return {status:(error as any).status,code:(error as any).code,message:(error as Error).message};}};const missing=error(randomUUID());expect(missing.status).toBe(404);expect(error(value.id)).toEqual(missing);}finally{write(tx=>tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)','legacy-family',UserRole.MEMBER,'manage'));}
});
it('schema10 keeps saved tag view format9 readable and rejects an invented format10',()=>{
 upgrade();const catalog=createBoardCatalog({reader,write:gateway.withAppWriteTransaction}),views=createTaskViews({reader,write:gateway.withAppWriteTransaction}),board=catalog.configure(ctx(),{listId:'legacy-family',mode:'sections',policies:[]});
 const input={title:'Synthetic series compatibility view',formatVersion:9,filter:{rootsOnly:true},kind:'kanban',config:{kind:'kanban',mode:'sections',group:'tag',sort:'rank',columns:[],boardId:board.id}}as any;
 const saved=views.saveView(ctx(),input);expect(saved.formatVersion).toBe(9);expect(views.getView(actor(),saved.id)).toEqual(saved);expect(views.listViews(actor())).toContainEqual(saved);expect(()=>views.saveView(ctx(),{...input,formatVersion:10})).toThrow(expect.objectContaining({status:400}));
 const snapshot=write(tx=>snapshots.collectAppSnapshot(tx));expect(()=>snapshots.validateAppSnapshot(snapshot)).not.toThrow();expect(()=>inspectRecoverySnapshot(snapshot,sqlite.sqliteConnection().name)).not.toThrow();
});
it.each(['foreign-key','unique-task','negative-revision','skip-deadline'])('native SQLite enforces recurrence constraint %s with transaction rollback',cause=>{
 const f=fixture(),before=allRows();expect(()=>write(tx=>{
  if(cause==='foreign-key')tx.run('INSERT INTO productivity_series_exceptions VALUES(?,?,?,?,?)','unknown-series',1,'skip',null,1);
  else if(cause==='skip-deadline')tx.run('INSERT INTO productivity_series_exceptions VALUES(?,?,?,?,?)',f.series.id,1,'skip',JSON.stringify({kind:'none'}),1);
  else if(cause==='negative-revision')tx.run('UPDATE productivity_series SET revision=0 WHERE id=?',f.series.id);
  else tx.run('INSERT INTO productivity_series SELECT ?,task_id,revision,policy_json,anchor_json,next_ordinal,accepted_count,rotation_cursor,ended_at,created_at,updated_at FROM productivity_series WHERE id=?',randomUUID(),f.series.id);
 })).toThrow();expect(allRows()).toEqual(before);
});
it('normal startup refuses malformed persisted series before jobs or commands can consume it',async()=>{
 const f=fixture(),row=reader.get('SELECT policy_json FROM productivity_series WHERE id=?',f.series.id);write(tx=>tx.run('UPDATE productivity_series SET policy_json=? WHERE id=?','{}',f.series.id));const before=allRows();
 try{await expect(configureTaskStorage(sqlite)).rejects.toThrow();expect(allRows()).toEqual(before);}finally{write(tx=>tx.run('UPDATE productivity_series SET policy_json=? WHERE id=?',row.policy_json,f.series.id));}
});
it('soft-deleted rotation members remain historical references while new registration requires live members',()=>{
 const f=fixture(),original=JSON.parse(reader.get('SELECT data FROM users WHERE id=?',UserRole.CHILD).data);write(tx=>{tx.legacy.users.find(user=>user.id===UserRole.CHILD)!.isDeleted=true;});
 try{expect(store.get(actor(),f.series.id)).toEqual(f.series);const saved=write(tx=>snapshots.collectAppSnapshot(tx));expect(()=>snapshots.validateAppSnapshot(saved)).not.toThrow();const next=task();expect(()=>store.create(ctx(next.revision),next.id,policy())).toThrow(expect.objectContaining({status:422}));expect(store.get(actor(),f.series.id).rotationCursor).toBe(0);}finally{write(tx=>{const index=tx.legacy.users.findIndex(user=>user.id===UserRole.CHILD);tx.legacy.users[index]=original;});}
});
it('a read-only Task grant cannot reveal private series configuration through status or message',()=>{
 const source=task({isShared:false}),value=store.create(ctx(source.revision),source.id,policy());write(tx=>tx.run('UPDATE productivity_list_grants SET permission=? WHERE list_id=? AND user_id=?','read','legacy-family',UserRole.MEMBER));
 try{const denied=(id:string)=>{try{store.get(actor(UserRole.MEMBER),id);throw Error('expected denial');}catch(error){return {status:(error as any).status,code:(error as any).code,message:(error as Error).message};}};const missing=denied(randomUUID());expect(missing.status).toBe(404);expect(denied(value.id)).toEqual(missing);const before=allRows();expect(()=>store.saveException(ctx(1,UserRole.MEMBER),value.id,1,{kind:'skip'})).toThrow(expect.objectContaining({status:404}));expect(allRows()).toEqual(before);}finally{write(tx=>tx.run('UPDATE productivity_list_grants SET permission=? WHERE list_id=? AND user_id=?','manage','legacy-family',UserRole.MEMBER));}
});
it('a future exception receipt binds the audited object intent and both revision numbers',()=>{
 const f=fixture(),request=ctx(f.series.revision),intent={kind:'due',due:{kind:'all_day',date:'2027-02-28',timezone:'Asia/Saigon'}};store.saveException(request,f.series.id,1,intent);const row=reader.get('SELECT actor_id,result FROM app_commands WHERE command=? AND request_id=?','productivity:series:exception',request.requestId);expect(row.actor_id).toBe(UserRole.ADMIN);expect(JSON.parse(row.result).value).toEqual({id:f.series.id,ordinal:1,input:intent,seriesRevision:2,exceptionRevision:1});
});
it.each([{assignee:UserRole.CHILD,cursor:0,next:UserRole.MEMBER},{assignee:UserRole.MEMBER,cursor:1,next:UserRole.CHILD},{assignee:null,cursor:1,next:UserRole.CHILD},{assignee:UserRole.ADMIN,cursor:1,next:UserRole.CHILD}])('captures legacy rotation origin for $assignee without assigning or accepting a Task',({assignee,cursor,next})=>{
 const source=task({assigneeId:assignee}),before=reader.get('SELECT * FROM productivity_tasks WHERE id=?',source.id),value=store.create(ctx(source.revision),source.id,policy());expect(value.rotationCursor).toBe(cursor);expect(value.acceptedCount).toBe(0);expect(transitionRotation({members:value.policy.rotationMembers,cursor:value.rotationCursor,transition:'accepted'}).assigneeId).toBe(next);expect(reader.get('SELECT * FROM productivity_tasks WHERE id=?',source.id)).toEqual(before);
});
