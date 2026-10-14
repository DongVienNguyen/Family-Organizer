import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {encryptRecovery} from '../recoveryEnvelope.js';
import {checksum} from '../snapshotValidation.js';
import {inspectRecoverySnapshot} from '../recoverySnapshotInspection.js';
import {configureTaskStorage} from './bootstrap.js';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {configureCanonicalTaskBridge} from './adapter.js';
import {productivityMigrationChecksum,productivityStructureChecksum} from './migrate.js';
import {inspectProductivityStorage} from './inspection.js';
const command=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'productivity:structure-schema-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
let initialized=false;
function setup(){
 if(initialized)return;
 command(tx=>{tx.legacy.users=[{id:'synthetic-admin',username:'synthetic-admin',fullName:'Synthetic admin',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}];tx.legacy.tasks=[legacyTask('synthetic-structure-task',{creatorId:'synthetic-admin',assigneeId:'synthetic-admin',rotationMemberIds:[],sourceRecurringTaskId:null})];});
 configureCanonicalTaskBridge({sqlite,gateway,migrations:{...migrations,registerDomainMigration:(namespace,version,apply,checksum)=>{if(version<=2)migrations.registerDomainMigration(namespace,version,apply,checksum);}},snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});initialized=true;
}
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
it('adds explicit structure migration2 while retaining immutable migration1 identity',()=>{
 setup();expect(reader.all("SELECT version FROM app_migrations WHERE namespace='productivity' ORDER BY version")).toEqual([{version:1},{version:2}]);
 expect(productivityMigrationChecksum).toBe('8f978329c9628a1c54b25a456a34c46d74c868397f78b9592ef2c026e95a9f90');
 expect(productivityStructureChecksum).toBe('c8f354941f720cd1e7b973ee422180b4c1e7488d4ac23f4c900460474bce1ed3');
 expect(reader.all("SELECT name FROM sqlite_master WHERE name IN('productivity_catalog_revisions','productivity_check_items') ORDER BY name")).toEqual([{name:'productivity_catalog_revisions'},{name:'productivity_check_items'}]);
 const before=reader.all("SELECT * FROM app_migrations WHERE namespace='productivity'");migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});expect(reader.all("SELECT * FROM app_migrations WHERE namespace='productivity'")).toEqual(before);expect(inspectProductivityStorage(reader)).toBe(true);
});
it('shared snapshot records structure version2 without changing task IDs or legacy provenance',()=>{
 setup();const collected=command(tx=>snapshot.collectAppSnapshot(tx));expect(collected.manifest.domains.productivity).toBe(2);
 expect(collected.tables.productivity_catalog_revisions).toEqual([{entity_kind:'list',entity_id:'legacy-family',revision:1,archived_at:null},{entity_kind:'tag',entity_id:'home',revision:1,archived_at:null}]);expect(collected.tables.productivity_check_items).toEqual([]);
 expect(collected.tables.productivity_tasks.map(row=>row.id)).toEqual(['synthetic-structure-task']);expect(collected.legacy.tasks[0].id).toBe('synthetic-structure-task');
});
it('shared restore retains checklist/catalog revisions without replaying reward or notifications',async()=>{
 setup();command(tx=>{tx.run('INSERT INTO productivity_check_items(id,task_id,text,is_done,rank) VALUES(?,?,?,?,?)','synthetic-check','synthetic-structure-task','Synthetic checklist',1,1024);tx.run("UPDATE productivity_catalog_revisions SET revision=4 WHERE entity_kind='list' AND entity_id='legacy-family'");});
 const collected=command(tx=>snapshot.collectAppSnapshot(tx));command(tx=>{tx.run('DELETE FROM productivity_check_items');tx.run('UPDATE productivity_catalog_revisions SET revision=9');});
 await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(collected),{maintenance:async fn=>fn()});
 expect(reader.all('SELECT * FROM productivity_check_items')).toEqual([{id:'synthetic-check',task_id:'synthetic-structure-task',text:'Synthetic checklist',is_done:1,rank:1024}]);expect(reader.get("SELECT revision FROM productivity_catalog_revisions WHERE entity_kind='list' AND entity_id='legacy-family'")).toEqual({revision:4});
 const current=sqlite.sqliteLoad();expect(current.rewardLedger).toEqual([]);expect(current.notifications).toEqual([]);expect(current.tasks.map(task=>task.id)).toEqual(['synthetic-structure-task']);
});
it('future structure migration3 is refused by read-only inspection before any bootstrap writes',()=>{
 setup();command(tx=>tx.run("INSERT INTO app_migrations VALUES('productivity',3,'unsupported-future','2026-10-14T00:00:00Z')"));
 const before=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');expect(()=>inspectProductivityStorage(reader)).toThrow(/Unsupported productivity migration/);expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(before);
 command(tx=>tx.run("DELETE FROM app_migrations WHERE namespace='productivity' AND version=3"));
});

