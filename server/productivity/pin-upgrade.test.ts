import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {registerProductivityMigration,productivityMigrationChecksum,productivityStructureChecksum,productivityTagChecksum,productivityPinChecksum} from './migrate.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {inspectProductivityStorage} from './inspection.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:pin-upgrade',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
it('freezes the exact checksums of the three previously accepted migrations',()=>{
 expect([productivityMigrationChecksum,productivityStructureChecksum,productivityTagChecksum]).toEqual(['8f978329c9628a1c54b25a456a34c46d74c868397f78b9592ef2c026e95a9f90','c8f354941f720cd1e7b973ee422180b4c1e7488d4ac23f4c900460474bce1ed3','42134eeb5d73fe80d730b47a459d30b26b03f352aa5da03b1cf88f661bb04013']);
});
it('inspection leaves persisted v3 untouched; explicit v4 adds empty personal preferences and preserves tasks and earlier migrations',()=>{
 fixture(tx=>{tx.legacy.tasks=[legacyTask('synthetic-pin-upgrade')];});
 configureCanonicalTaskBridge({sqlite,gateway,migrations:{...migrations,registerDomainMigration:(ns,v,apply,sum)=>{if(v<=3)migrations.registerDomainMigration(ns,v,apply,sum);}},snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));
 const frozen=reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' ORDER BY version"),tasks=reader.all('SELECT * FROM productivity_tasks'),schema=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');
 expect(inspectProductivityStorage(reader)).toBe(true);expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(schema);expect(reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' ORDER BY version")).toEqual(frozen);
 registerProductivityMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshot.registerSnapshotTable,registerValidator:snapshot.registerSnapshotValidator});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 expect(reader.all("SELECT * FROM app_migrations WHERE namespace='productivity' AND version<=3 ORDER BY version")).toEqual(frozen);expect(reader.all('SELECT * FROM productivity_tasks')).toEqual(tasks);expect(reader.all('SELECT * FROM productivity_task_pins')).toEqual([]);expect(reader.get("SELECT checksum FROM app_migrations WHERE namespace='productivity' AND version=4")).toEqual({checksum:productivityPinChecksum});expect(inspectProductivityStorage(reader)).toBe(true);
});
