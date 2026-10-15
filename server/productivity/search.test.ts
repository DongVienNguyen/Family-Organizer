import {it,expect,describe,beforeAll} from 'vitest';
import {checksum} from '../snapshotValidation.js';
import {inspectRecoverySnapshot} from '../recoverySnapshotInspection.js';
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
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args) as Record<string,unknown>,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args) as Record<string,unknown>[]};
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
it('canonical and legacy lone-surrogate writes keep native index keys unique and snapshot coherent',()=>{
 setup();const title='Synthetic '+String.fromCharCode(0xd800,0xd801,0xd802,0xd803),created=create(title),nativeTitle=Buffer.from(title).toString('utf8');
 expect(reader.get('SELECT title FROM productivity_tasks WHERE id=?',created.id).title).toBe(nativeTitle);
 const legacyTitle='Synthetic retained '+String.fromCharCode(0xd800,0xd801,0xd802,0xd803);
 FamilyDB.saveTask({id:created.id,title:legacyTitle,baseUpdatedAt:FamilyDB.getTasks().find(row=>row.id===created.id)!.updatedAt},UserRole.ADMIN,'synthetic-admin');
 const saved=fixture(tx=>snapshot.collectAppSnapshot(tx));expect(()=>snapshot.validateAppSnapshot(saved)).not.toThrow();
 const expected=Buffer.from(legacyTitle).toString('utf8');expect(reader.get('SELECT content FROM productivity_search_documents WHERE task_id=?',created.id).content).toBe(expected.toLowerCase()+'\n');
});
describe('large valid task shared-backup boundaries',()=>{
 let saved:ReturnType<typeof snapshot.collectAppSnapshot>;
 beforeAll(()=>{
  setup();let state=173;const body=()=>Array.from({length:60000},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return String.fromCharCode(0x1000+((state>>>16)%128));}).join('');
  create('Synthetic long task one',body());create('Synthetic long task two',body());
 });
 it('captures the real large task writes beyond100000 derived rows',()=>{
  expect(reader.get('SELECT count(*) AS n FROM productivity_search_grams').n).toBeGreaterThan(100000);
  saved=fixture(tx=>snapshot.collectAppSnapshot(tx));
 });
 it('admits the captured large shared snapshot',()=>{expect(()=>snapshot.validateAppSnapshot(saved)).not.toThrow();});
 it('admits the same large snapshot through readonly recovery inspection',()=>{expect(()=>inspectRecoverySnapshot(saved,sqlite.sqliteConnection().name)).not.toThrow();});
});
it('canonical100001 rows remain refused with the trusted derived index registration',()=>{
 setup();create('Synthetic canonical budget');const saved=fixture(tx=>snapshot.collectAppSnapshot(tx));
 const invalid=structuredClone(saved);invalid.legacy.notes=Array.from({length:100001},(_,i)=>({id:'synthetic-budget-'+i}));invalid.manifest.checksum=checksum(invalid);
 expect(()=>snapshot.validateAppSnapshot(invalid)).toThrow('Snapshot row limit exceeded');
});