it('authenticated recovery replaces corrupt current tree but rejects corrupt replacement and incompatible storage',async()=>{
 setup();const saved=command(tx=>snapshot.collectAppSnapshot(tx)),root=fs.mkdtempSync(path.join(process.cwd(),'synthetic-tree-recovery-')),data=path.join(root,'data'),file=path.join(data,'family.db'),backup=path.join(root,'valid.fo-recovery'),key='b'.repeat(64),repo=fileURLToPath(new URL('../../',import.meta.url));fs.mkdirSync(data);
 try{
  await sqlite.sqliteBackupTo(file);const target=new Database(file);try{target.prepare('UPDATE productivity_tasks SET parent_id=id WHERE id=?').run('synthetic-structure-task');}finally{target.close();}
  expect(()=>inspectRecoverySnapshot(saved,file)).not.toThrow();
  const before=new Database(file);try{before.prepare("UPDATE app_migrations SET checksum='unsupported' WHERE version=2").run();expect(()=>inspectRecoverySnapshot(saved,file)).toThrow(/Unsupported productivity migration/);before.prepare('UPDATE app_migrations SET checksum=? WHERE version=2').run(saved.tables.app_migrations.find(row=>row.version===2)!.checksum);}finally{before.close();}
  const corrupt=structuredClone(saved);corrupt.tables.productivity_tasks[0].parent_id=corrupt.tables.productivity_tasks[0].id;corrupt.manifest.checksum=checksum(corrupt);expect(()=>inspectRecoverySnapshot(corrupt,file)).toThrow('Cây công việc không hợp lệ.');
  sqlite.sqliteConnection().prepare('UPDATE productivity_tasks SET parent_id=id WHERE id=?').run('synthetic-structure-task');try{await expect(configureTaskStorage(sqlite)).rejects.toThrow('Cây công việc không hợp lệ.');}finally{sqlite.sqliteConnection().prepare('UPDATE productivity_tasks SET parent_id=NULL WHERE id=?').run('synthetic-structure-task');}
  fs.writeFileSync(backup,encryptRecovery(Buffer.from(JSON.stringify(saved)),Buffer.from(key,'hex')));
  const output=spawnSync(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href,path.join(repo,'server/operator.ts'),'--restore-recovery'],{cwd:root,env:{...process.env,NODE_ENV:'production',APP_CODE_ROOT:repo,DATA_DIR:data,CONFIG_DIR:path.join(root,'config'),LOG_DIR:path.join(root,'logs'),FO_NETWORK_ATTEMPTS:path.join(root,'network.jsonl')},input:JSON.stringify({file:backup,key,includeCredentials:true}),encoding:'utf8',timeout:15000});
  expect(output.signal,output.stdout+output.stderr).toBeNull();expect(output.status,output.stdout+output.stderr).toBe(0);expect(JSON.parse(output.stdout)).toMatchObject({sessionsRevoked:true});
  const restored=new Database(file,{readonly:true});try{expect(restored.prepare('SELECT parent_id FROM productivity_tasks WHERE id=?').get('synthetic-structure-task')).toEqual({parent_id:null});expect(restored.pragma('integrity_check',{simple:true})).toBe('ok');expect(restored.prepare('SELECT count(*) AS n FROM reward_ledger').get()).toEqual({n:0});}finally{restored.close();}expect(fs.existsSync(path.join(root,'network.jsonl'))?fs.readFileSync(path.join(root,'network.jsonl'),'utf8'):'').toBe('');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
