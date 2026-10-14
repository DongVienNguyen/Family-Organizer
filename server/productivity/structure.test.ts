import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {FamilyDB} from '../db.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createTaskCommands} from './tasks.js';
import {createStructureCommands} from './structure.js';
import {loadTask} from './store.js';
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'productivity:structure-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction});
const ctx=(role=UserRole.ADMIN,revision=0,requestId=randomUUID())=>({actor:{userId:role,role},expectedRevision:revision,requestId});
let initialized=false;
function setup(){if(!initialized){fixture(tx=>{tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}));tx.legacy.tasks=[];});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;}fixture(tx=>{tx.legacy.tasks=[];tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER);});}
const create=(role=UserRole.ADMIN,patch:any={})=>tasks.createTask(ctx(role),{listId:'legacy-family',title:'Synthetic structure '+randomUUID(),...patch});
const row=(id:string)=>fixture(tx=>loadTask(tx,id)!);
it('creates/updates a private Member list with server-owned identity, revision, retry and stale refusal',()=>{
 setup();const context=ctx(UserRole.MEMBER),input={title:'Synthetic private list',isShared:false};const first=structure.saveList(context,input);expect(first).toMatchObject({ownerId:UserRole.MEMBER,title:input.title,isShared:false,revision:1,archivedAt:null});expect(structure.saveList(context,input)).toEqual(first);
 const edited=structure.saveList(ctx(UserRole.MEMBER,1),{id:first.id,title:'Synthetic renamed',isShared:false});expect(edited.revision).toBe(2);expect(edited.ownerId).toBe(UserRole.MEMBER);expect(()=>structure.saveList(ctx(UserRole.MEMBER,1),{id:first.id,title:'Stale',isShared:true})).toThrow(expect.objectContaining({status:409}));
});
it.each([UserRole.CHILD,UserRole.GUEST])('limited role %s cannot create catalogs or grant itself list access',role=>{
 setup();expect(()=>structure.saveList(ctx(role),{title:'Forbidden',isShared:true})).toThrow(expect.objectContaining({status:403}));expect(()=>structure.setListGrant(ctx(role,1),'legacy-family',{userId:role,permission:'manage'})).toThrow(expect.objectContaining({status:403}));
});
it('read grant does not allow catalog changes or a cached mutation after revocation',()=>{
 setup();const list=structure.saveList(ctx(),{title:'Synthetic managed',isShared:false});structure.setListGrant(ctx(UserRole.ADMIN,list.revision),list.id,{userId:UserRole.MEMBER,permission:'write'});
 const current=structure.getCatalog({userId:UserRole.ADMIN,role:UserRole.ADMIN}).lists.find((item:any)=>item.id===list.id);expect(()=>structure.saveList(ctx(UserRole.MEMBER,current.revision),{id:list.id,title:'Forbidden',isShared:false})).toThrow(expect.objectContaining({status:403}));
 structure.setListGrant(ctx(UserRole.ADMIN,current.revision),list.id,{userId:UserRole.MEMBER,permission:'manage'});const writable=structure.getCatalog({userId:UserRole.ADMIN,role:UserRole.ADMIN}).lists.find((item:any)=>item.id===list.id),request=ctx(UserRole.MEMBER,writable.revision),payload={id:list.id,title:'Granted',isShared:false};expect(structure.saveList(request,payload).title).toBe('Granted');
 const after=structure.getCatalog({userId:UserRole.ADMIN,role:UserRole.ADMIN}).lists.find((item:any)=>item.id===list.id);structure.setListGrant(ctx(UserRole.ADMIN,after.revision),list.id,{userId:UserRole.MEMBER,permission:null});expect(()=>structure.saveList(request,payload)).toThrow(expect.objectContaining({status:404}));
});
it('requires task edit plus source/destination list rights and refuses foreign sections atomically',()=>{
 setup();const task=create(UserRole.CHILD),target=structure.saveList(ctx(),{title:'Synthetic destination',isShared:false}),foreign=structure.saveList(ctx(),{title:'Synthetic foreign',isShared:false}),section=structure.saveSection(ctx(),{listId:foreign.id,title:'Foreign section'});
 expect(()=>structure.moveTaskToList(ctx(UserRole.CHILD,task.revision),task.id,target.id,null)).toThrow(expect.objectContaining({status:403}));
 expect(()=>structure.moveTaskToList(ctx(UserRole.ADMIN,task.revision),task.id,target.id,section.id)).toThrow(expect.objectContaining({status:422}));expect(row(task.id)).toMatchObject({listId:'legacy-family',sectionId:null,revision:task.revision});
 const moved=structure.moveTaskToList(ctx(UserRole.ADMIN,task.revision),task.id,target.id,null);expect(moved).toMatchObject({id:task.id,listId:target.id,revision:task.revision+1,rewardPoints:0});expect(moved.legacy.proofImage).toBe(task.legacy.proofImage);
});
it('archives a section into Not Sectioned and retains task IDs, revisions, lifecycle and rewards',()=>{
 setup();const list=structure.saveList(ctx(),{title:'Synthetic board',isShared:true}),section=structure.saveSection(ctx(),{listId:list.id,title:'Done'}),task=create();const moved=structure.moveTaskToList(ctx(UserRole.ADMIN,task.revision),task.id,list.id,section.id);expect(moved.lifecycle).toBe('todo');
 const archived=structure.archiveSection(ctx(UserRole.ADMIN,section.revision),section.id);expect(archived.archivedAt).toBeTruthy();expect(row(task.id)).toMatchObject({id:task.id,listId:list.id,sectionId:null,lifecycle:'todo',revision:moved.revision+1});expect(FamilyDB.getRewardLedger()).toEqual([]);expect(structure.getCatalog({userId:UserRole.ADMIN,role:UserRole.ADMIN}).sections.some((item:any)=>item.id===section.id)).toBe(false);
});
it('prevents cross-list parents and public children under a private parent, without changing source records',()=>{
 setup();const parent=create(UserRole.CHILD),child=create(UserRole.CHILD,{isShared:true});expect(()=>structure.setTaskParent(ctx(UserRole.CHILD,child.revision),child.id,parent.id)).toThrow(expect.objectContaining({status:422}));expect(row(child.id).parentId).toBeNull();
 const privateChild=create(UserRole.CHILD),linked=structure.setTaskParent(ctx(UserRole.CHILD,privateChild.revision),privateChild.id,parent.id);expect(linked.parentId).toBe(parent.id);expect(linked.rewardPoints).toBe(0);
 const otherList=structure.saveList(ctx(),{title:'Other list',isShared:false}),foreign=create();structure.moveTaskToList(ctx(UserRole.ADMIN,foreign.revision),foreign.id,otherList.id,null);expect(()=>structure.setTaskParent(ctx(UserRole.ADMIN,linked.revision),linked.id,foreign.id)).toThrow(expect.objectContaining({status:422}));
});
it('rejects tree cycles and depth6 including depth introduced by moving an existing subtree',()=>{
 setup();const rows=Array.from({length:6},()=>create());for(let i=1;i<5;i++)structure.setTaskParent(ctx(UserRole.ADMIN,rows[i].revision),rows[i].id,rows[i-1].id);
 expect(()=>structure.setTaskParent(ctx(UserRole.ADMIN,rows[0].revision),rows[0].id,rows[4].id)).toThrow(expect.objectContaining({status:422}));expect(()=>structure.setTaskParent(ctx(UserRole.ADMIN,rows[5].revision),rows[5].id,rows[4].id)).toThrow(expect.objectContaining({status:422}));expect(row(rows[5].id).parentId).toBeNull();
 const extra=create(),sub=create();structure.setTaskParent(ctx(UserRole.ADMIN,sub.revision),sub.id,extra.id);expect(()=>structure.setTaskParent(ctx(UserRole.ADMIN,extra.revision),extra.id,rows[3].id)).toThrow(expect.objectContaining({status:422}));
});
it('root counts do not duplicate subtasks and private roots remain ACL filtered',()=>{
 setup();const parent=create(UserRole.CHILD),child=create(UserRole.CHILD);structure.setTaskParent(ctx(UserRole.CHILD,child.revision),child.id,parent.id);
 const roots=structure.listRootTasks({userId:UserRole.CHILD,role:UserRole.CHILD});expect(roots.totalUnique).toBe(1);expect(roots.items.map((item:any)=>item.id)).toEqual([parent.id]);expect(structure.listRootTasks({userId:UserRole.GUEST,role:UserRole.GUEST})).toEqual({items:[],totalUnique:0});
});
it('checklist four items/one done derives25percent without completing, changing rewards or duplicating retries',()=>{
 setup();const task=create(UserRole.CHILD),context=ctx(UserRole.CHILD,task.revision),input=Array.from({length:4},(_,i)=>({text:'Synthetic item '+i,done:i===0}));const first=structure.setChecklist(context,task.id,input);expect(first).toMatchObject({taskId:task.id,revision:task.revision+1,progress:25});expect(first.items).toHaveLength(4);expect(new Set(first.items.map((item:any)=>item.id)).size).toBe(4);expect(structure.setChecklist(context,task.id,input)).toEqual(first);
 expect(row(task.id)).toMatchObject({lifecycle:'todo',rewardPoints:0,pendingApproval:false});expect(FamilyDB.getRewardLedger()).toEqual([]);expect(()=>structure.getChecklist({userId:UserRole.GUEST,role:UserRole.GUEST},task.id)).toThrow(expect.objectContaining({status:404}));
 expect(()=>structure.setChecklist(ctx(UserRole.CHILD,task.revision),task.id,input)).toThrow(expect.objectContaining({status:409}));
});
it('cannot steal another task checklist item or retrieve private cached items after task visibility is revoked',()=>{
 setup();const task=create(),other=create(),first=structure.setChecklist(ctx(UserRole.ADMIN,task.revision),task.id,[{text:'Private item',done:false}]);expect(()=>structure.setChecklist(ctx(UserRole.ADMIN,other.revision),other.id,first.items)).toThrow(expect.objectContaining({status:422}));expect(row(other.id).revision).toBe(other.revision);
 fixture(tx=>tx.run("INSERT INTO productivity_list_grants VALUES(?,?,?)",'legacy-family',UserRole.MEMBER,'write'));const context=ctx(UserRole.MEMBER,first.revision),input=first.items.map((item:any)=>({id:item.id,text:item.text,done:true}));const changed=structure.setChecklist(context,task.id,input);expect(changed.progress).toBe(100);fixture(tx=>tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER));expect(()=>structure.setChecklist(context,task.id,input)).toThrow(expect.objectContaining({status:404}));
});
it('preserves catalog/tree/checklist in a shared snapshot and refuses parent completion while subtasks are open',async()=>{
 setup();const parent=create(UserRole.CHILD),child=create(UserRole.CHILD);structure.setTaskParent(ctx(UserRole.CHILD,child.revision),child.id,parent.id);structure.setChecklist(ctx(UserRole.CHILD,parent.revision),parent.id,[{text:'Synthetic backup item',done:true}]);const saved=fixture(tx=>snapshot.collectAppSnapshot(tx));
 expect(()=>FamilyDB.saveTask({id:parent.id,status:'completed' as any},UserRole.CHILD,'synthetic')).toThrow(expect.objectContaining({status:422}));expect(row(parent.id).lifecycle).toBe('todo');expect(FamilyDB.getRewardLedger()).toEqual([]);
 await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});expect(row(child.id).parentId).toBe(parent.id);expect(structure.getChecklist({userId:UserRole.CHILD,role:UserRole.CHILD},parent.id).progress).toBe(100);expect(row(parent.id).lifecycle).toBe('todo');
});
it('catalog queries reveal neither private list names nor tags belonging only to hidden tasks',()=>{
 setup();const privateList=structure.saveList(ctx(),{title:'Private catalog label',isShared:false}),tag=structure.saveTag(ctx(),{name:'Private tag name'}),task=create(UserRole.ADMIN,{tagIds:[tag.id]});structure.moveTaskToList(ctx(UserRole.ADMIN,task.revision),task.id,privateList.id,null);
 const limited=structure.getCatalog({userId:UserRole.GUEST,role:UserRole.GUEST});expect(JSON.stringify(limited)).not.toContain('Private catalog label');expect(JSON.stringify(limited)).not.toContain('Private tag name');expect(JSON.stringify(limited)).not.toContain(privateList.id);
});
it('parent visibility revocation blocks own-child reads and cached checklist results',()=>{
 setup();fixture(tx=>tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)','legacy-family',UserRole.MEMBER,'write'));
 const parent=create(),child=create(UserRole.MEMBER);const linked=structure.setTaskParent(ctx(UserRole.MEMBER,child.revision),child.id,parent.id);const context=ctx(UserRole.MEMBER,linked.revision),input=[{text:'Synthetic parent-scoped private item',done:false}];structure.setChecklist(context,child.id,input);
 fixture(tx=>tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER));expect(()=>structure.getChecklist({userId:UserRole.MEMBER,role:UserRole.MEMBER},child.id)).toThrow(expect.objectContaining({status:404}));expect(()=>structure.setChecklist(context,child.id,input)).toThrow(expect.objectContaining({status:404}));
});
it('generic parent/child edits cannot widen tree visibility beyond the parent',()=>{
 setup();const parent=create(UserRole.CHILD),child=create(UserRole.CHILD);const linked=structure.setTaskParent(ctx(UserRole.CHILD,child.revision),child.id,parent.id);
 expect(()=>tasks.updateTask(ctx(UserRole.ADMIN,linked.revision),child.id,{assigneeId:UserRole.GUEST})).toThrow(expect.objectContaining({status:422}));expect(row(child.id).assigneeId).toBeNull();
 expect(()=>FamilyDB.saveTask({id:child.id,isShared:true},UserRole.CHILD,'synthetic')).toThrow(expect.objectContaining({status:422}));expect(row(child.id).isShared).toBe(false);
});
it('catalog ACL filters private labels before the injected reader returns their content',()=>{
 setup();const hiddenList=structure.saveList(ctx(),{title:'Synthetic hidden catalog content',isShared:false}),hiddenTag=structure.saveTag(ctx(),{name:'Synthetic hidden tag content'});create(UserRole.ADMIN,{tagIds:[hiddenTag.id]});
 const rejectHidden=(result:any)=>{for(const row of Array.isArray(result)?result:[result])if(row?.title==='Synthetic hidden catalog content'||row?.name==='Synthetic hidden tag content')throw Error('Reader returned hidden catalog label');return result;};
 const guarded=createStructureCommands({write:gateway.withAppWriteTransaction,reader:{get:(sql,...args)=>rejectHidden(reader.get(sql,...args)),all:(sql,...args)=>rejectHidden(reader.all(sql,...args))}});
 expect(guarded.getCatalog({userId:UserRole.GUEST,role:UserRole.GUEST}).lists.some(item=>item.id===hiddenList.id)).toBe(false);
});
