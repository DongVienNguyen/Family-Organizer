import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {checksum} from '../snapshotValidation.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createStructureCommands} from './structure.js';
import {createTaskCommands} from './tasks.js';
import type {TaskReader} from './access.js';
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:tag-ownership',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const reader:TaskReader={get:(sql,...args)=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql,...args)=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction});
const ctx=(role=UserRole.ADMIN,revision=0,requestId=randomUUID())=>({actor:{userId:role,role},expectedRevision:revision,requestId});
let initialized=false;
function setup(){if(initialized)return;fixture(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;}
it('explicit migration3 adds durable tag owner storage without changing earlier identities',()=>{
 setup();expect(reader.all("SELECT version FROM app_migrations WHERE namespace='productivity' ORDER BY version")).toEqual([{version:1},{version:2},{version:3}]);expect(reader.all('PRAGMA table_info(productivity_tag_owners)').map(row=>row.name)).toEqual(['tag_id','user_id']);
 const before=reader.all('SELECT * FROM app_migrations ORDER BY namespace,version');migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});expect(reader.all('SELECT * FROM app_migrations ORDER BY namespace,version')).toEqual(before);
});
it('unused Member-created tags stay discoverable only to their owner/Admin with stable retry identity',()=>{
 setup();const request=ctx(UserRole.MEMBER),input={name:'Synthetic unused private tag'},tag=structure.saveTag(request,input);expect(structure.saveTag(request,input)).toEqual(tag);expect(reader.get('SELECT user_id FROM productivity_tag_owners WHERE tag_id=?',tag.id)).toEqual({user_id:UserRole.MEMBER});
 for(const role of [UserRole.MEMBER,UserRole.ADMIN])expect(structure.getCatalog(ctx(role).actor).tags.some(item=>item.id===tag.id&&item.name===input.name)).toBe(true);for(const role of [UserRole.CHILD,UserRole.GUEST])expect(structure.getCatalog(ctx(role).actor).tags.some(item=>item.id===tag.id)).toBe(false);
});
it('shared snapshot3 restores unused tag owner/identity without reward or notification replay',async()=>{
 setup();const tag=structure.saveTag(ctx(UserRole.MEMBER),{name:'Synthetic backed-up unused tag'}),saved=fixture(tx=>snapshot.collectAppSnapshot(tx));expect(saved.manifest.domains.productivity).toBe(3);expect(saved.tables.productivity_tag_owners).toContainEqual({tag_id:tag.id,user_id:UserRole.MEMBER});
 fixture(tx=>tx.run('DELETE FROM productivity_tag_owners WHERE tag_id=?',tag.id));await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});expect(structure.getCatalog(ctx(UserRole.MEMBER).actor).tags.some(item=>item.id===tag.id)).toBe(true);expect(sqlite.sqliteLoad().rewardLedger).toEqual([]);expect(sqlite.sqliteLoad().notifications).toEqual([]);
});
it('Child task creation cannot insert arbitrary missing global catalog IDs under schema3',()=>{
 setup();const before=reader.get('SELECT count(*) AS n FROM productivity_tags').n;expect(()=>tasks.createTask(ctx(UserRole.CHILD),{listId:'legacy-family',title:'Synthetic forbidden new tag',tagIds:['synthetic-child-global-forgery']})).toThrow(expect.objectContaining({status:403}));expect(reader.get('SELECT count(*) AS n FROM productivity_tags').n).toBe(before);
});
it('a limited role can choose an existing visible tag but cannot claim an unused private tag ID',()=>{
 setup();const visible=structure.saveTag(ctx(),{name:'Synthetic shared existing tag'});tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic public tag source',isShared:true,tagIds:[visible.id]});const selected=tasks.createTask(ctx(UserRole.CHILD),{listId:'legacy-family',title:'Synthetic allowed tag selection',tagIds:[visible.id]});expect(selected.tagIds).toEqual([visible.id]);const hidden=structure.saveTag(ctx(UserRole.MEMBER),{name:'Synthetic other user unused tag'});expect(()=>tasks.updateTask(ctx(UserRole.CHILD,selected.revision),selected.id,{tagIds:[hidden.id]})).toThrow(expect.objectContaining({status:404}));
});
it('retained Child task writers cannot create arbitrary global catalogs',async()=>{
 setup();const {FamilyDB}=await import('../db.js');expect(()=>FamilyDB.saveTask({title:'Synthetic legacy forbidden tags',tags:['synthetic-legacy-child-tag']},UserRole.CHILD,'synthetic-child')).toThrow(expect.objectContaining({status:403}));expect(reader.get('SELECT id FROM productivity_tags WHERE id=?','synthetic-legacy-child-tag')).toBeUndefined();
});
it('retained Adult free-form tags acquire durable ownership in the same gateway transaction',async()=>{
 setup();const {FamilyDB}=await import('../db.js'),created=FamilyDB.saveTask({title:'Synthetic adult freeform tags',tags:['synthetic-adult-owned-freeform']},UserRole.MEMBER,'synthetic-member');expect(created.tags).toEqual(['synthetic-adult-owned-freeform']);expect(reader.get('SELECT user_id FROM productivity_tag_owners WHERE tag_id=?','synthetic-adult-owned-freeform')).toEqual({user_id:UserRole.MEMBER});
 FamilyDB.saveTask({id:created.id,tags:[]},UserRole.MEMBER,'synthetic-member');expect(structure.getCatalog(ctx(UserRole.MEMBER).actor).tags.some(item=>item.id==='synthetic-adult-owned-freeform')).toBe(true);
});
it('role downgrade narrows unused-owner label discovery and blocks the committed catalog retry',()=>{
 setup();const request=ctx(UserRole.MEMBER),input={name:'Synthetic role-scoped unused tag'},tag=structure.saveTag(request,input);fixture(tx=>{tx.legacy.users.find(user=>user.id===UserRole.MEMBER)!.role=UserRole.CHILD;});
 try{const actor={userId:UserRole.MEMBER,role:UserRole.CHILD};expect(structure.getCatalog(actor).tags.some(item=>item.id===tag.id)).toBe(false);expect(()=>structure.saveTag({...request,actor},input)).toThrow(expect.objectContaining({status:403}));}finally{fixture(tx=>{tx.legacy.users.find(user=>user.id===UserRole.MEMBER)!.role=UserRole.MEMBER;});}
});
it('owner restore rejects forged users or foreign tag IDs before replacing valid data',()=>{
 setup();const saved=fixture(tx=>snapshot.collectAppSnapshot(tx));for(const patch of [{tag_id:'missing-private-tag',user_id:UserRole.MEMBER},{tag_id:saved.tables.productivity_tag_owners[0].tag_id,user_id:'missing-user'}]){const bad=structuredClone(saved);bad.tables.productivity_tag_owners[0]=patch;bad.manifest.checksum=checksum(bad);expect(()=>snapshot.validateAppSnapshot(bad)).toThrow('Invalid productivity snapshot reference');}expect(structure.getCatalog(ctx().actor).tags.length).toBeGreaterThan(0);
});
