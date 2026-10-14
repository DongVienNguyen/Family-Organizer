import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';import * as gateway from '../appStore.js';import * as migrations from '../appMigrations.js';import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createStructureCommands} from './structure.js';import {createTaskCommands} from './tasks.js';
import type {TaskReader} from './access.js';
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:drawer-subtasks',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const reader:TaskReader={get:(sql,...args)=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql,...args)=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction});
const ctx=(role=UserRole.ADMIN,revision=0,requestId=randomUUID())=>({actor:{userId:role,role},expectedRevision:revision,requestId});
let initialized=false;
function setup(){if(initialized)return;fixture(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;}
it('atomic subtask creation preserves parent/list identity and defaults reward0/due none/priority none',()=>{
 setup();const parent=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic parent',isShared:true}),request=ctx(UserRole.ADMIN,parent.revision),before=reader.get('SELECT count(*) AS n FROM app_commands').n,child=structure.createSubtask(request,parent.id,{title:'Synthetic child'});
 expect(child.parentId).toBe(parent.id);expect(child.listId).toBe(parent.listId);expect(child.rewardPoints).toBe(0);expect(child.due).toEqual({kind:'none'});expect(child.priority).toBe('none');expect(child.legacy.comments).toEqual([]);expect(structure.createSubtask(request,parent.id,{title:'Synthetic child'})).toEqual(child);expect(reader.get('SELECT count(*) AS n FROM app_commands').n).toBe(before+1);expect(sqlite.sqliteLoad().rewardLedger).toEqual([]);expect(sqlite.sqliteLoad().notifications).toEqual([]);
});
it('depth6 or broader child visibility aborts the entire creation without an orphan root/audit',()=>{
 setup();let parent=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic depth root'});for(let depth=2;depth<=5;depth++)parent=structure.createSubtask(ctx(UserRole.ADMIN,parent.revision),parent.id,{title:'Synthetic depth '+depth});
 const before=reader.get('SELECT count(*) AS n FROM productivity_tasks').n,commands=reader.get('SELECT count(*) AS n FROM app_commands').n;expect(()=>structure.createSubtask(ctx(UserRole.ADMIN,parent.revision),parent.id,{title:'Synthetic depth6'})).toThrow(expect.objectContaining({status:422}));expect(reader.get('SELECT count(*) AS n FROM productivity_tasks').n).toBe(before);expect(reader.get('SELECT count(*) AS n FROM app_commands').n).toBe(commands);
 const root=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic private parent'}),count=reader.get('SELECT count(*) AS n FROM productivity_tasks').n;expect(()=>structure.createSubtask(ctx(UserRole.ADMIN,root.revision),root.id,{title:'Synthetic wider child',isShared:true})).toThrow(expect.objectContaining({status:422}));expect(reader.get('SELECT count(*) AS n FROM productivity_tasks').n).toBe(count);
});
it('current parent revision and edit ACL are required before command retry lookup',()=>{
 setup();const parent=tasks.createTask(ctx(UserRole.CHILD),{listId:'legacy-family',title:'Synthetic child-owned parent'}),request=ctx(UserRole.CHILD,parent.revision),input={title:'Synthetic child-owned subtask'};const child=structure.createSubtask(request,parent.id,input);expect(child.creatorId).toBe(UserRole.CHILD);
 expect(()=>structure.createSubtask(ctx(UserRole.CHILD,parent.revision+1),parent.id,{title:'Stale parent'})).toThrow(expect.objectContaining({status:409}));
 fixture(tx=>{tx.legacy.users.find(user=>user.id===UserRole.CHILD)!.isDeleted=true;});try{expect(()=>structure.createSubtask(request,parent.id,input)).toThrow(expect.objectContaining({status:403}));}finally{fixture(tx=>{tx.legacy.users.find(user=>user.id===UserRole.CHILD)!.isDeleted=false;});}
});
it('guest/shared read and forged creator/reward/parent inputs cannot create a subtask',()=>{
 setup();const parent=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic shared parent',isShared:true});expect(()=>structure.createSubtask(ctx(UserRole.GUEST,parent.revision),parent.id,{title:'Guest forgery'})).toThrow(expect.objectContaining({status:403}));expect(()=>structure.createSubtask(ctx(UserRole.ADMIN,parent.revision),parent.id,{title:'Forged metadata',creatorId:'forged',rewardPoints:100,parentId:'other'} as any)).toThrow(expect.objectContaining({status:400}));
});
it('shared snapshots retain subtask identities/provenance without granting rewards or replaying notices',async()=>{
 setup();const parent=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic backed-up parent'}),child=structure.createSubtask(ctx(UserRole.ADMIN,parent.revision),parent.id,{title:'Synthetic backed-up child'}),saved=fixture(tx=>snapshot.collectAppSnapshot(tx));fixture(tx=>tx.run('DELETE FROM productivity_tasks WHERE id=?',child.id));await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});expect(reader.get('SELECT parent_id FROM productivity_tasks WHERE id=?',child.id)).toEqual({parent_id:parent.id});expect(sqlite.sqliteLoad().tasks.find(t=>t.id===child.id)?.rewardPoints).toBe(0);expect(sqlite.sqliteLoad().rewardLedger).toEqual([]);expect(sqlite.sqliteLoad().notifications).toEqual([]);
});

it('a committed retry cannot bypass loss of permission to create in the current parent list',()=>{
 setup();const board=structure.saveList(ctx(UserRole.MEMBER),{title:'Synthetic creation-permission board',isShared:false}),parent=tasks.createTask(ctx(UserRole.MEMBER),{listId:board.id,title:'Synthetic movable ownership parent'}),request=ctx(UserRole.MEMBER,parent.revision),input={title:'Synthetic committed child'};structure.createSubtask(request,parent.id,input);
 fixture(tx=>{tx.run('UPDATE productivity_lists SET owner_id=? WHERE id=?',UserRole.ADMIN,board.id);tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)',board.id,UserRole.MEMBER,'read');});expect(structure.getCatalog(ctx(UserRole.MEMBER).actor).lists.some(row=>row.id===board.id)).toBe(true);expect(()=>structure.createSubtask(request,parent.id,input)).toThrow(expect.objectContaining({status:403}));
});
