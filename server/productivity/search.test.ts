import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createTaskCommands} from './tasks.js';
import {createTaskQuery} from './query.js';
import {FamilyDB} from '../db.js';
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:indexed-search',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const actor={userId:UserRole.CHILD,role:UserRole.CHILD},admin={userId:UserRole.ADMIN,role:UserRole.ADMIN},clock={nowUtc:'2026-10-14T05:00:00.000Z',timezone:'Asia/Saigon'};
let initialized=false;
function setup(){if(!initialized){fixture(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-14T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;}fixture(tx=>{tx.run('DELETE FROM productivity_tasks');sqlite.sqliteRefreshCanonicalTasks(tx.legacy);});}
const tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction}),ctx=(revision=0)=>({actor:admin,requestId:randomUUID(),expectedRevision:revision});
const create=(title:string,body='',isShared=true)=>tasks.createTask(ctx(),{listId:'legacy-family',title,body,isShared});
it('indexed substring candidates are narrowed before decoding while private rows never affect hits/counts',()=>{
 setup();const selected=create('Đưa đón trẻ'),hidden=create('Đưa đón trẻ private','',false);for(let i=0;i<40;i++)create('Synthetic unrelated '+i);
 let decoded=0;const monitored={...reader,all:(sql:string,...args:any[])=>{const rows=reader.all(sql,...args) as any[];for(const row of rows)if(Object.hasOwn(row,'legacy_json')){expect(row.id).not.toBe(hidden.id);decoded++;}return rows;}};const page=createTaskQuery({reader:monitored}).queryTasks(actor,{rootsOnly:true,query:'dua don tre'},clock,null);
 expect(page.items.map(row=>row.id)).toEqual([selected.id]);expect(page.totalUnique).toBe(1);expect(decoded).toBe(1);
});
it('short Unicode newline punctuation and quoted queries retain exact substring behavior',()=>{
 setup();const cases=[['GIẤY TỜ','giay to'],['Đưa đón','đón'],['A','a\nbc'],['quote "with" punctuation!','quote "with"'],['😀ViỆt 😀','😀viet']];
 const ids=cases.map(([title])=>create(title,title==='A'?'BC':'').id);const query=createTaskQuery({reader});
 cases.forEach(([,text],i)=>expect(query.queryTasks(actor,{rootsOnly:true,query:text},clock,null).items.map(row=>row.id)).toEqual([ids[i]]));
 expect(query.queryTasks(actor,{rootsOnly:true,query:'BC'},clock,null).items.map(row=>row.id)).toEqual([ids[2]]);
});
it('canonical edits legacy edits and deletions update the same indexed task ID inside I01',()=>{
 setup();const task=create('Synthetic original wording'),query=createTaskQuery({reader}),find=(word:string)=>query.queryTasks(actor,{rootsOnly:true,query:word},clock,null).items.map(row=>row.id);
 expect(find('original')).toEqual([task.id]);tasks.updateTask(ctx(task.revision),task.id,{title:'Synthetic canonical wording'});expect(find('original')).toEqual([]);expect(find('canonical')).toEqual([task.id]);FamilyDB.saveTask({id:task.id,title:'Synthetic retained legacy wording',baseUpdatedAt:FamilyDB.getTasks().find(row=>row.id===task.id)!.updatedAt},UserRole.ADMIN,'synthetic-admin');expect(find('canonical')).toEqual([]);expect(find('retained')).toEqual([task.id]);FamilyDB.deleteTask(task.id,UserRole.ADMIN,'synthetic-admin');expect(find('retained')).toEqual([]);expect(query.queryTasks(actor,{rootsOnly:true,includeTrash:true,trashOnly:true,query:'retained'},clock,null).items.map(row=>row.id)).toEqual([task.id]);
});
it('a failed writer rolls back task and derived search rows together',()=>{
 setup();const task=create('Synthetic before rollback');const before=reader.all('SELECT * FROM productivity_search_documents');
 expect(()=>fixture(tx=>{tx.run('UPDATE productivity_search_documents SET content=? WHERE task_id=?','synthetic changed',task.id);throw Error('synthetic rollback');})).toThrow('synthetic rollback');
 expect(reader.all('SELECT * FROM productivity_search_documents')).toEqual(before);expect(createTaskQuery({reader}).queryTasks(actor,{rootsOnly:true,query:'before rollback'},clock,null).items.map(row=>row.id)).toEqual([task.id]);
});
