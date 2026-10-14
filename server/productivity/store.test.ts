import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withAppWriteTransaction} from '../appStore.js';
import {collectAppSnapshot,validateAppSnapshot,restoreAppSnapshot,registerSnapshotTable} from '../appSnapshot.js';
import {registerDomainMigration} from '../appMigrations.js';
import {migrateTasks,registerProductivityMigration} from './migrate.js';
import {loadTask,savePilotTask,toLegacyTask} from './store.js';
import {exportProductivitySnapshot} from './snapshot.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {UserRole} from '../../src/types.js';
const command=<T>(fn:Parameters<typeof withAppWriteTransaction<T>>[1])=>withAppWriteTransaction({actorId:'system:test',command:'productivity:store-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
it('roundtrips task metadata and preserves rank/section/parent plus optional Matrix pin in the common snapshot',async()=>{
 registerProductivityMigration({registerMigration:registerDomainMigration,registerSnapshot:registerSnapshotTable});
 command(tx=>{tx.legacy.users=[{id:'adult',username:'synthetic-admin',passwordHash:'synthetic-offline-hash',fullName:'Synthetic admin',role:UserRole.ADMIN,avatarColor:'bg-blue-500',createdAt:'2026-10-10T00:00:00Z'}];migrateTasks(tx,[legacyTask('parent'),legacyTask('child')]);const row=loadTask(tx,'child')!;tx.run('INSERT INTO productivity_sections (id,list_id,title) VALUES (?,?,?)','section',row.listId,'Synthetic section');row.sectionId='section';row.parentId='parent';row.rank=2048;savePilotTask(tx,row);tx.run('INSERT INTO productivity_matrix_pins (view_id,task_id,quadrant) VALUES (?,?,?)','view','child','q2');tx.run('INSERT INTO productivity_list_grants (list_id,user_id,permission) VALUES (?,?,?)',row.listId,'adult','manage');tx.run('INSERT INTO productivity_occurrences (id,task_id,series_id,occurrence_key,ordinal,payload_json) VALUES (?,?,?,?,?,?)','occurrence','child','series','2026-10-11',0,'{}');});
 const snapshot=command(tx=>collectAppSnapshot(tx));expect(snapshot.tables.productivity_matrix_pins).toHaveLength(1);expect(()=>validateAppSnapshot(snapshot)).not.toThrow();
 command(tx=>{const row=loadTask(tx,'child')!;row.title='changed';savePilotTask(tx,row);});
 await restoreAppSnapshot(validateAppSnapshot(snapshot),{maintenance:async fn=>fn()});
 command(tx=>{const row=loadTask(tx,'child')!;expect(row.title).toBe('Synthetic task child');expect(row.rank).toBe(2048);expect(row.parentId).toBe('parent');expect(row.sectionId).toBe('section');expect(toLegacyTask(row).comments[0].content).toBe('Keep comment');const tables=exportProductivitySnapshot(tx);expect(tables.productivity_matrix_pins).toHaveLength(1);expect(tables.productivity_list_grants).toHaveLength(1);expect(tables.productivity_occurrences).toHaveLength(1);});
});
it('canonical title edits retain original audit/proof/recurrence metadata and newer structure fields',()=>{
 command(tx=>{migrateTasks(tx,[legacyTask('edit')]);const row=loadTask(tx,'edit')!;row.title='Edited';row.body='Changed body';row.revision++;savePilotTask(tx,row);const saved=loadTask(tx,'edit')!;expect(saved.revision).toBe(2);const legacy=toLegacyTask(saved);expect(legacy.title).toBe('Edited');expect(legacy.description).toBe('Changed body');expect(legacy.proofImage).toBe('/media/synthetic.jpg');expect(legacy.rotationMemberIds).toEqual(['child','adult']);expect(legacy.sourceRecurringTaskId).toBe('series-parent');expect(legacy.createdAt).toBe('2026-10-10T00:00:00Z');});
});
it('rolls back a failed write and rejects cross-list section references through native foreign keys',()=>{
 command(tx=>{migrateTasks(tx,[legacyTask('fenced')]);tx.run('INSERT INTO productivity_lists (id,title,owner_id,is_shared) VALUES (?,?,?,?)','other','Other','adult',0);tx.run('INSERT INTO productivity_sections (id,list_id,title) VALUES (?,?,?)','foreign','other','Foreign');});
 expect(()=>command(tx=>{const row=loadTask(tx,'fenced')!;row.sectionId='foreign';savePilotTask(tx,row);})).toThrow();
 command(tx=>{expect(loadTask(tx,'fenced')!.sectionId).toBeNull();});
});
