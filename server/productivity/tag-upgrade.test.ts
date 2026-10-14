import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {registerProductivityMigration,productivityStructureChecksum,productivityMigrationChecksum} from './migrate.js';
import {createStructureCommands} from './structure.js';
import {inspectProductivityStorage} from './inspection.js';
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:tag-upgrade',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
it('upgrades persisted v2 without inventing legacy ownership, infers only durable creation and preserves earlier identities',()=>{
 fixture(tx=>{tx.legacy.users=[{id:'synthetic-member',role:UserRole.MEMBER,username:'synthetic-member',fullName:'Synthetic Member',passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}];tx.legacy.tasks=[];});
 configureCanonicalTaskBridge({sqlite,gateway,migrations:{...migrations,registerDomainMigration:(ns,v,apply,sum)=>{if(v<=2)migrations.registerDomainMigration(ns,v,apply,sum);}},snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>{activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks));tx.run('INSERT INTO productivity_tags VALUES(?,?)','unknown-legacy-tag','Legacy owner unknown');});
 const api=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),actor={userId:'synthetic-member',role:UserRole.MEMBER},created=api.saveTag({actor,expectedRevision:0,requestId:randomUUID()},{name:'Synthetic pre-upgrade created tag'});
 expect(api.getCatalog(actor).tags.some(tag=>tag.id===created.id)).toBe(false);expect(reader.all("SELECT version,checksum FROM app_migrations WHERE namespace='productivity' ORDER BY version")).toEqual([{version:1,checksum:productivityMigrationChecksum},{version:2,checksum:productivityStructureChecksum}]);const frozen=reader.all("SELECT version,checksum FROM app_migrations WHERE version<=2 ORDER BY version");
 registerProductivityMigration({registerMigration:(ns,v,apply,sum)=>{if(v<=3)migrations.registerDomainMigration(ns,v,apply,sum);},registerSnapshot:snapshot.registerSnapshotTable,registerValidator:snapshot.registerSnapshotValidator});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});expect(reader.all('SELECT * FROM productivity_tag_owners')).toEqual([{tag_id:created.id,user_id:actor.userId}]);expect(api.getCatalog(actor).tags.some(tag=>tag.id===created.id)).toBe(true);expect(reader.all("SELECT version,checksum FROM app_migrations WHERE version<=2 ORDER BY version")).toEqual(frozen);expect(inspectProductivityStorage(reader)).toBe(true);
});
it('refuses future5 before any compatibility bootstrap writes',()=>{
 sqlite.sqliteConnection().prepare("INSERT INTO app_migrations VALUES('productivity',5,'unsupported-future','2026-10-14T00:00:00Z')").run();const before=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');expect(()=>inspectProductivityStorage(reader)).toThrow('Unsupported productivity migration');expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(before);sqlite.sqliteConnection().prepare("DELETE FROM app_migrations WHERE namespace='productivity' AND version=5").run();
});
