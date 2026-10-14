import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as gateway from '../appStore.js';
import * as sqlite from '../sqlite.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {registerProductivityMigration} from './migrate.js';
import {activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
const command=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'productivity:bridge-order',requestId:randomUUID(),payloadHash:'synthetic'},fn);
it('refuses activation before configuring the canonical legacy reader, retaining the raw source',()=>{
 command(tx=>{tx.legacy.tasks=[legacyTask('order')];});registerProductivityMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshot.registerSnapshotTable,registerValidator:snapshot.registerSnapshotValidator});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 const digest=command(tx=>legacyTaskDigest(tx.legacy.tasks));expect(()=>command(tx=>activateCanonicalTasks(tx,digest))).toThrow(/reader/i);
 expect(sqlite.sqliteLoad().tasks.map(t=>t.id)).toEqual(['order']);expect(sqlite.sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='productivity_active'").get()).toBeUndefined();
});
