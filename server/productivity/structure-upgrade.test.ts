import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {registerProductivityMigration} from './migrate.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
const command=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'productivity:structure-upgrade-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
it('explicitly upgrades a persisted active v1 through the shared owner without losing task provenance, grants or revision',async()=>{
 command(tx=>{tx.legacy.users=[{id:'synthetic-admin',username:'synthetic-admin',fullName:'Synthetic admin',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}];tx.legacy.tasks=[legacyTask('v1-existing',{creatorId:'synthetic-admin',assigneeId:'synthetic-admin',rotationMemberIds:[],sourceRecurringTaskId:null})];});
 registerProductivityMigration({registerMigration:(namespace,version,apply,checksum)=>{if(version===1)migrations.registerDomainMigration(namespace,version,apply,checksum);},registerSnapshot:snapshot.registerSnapshotTable,registerValidator:snapshot.registerSnapshotValidator});
 migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});expect(migrations.getDomainVersions().productivity).toBe(1);
 const before=command(tx=>tx.all('SELECT * FROM productivity_tasks'));configureCanonicalTaskBridge({sqlite,gateway,migrations:{...migrations,registerDomainMigration:(namespace,version,apply,checksum)=>{if(version<=2)migrations.registerDomainMigration(namespace,version,apply,checksum);}},snapshot});command(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));
 const active=command(tx=>snapshot.collectAppSnapshot(tx));expect(active.manifest.domains.productivity).toBe(1);
 migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});expect(migrations.getDomainVersions().productivity).toBe(2);expect(command(tx=>tx.all('SELECT * FROM productivity_tasks'))).toEqual(before);expect(command(tx=>tx.get("SELECT value FROM app_meta WHERE key='productivity_active'"))).toEqual({value:'1'});
 const saved=command(tx=>snapshot.collectAppSnapshot(tx));expect(saved.manifest.domains.productivity).toBe(2);expect(saved.legacy.tasks).toEqual(active.legacy.tasks);expect(saved.tables.productivity_list_grants).toEqual(active.tables.productivity_list_grants);expect(saved.tables.productivity_check_items).toEqual([]);
 await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});expect(sqlite.sqliteLoad().tasks).toEqual(active.legacy.tasks);expect(sqlite.sqliteLoad().rewardLedger).toEqual([]);
});
it('refuses an invalid inactive v1 pilot tree before recording structure2 or creating its tables',()=>{
 command(tx=>{tx.run("DELETE FROM app_meta WHERE key='productivity_active'");tx.run("DELETE FROM app_migrations WHERE namespace='productivity' AND version=2");tx.exec('DROP TABLE productivity_check_items;DROP TABLE productivity_catalog_revisions;DROP INDEX productivity_tasks_parent');tx.run("UPDATE productivity_tasks SET parent_id=id WHERE id='v1-existing'");});
 const before=command(tx=>tx.all('SELECT name,sql FROM sqlite_master ORDER BY name'));
 expect(()=>migrations.applyDomainMigrations({enabled:['productivity'],pilot:true})).toThrow(/Cây công việc không hợp lệ/);
 expect(migrations.getDomainVersions().productivity).toBe(1);expect(command(tx=>tx.all('SELECT name,sql FROM sqlite_master ORDER BY name'))).toEqual(before);
});
