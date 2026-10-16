import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';import * as gateway from '../appStore.js';import * as migrations from '../appMigrations.js';import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createTaskPins} from './pins.js';
import {checksum} from '../snapshotValidation.js';
import {createStructureCommands} from './structure.js';import {createTaskCommands} from './tasks.js';
import type {TaskReader} from './access.js';
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:drawer-pins',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const reader:TaskReader={get:(sql,...args)=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql,...args)=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction});
const pins=createTaskPins({reader,write:gateway.withAppWriteTransaction});
const ctx=(role=UserRole.ADMIN,revision=0,requestId=randomUUID())=>({actor:{userId:role,role},expectedRevision:revision,requestId});
let initialized=false;
function setup(){if(initialized)return;fixture(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations:{...migrations,registerDomainMigration:(ns,v,fn,sum)=>{if(v<=4)migrations.registerDomainMigration(ns,v,fn,sum);}},snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;}
it('explicit migration4 installs personal task pins and retains every earlier migration identity',()=>{
 setup();expect(reader.all("SELECT version FROM app_migrations WHERE namespace='productivity' ORDER BY version")).toEqual([{version:1},{version:2},{version:3},{version:4}]);expect(reader.all('PRAGMA table_info(productivity_task_pins)').map(row=>row.name)).toEqual(['user_id','task_id','is_pinned','revision']);const before=reader.all('SELECT * FROM app_migrations ORDER BY namespace,version');migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});expect(reader.all('SELECT * FROM app_migrations ORDER BY namespace,version')).toEqual(before);
});
it('pins are personal preferences on readable tasks, not task lifecycle/reward or another user pin',()=>{
 setup();const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic shared pin task',isShared:true}),pin=pins.setPin(ctx(UserRole.MEMBER),task.id,true);expect(pin).toEqual({taskId:task.id,pinned:true,revision:1});expect(pins.getPin(ctx(UserRole.MEMBER).actor,task.id)).toEqual(pin);expect(pins.getPin(ctx(UserRole.ADMIN).actor,task.id)).toEqual({taskId:task.id,pinned:false,revision:0});expect(reader.get('SELECT revision,reward_points,lifecycle FROM productivity_tasks WHERE id=?',task.id)).toEqual({revision:task.revision,reward_points:0,lifecycle:'todo'});expect(sqlite.sqliteLoad().rewardLedger).toEqual([]);expect(sqlite.sqliteLoad().notifications).toEqual([]);
});
it('pin retries retain one revision while unpin and stale revisions obey independent compare-and-swap',()=>{
 setup();const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic pin retry',isShared:true}),request=ctx(UserRole.CHILD),pin=pins.setPin(request,task.id,true);expect(pins.setPin(request,task.id,true)).toEqual(pin);expect(pins.setPin(ctx(UserRole.CHILD,pin.revision),task.id,false)).toEqual({taskId:task.id,pinned:false,revision:2});expect(()=>pins.setPin(ctx(UserRole.CHILD,1),task.id,true)).toThrow(expect.objectContaining({status:409}));expect(reader.get('SELECT is_pinned,revision FROM productivity_task_pins WHERE user_id=? AND task_id=?',UserRole.CHILD,task.id)).toEqual({is_pinned:0,revision:2});
});
it('private/missing pins stay404 and Guest shared readers cannot write personal preferences',()=>{
 setup();const hidden=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic hidden pin task'});for(const id of [hidden.id,'missing-pin-task'])expect(()=>pins.getPin(ctx(UserRole.CHILD).actor,id)).toThrow(expect.objectContaining({status:404}));const shared=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic guest pin task',isShared:true});expect(()=>pins.setPin(ctx(UserRole.GUEST),shared.id,true)).toThrow(expect.objectContaining({status:403}));
});
it('revoked read grants reject committed retries before cache lookup',()=>{
 setup();const board=structure.saveList(ctx(),{title:'Synthetic granted pin board',isShared:false}),task=tasks.createTask(ctx(),{listId:board.id,title:'Synthetic granted pin task'});let list=structure.getCatalog(ctx().actor).lists.find(row=>row.id===board.id)!;structure.setListGrant(ctx(UserRole.ADMIN,list.revision),board.id,{userId:UserRole.MEMBER,permission:'read'});const request=ctx(UserRole.MEMBER);pins.setPin(request,task.id,true);list=structure.getCatalog(ctx().actor).lists.find(row=>row.id===board.id)!;structure.setListGrant(ctx(UserRole.ADMIN,list.revision),board.id,{userId:UserRole.MEMBER,permission:null});expect(()=>pins.setPin(request,task.id,true)).toThrow(expect.objectContaining({status:404}));expect(()=>pins.getPin(request.actor,task.id)).toThrow(expect.objectContaining({status:404}));
});
it('same-version snapshots restore personal pins without a users FK cascade or any reward/notice replay',async()=>{
 setup();const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic backed-up pin task',isShared:true}),pin=pins.setPin(ctx(UserRole.CHILD),task.id,true),saved=fixture(tx=>snapshot.collectAppSnapshot(tx));expect(saved.manifest.domains.productivity).toBe(4);expect(saved.tables.productivity_task_pins).toContainEqual({user_id:UserRole.CHILD,task_id:task.id,is_pinned:1,revision:1});fixture(tx=>tx.run('DELETE FROM productivity_task_pins WHERE task_id=?',task.id));await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});expect(pins.getPin(ctx(UserRole.CHILD).actor,task.id)).toEqual(pin);expect(sqlite.sqliteLoad().rewardLedger).toEqual([]);expect(sqlite.sqliteLoad().notifications).toEqual([]);
});
it('semantic snapshot pin references reject missing users/tasks before mutation',()=>{
 setup();const saved=fixture(tx=>snapshot.collectAppSnapshot(tx));for(const patch of [{user_id:'missing-user'},{task_id:'missing-task'}]){const bad=structuredClone(saved);Object.assign(bad.tables.productivity_task_pins[0],patch);bad.manifest.checksum=checksum(bad);expect(()=>snapshot.validateAppSnapshot(bad)).toThrow('Invalid productivity snapshot reference');}
});
it('soft-deleted tasks revoke pin reads and cached writes',()=>{
 setup();const task=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic deleted pinned task',isShared:true}),request=ctx(UserRole.CHILD);pins.setPin(request,task.id,true);fixture(tx=>tx.run('UPDATE productivity_tasks SET deleted_at=? WHERE id=?','2026-10-14T00:00:00Z',task.id));expect(()=>pins.getPin(request.actor,task.id)).toThrow(expect.objectContaining({status:404}));expect(()=>pins.setPin(request,task.id,true)).toThrow(expect.objectContaining({status:404}));
});

