import {createHash} from 'node:crypto';import type {AppWriteTx} from '../appStore.js';import type {registerDomainMigration} from '../appMigrations.js';import type {registerSnapshotTable} from '../appSnapshot.js';
export const taskContentTables={productivity_task_note_links:['id','actor_id','request_id','task_id','note_id','direction','source_revision','source_note_updated_at','created_at']}as const;
export const taskContentSchemaSql=`
CREATE TABLE productivity_task_note_links(
 id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES productivity_tasks(id),note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 direction TEXT NOT NULL CHECK(direction IN('task_to_note','note_to_task')),source_revision INTEGER,source_note_updated_at TEXT,created_at TEXT NOT NULL,
 UNIQUE(actor_id,request_id),CHECK((direction='task_to_note' AND source_revision IS NOT NULL AND source_revision>=1 AND source_note_updated_at IS NULL) OR(direction='note_to_task' AND source_revision IS NULL AND source_note_updated_at IS NOT NULL))
);
CREATE INDEX productivity_task_note_links_task ON productivity_task_note_links(task_id,id);
CREATE INDEX productivity_task_note_links_note ON productivity_task_note_links(note_id,id);
`;
export const productivityTaskContentChecksum=createHash('sha256').update(taskContentSchemaSql+'\ncanonical-notes-typed-task-links-v16-pilot').digest('hex');
export function registerTaskContentMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {for(const [table,columns]of Object.entries(taskContentTables))ports.registerSnapshot('productivity',table,columns);ports.registerMigration('productivity',16,(tx:AppWriteTx)=>tx.exec(taskContentSchemaSql),productivityTaskContentChecksum);}
