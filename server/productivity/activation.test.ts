import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';import * as gateway from '../appStore.js';import * as migrations from '../appMigrations.js';import * as snapshot from '../appSnapshot.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {loadTask,savePilotTask} from './store.js';
import {migrateTasks} from './migrate.js';
const command=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'productivity:activation-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
let initialized=false;
function setup(){if(initialized)return;command(tx=>{tx.legacy.tasks=[legacyTask('source')];});configureCanonicalTaskBridge({sqlite,gateway,migrations:{...migrations,registerDomainMigration:(ns,v,fn,sum)=>{if(v<=4)migrations.registerDomainMigration(ns,v,fn,sum);}},snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});initialized=true;}
it('stale source digest or modified legacy input aborts activation with raw data intact',()=>{
 setup();const digest=command(tx=>legacyTaskDigest(tx.legacy.tasks));command(tx=>{tx.legacy.tasks[0].title='Changed after preview';});
 expect(()=>command(tx=>activateCanonicalTasks(tx,digest))).toThrow(/source/i);
 const fresh=command(tx=>legacyTaskDigest(tx.legacy.tasks));expect(()=>command(tx=>activateCanonicalTasks(tx,fresh))).toThrow(/source/i);
 expect(sqlite.sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='productivity_active'").get()).toBeUndefined();expect(sqlite.sqliteLoad().tasks[0].title).toBe('Changed after preview');
});
it('activation refuses experimental records that cannot enter legacy projection before setting its marker',()=>{
 setup();command(tx=>{tx.legacy.tasks[0].title='Synthetic task source';const row=loadTask(tx,'source')!;row.priority='none';savePilotTask(tx,row);});
 const digest=command(tx=>legacyTaskDigest(tx.legacy.tasks));expect(()=>command(tx=>activateCanonicalTasks(tx,digest))).toThrow(/legacy/i);
 expect(sqlite.sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='productivity_active'").get()).toBeUndefined();expect(sqlite.sqliteLoad().tasks).toHaveLength(1);
});
it('annual recurrence is valid existing legacy API metadata and survives migration/projection',()=>{
 command(tx=>{tx.legacy.tasks=[legacyTask('annual',{recurrenceType:'yearly' as any})];migrateTasks(tx,tx.legacy.tasks);expect(loadTask(tx,'annual')!.legacy.recurrenceType).toBe('yearly');});
});
it('a rollback after setting the marker restores raw source and inactive state atomically',()=>{
 setup();command(tx=>{tx.legacy.tasks=[legacyTask('source')];const row=loadTask(tx,'source')!;row.priority='medium';savePilotTask(tx,row);tx.run("DELETE FROM productivity_tasks WHERE id='annual'");});
 const digest=command(tx=>legacyTaskDigest(tx.legacy.tasks));
 expect(()=>command(tx=>{activateCanonicalTasks(tx,digest);throw Error('synthetic cutover crash');})).toThrow('synthetic cutover crash');
 expect(sqlite.sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='productivity_active'").get()).toBeUndefined();expect(sqlite.sqliteLoad().tasks.map(t=>t.id)).toEqual(['source']);
});
it('activation is repeatable without changing row IDs, revision or legacy raw writer',()=>{
 setup();const digest=command(tx=>legacyTaskDigest(tx.legacy.tasks));
 command(tx=>{expect(activateCanonicalTasks(tx,digest).alreadyActive).toBe(false);});const before=command(tx=>loadTask(tx,'source')!);
 command(tx=>{expect(activateCanonicalTasks(tx,digest).alreadyActive).toBe(true);expect(loadTask(tx,'source')!.revision).toBe(before.revision);expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);});
});

it.each([1,2,3,4])('active readers and writers refuse a changed migration checksum version%s',version=>{
 setup();const connection=sqlite.sqliteConnection();const prior=connection.prepare("SELECT checksum FROM app_migrations WHERE namespace='productivity' AND version=?").get(version) as {checksum:string};
 connection.prepare("UPDATE app_migrations SET checksum='unsupported' WHERE namespace='productivity' AND version=?").run(version);
 try{expect(()=>sqlite.sqliteLoad()).toThrow(/migration/i);expect(()=>command(tx=>{tx.legacy.tasks[0].title='Must not write';})).toThrow(/migration/i);}finally{connection.prepare("UPDATE app_migrations SET checksum=? WHERE namespace='productivity' AND version=?").run(prior.checksum,version);}
 expect(sqlite.sqliteLoad().tasks[0].title).toBe('Synthetic task source');
});
it('repeat activation rejects an unsupported newer productivity migration and rolls it back',()=>{
 setup();let activationReached=false;expect(()=>command(tx=>{const prior=tx.get("SELECT * FROM app_migrations WHERE namespace='productivity'");tx.run('INSERT INTO app_migrations(namespace,version,checksum,applied_at) VALUES(?,?,?,?)','productivity',6,'future',prior.applied_at);activationReached=true;activateCanonicalTasks(tx,'0'.repeat(64));})).toThrow('Unsupported productivity migration');expect(activationReached).toBe(true);
 expect(sqlite.sqliteConnection().prepare("SELECT version FROM app_migrations WHERE namespace='productivity' ORDER BY version").all()).toEqual([{version:1},{version:2},{version:3},{version:4}]);
});