for(const version of [7,8,9])it(`schema${version} keeps personal pins readable and writable with fresh ACL and no Task/reward effects`,async()=>{
 setup();const {registerProductivityMigration}=await import('./migrate.js');registerProductivityMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshot.registerSnapshotTable,registerValidator:snapshot.registerSnapshotValidator});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 if(version===7){const {registerBoardMigration}=await import('./boardMigration.js');registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshot.registerSnapshotTable});}
 if(version===8){const {registerBoardViewMigration}=await import('./boardViewSchema.js');registerBoardViewMigration(migrations.registerDomainMigration);}
 if(version===9){const {registerGroupedViewMigration}=await import('./groupViewSchema.js');registerGroupedViewMigration(migrations.registerDomainMigration);}
 migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});expect(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version).toBe(version);
 const shared=tasks.createTask(ctx(),{listId:'legacy-family',title:`Synthetic schema${version} pin`,isShared:true}),hidden=tasks.createTask(ctx(),{listId:'legacy-family',title:`Synthetic schema${version} private pin`}),before=reader.all('SELECT * FROM productivity_tasks ORDER BY id'),history=sqlite.sqliteLoad().tasks.map(task=>({id:task.id,history:task.history}));
 const request=ctx(UserRole.CHILD),pin=pins.setPin(request,shared.id,true);expect(pin).toEqual({taskId:shared.id,pinned:true,revision:1});expect(pins.setPin(request,shared.id,true)).toEqual(pin);expect(pins.getPin(request.actor,shared.id)).toEqual(pin);expect(pins.listPins(request.actor)).toContainEqual(pin);expect(pins.getPin(ctx().actor,shared.id)).toEqual({taskId:shared.id,pinned:false,revision:0});expect(pins.setPin(ctx(UserRole.CHILD,1),shared.id,false)).toEqual({taskId:shared.id,pinned:false,revision:2});
 expect(()=>pins.setPin(ctx(UserRole.CHILD),hidden.id,true)).toThrow(expect.objectContaining({status:404}));expect(()=>pins.setPin(ctx(UserRole.GUEST),shared.id,true)).toThrow(expect.objectContaining({status:403}));expect(reader.all('SELECT * FROM productivity_tasks ORDER BY id')).toEqual(before);expect(sqlite.sqliteLoad().tasks.map(task=>({id:task.id,history:task.history}))).toEqual(history);expect(sqlite.sqliteLoad().rewardLedger).toEqual([]);expect(sqlite.sqliteLoad().notifications).toEqual([]);
});
