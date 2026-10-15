import {checksum} from '../snapshotValidation.js';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {registerProductivityMigration,productivityMigrationChecksum,productivityStructureChecksum,productivityTagChecksum,productivityPinChecksum} from './migrate.js';
import {inspectProductivityStorage} from './inspection.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:view-upgrade',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args) as Record<string,unknown>,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args) as Record<string,unknown>[]};
let upgraded=false;
function upgrade(){
 if(upgraded)return;
 fixture(tx=>{tx.legacy.tasks=[legacyTask('synthetic-index-upgrade',{title:'Đưa đón trẻ',description:'GIẤY TỜ',creatorId:UserRole.ADMIN,assigneeId:UserRole.ADMIN})];tx.legacy.users=[{id:UserRole.ADMIN,role:UserRole.ADMIN,username:'synthetic-admin',fullName:'Synthetic admin',passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-14T00:00:00Z'}];});
 configureCanonicalTaskBridge({sqlite,gateway,migrations:{...migrations,registerDomainMigration:(ns,v,fn,sum)=>{if(v<=4)migrations.registerDomainMigration(ns,v,fn,sum);}},snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));
 const frozen=reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' ORDER BY version"),tasks=reader.all('SELECT * FROM productivity_tasks'),schema=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');
 expect(inspectProductivityStorage(reader)).toBe(true);expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(schema);
 registerProductivityMigration({registerMigration:(ns,v,fn,sum)=>{if(v<=5)migrations.registerDomainMigration(ns,v,fn,sum);},registerSnapshot:snapshot.registerSnapshotTable,registerValidator:snapshot.registerSnapshotValidator});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 expect(reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' AND version<=4 ORDER BY version")).toEqual(frozen);expect(reader.all('SELECT * FROM productivity_tasks')).toEqual(tasks);
 expect(reader.get("SELECT max(version) AS version FROM app_migrations WHERE namespace='productivity'")).toEqual({version:5});upgraded=true;
}
it('explicit v5 upgrade preserves frozen1–4 and current task identities; inspection never auto-upgrades',()=>{
 expect([productivityMigrationChecksum,productivityStructureChecksum,productivityTagChecksum,productivityPinChecksum]).toEqual(['8f978329c9628a1c54b25a456a34c46d74c868397f78b9592ef2c026e95a9f90','c8f354941f720cd1e7b973ee422180b4c1e7488d4ac23f4c900460474bce1ed3','42134eeb5d73fe80d730b47a459d30b26b03f352aa5da03b1cf88f661bb04013','a7e65609adf72db386db0b90d3121f4fdd1b1ff37b85b27660ce694be7da03f4']);
 upgrade();expect(inspectProductivityStorage(reader)).toBe(true);expect(reader.all('SELECT * FROM productivity_views')).toEqual([]);expect(reader.all('SELECT * FROM productivity_search_documents')).toEqual([{task_id:'synthetic-index-upgrade',content:'dua don tre\ngiay to'}]);
});
it('shared snapshot captures v5 documents/grams and rejects incoherent index before writing',()=>{
 upgrade();const saved=fixture(tx=>snapshot.collectAppSnapshot(tx));expect(saved.manifest.domains.productivity).toBe(5);expect(saved.tables.productivity_search_grams.length).toBeGreaterThan(0);expect(saved.tables.productivity_views).toEqual([]);
 const bad=structuredClone(saved);bad.tables.productivity_search_documents[0].content='synthetic inconsistent';bad.manifest.checksum=checksum(bad);expect(()=>snapshot.validateAppSnapshot(bad)).toThrow('Invalid productivity search snapshot');
});
it('future7 inspection refuses before schema mutation',()=>{
 upgrade();sqlite.sqliteConnection().prepare("INSERT INTO app_migrations VALUES('productivity',7,'future','2026-10-14T00:00:00Z')").run();try{const schema=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');expect(()=>inspectProductivityStorage(reader)).toThrow('Unsupported productivity migration');expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(schema);}finally{sqlite.sqliteConnection().prepare("DELETE FROM app_migrations WHERE namespace='productivity' AND version=7").run();}
});
it('schema5 retains personal pin reads from the earlier schema4 API',async()=>{
 upgrade();const {createTaskPins}=await import('./pins.js'),pins=createTaskPins({reader,write:gateway.withAppWriteTransaction});expect(pins.getPin({userId:UserRole.ADMIN,role:UserRole.ADMIN},'synthetic-index-upgrade')).toEqual({taskId:'synthetic-index-upgrade',pinned:false,revision:0});
});
it('schema5 retains earlier section commands without changing task lifecycle',async()=>{
 upgrade();const {createStructureCommands}=await import('./structure.js'),structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction});const section=structure.saveSection({actor:{userId:UserRole.ADMIN,role:UserRole.ADMIN},requestId:randomUUID(),expectedRevision:0},{listId:'legacy-family',title:'Synthetic v5 compatible section'});expect(section.listId).toBe('legacy-family');expect(reader.get('SELECT lifecycle FROM productivity_tasks WHERE id=?','synthetic-index-upgrade')).toEqual({lifecycle:'todo'});
});
it('shared restore preserves saved config and search IDs while rejecting a corrupt replacement before mutation',async()=>{
 upgrade();const {createTaskViews}=await import('./views.js'),views=createTaskViews({reader,write:gateway.withAppWriteTransaction}),actor={userId:UserRole.ADMIN,role:UserRole.ADMIN},view=views.saveView({actor,requestId:randomUUID(),expectedRevision:0},{title:'Synthetic backed-up view',filter:{rootsOnly:true,query:'dua don tre'},kind:'list',config:{kind:'list',sort:'rank',group:'none'}}),saved=fixture(tx=>snapshot.collectAppSnapshot(tx));
 fixture(tx=>tx.run('DELETE FROM productivity_views'));await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});expect(views.getView(actor,view.id)).toEqual(view);const {createTaskQuery}=await import('./query.js');expect(createTaskQuery({reader}).queryTasks(actor,view.filter,{nowUtc:'2026-10-14T05:00:00.000Z',timezone:'Asia/Saigon'},null).items.map(row=>row.id)).toEqual(['synthetic-index-upgrade']);
 const bad=structuredClone(saved);bad.tables.productivity_views[0].config_json=JSON.stringify({kind:'calendar',style:'agenda',range:{from:'2026-10-14T00:00:00Z',toExclusive:'2026-10-15T00:00:00Z'}});bad.manifest.checksum=checksum(bad);const changes=reader.get('SELECT total_changes() AS n');expect(()=>snapshot.validateAppSnapshot(bad)).toThrow();expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);expect(sqlite.sqliteLoad().rewardLedger).toEqual([]);expect(sqlite.sqliteLoad().notifications).toEqual([]);
});
it('rejects persisted view revision0 before maintenance, file boundaries or SQL changes',async()=>{
 upgrade();const {createTaskViews}=await import('./views.js'),views=createTaskViews({reader,write:gateway.withAppWriteTransaction}),actor={userId:UserRole.ADMIN,role:UserRole.ADMIN};
 views.saveView({actor,requestId:randomUUID(),expectedRevision:0},{title:'Synthetic persisted revision',filter:{rootsOnly:true},kind:'list',config:{kind:'list',sort:'rank',group:'none'}});
 const bad=structuredClone(fixture(tx=>snapshot.collectAppSnapshot(tx)));bad.tables.productivity_views[0].revision=0;bad.manifest.checksum=checksum(bad);
 const changes=reader.get('SELECT total_changes() AS n'),boundaries:string[]=[];
 await expect((async()=>snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(bad),{maintenance:async fn=>{boundaries.push('maintenance');return fn();},onBoundary:boundary=>boundaries.push(boundary)}))()).rejects.toThrow();
 expect(boundaries).toEqual([]);expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
it('explicit upgrade of two large valid v4 tasks keeps old checksums, IDs and shared backups usable',async()=>{
 upgrade();fixture(tx=>{tx.run('DELETE FROM productivity_tasks');sqlite.sqliteRefreshCanonicalTasks(tx.legacy);tx.exec('DROP TABLE productivity_search_grams;DROP TABLE productivity_search_documents;DROP TABLE productivity_views');tx.run("DELETE FROM app_migrations WHERE namespace='productivity' AND version=5");});
 const frozen=reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' ORDER BY version");
 const {createTaskCommands}=await import('./tasks.js'),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction}),actor={userId:UserRole.ADMIN,role:UserRole.ADMIN};
 let state=731;const body=()=>Array.from({length:60000},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return String.fromCharCode(0x1000+((state>>>16)%128));}).join('');
 const ids=[1,2].map(i=>tasks.createTask({actor,requestId:randomUUID(),expectedRevision:0},{listId:'legacy-family',title:'Synthetic large v4 '+i,body:body()}).id);
 const before=fixture(tx=>snapshot.collectAppSnapshot(tx));expect(before.manifest.domains.productivity).toBe(4);
 migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 expect(reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' AND version<=4 ORDER BY version")).toEqual(frozen);
 expect(new Set(reader.all('SELECT id FROM productivity_tasks').map(row=>row.id))).toEqual(new Set(ids));
 expect(reader.get('SELECT count(*) AS n FROM productivity_search_grams').n).toBeGreaterThan(100000);
 const after=fixture(tx=>snapshot.collectAppSnapshot(tx));expect(after.manifest.domains.productivity).toBe(5);expect(()=>snapshot.validateAppSnapshot(after)).not.toThrow();
});
