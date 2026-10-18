import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable} from '../appSnapshot.js';
export const taskTemplateTables={productivity_task_templates:['id','owner_id','source_task_id','source_revision','revision','payload_json','created_at','updated_at','deleted_at']}as const;
export const taskTemplateSchemaSql=`
CREATE TABLE productivity_task_templates(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),source_task_id TEXT NOT NULL REFERENCES productivity_tasks(id),
 source_revision INTEGER NOT NULL CHECK(source_revision>=1),revision INTEGER NOT NULL CHECK(revision>=1),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT
);
CREATE INDEX productivity_task_templates_owner ON productivity_task_templates(owner_id,deleted_at,created_at,id);
`;
export const productivityTaskTemplateChecksum=createHash('sha256').update(taskTemplateSchemaSql+'\nactor-owned-task-content-templates-v15-pilot').digest('hex');
/** Explicit pilot only; persisted15 can reopen, ordinary default remains6. */
export function registerTaskTemplateMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {
 for(const [table,columns]of Object.entries(taskTemplateTables))ports.registerSnapshot('productivity',table,columns);
 ports.registerMigration('productivity',15,(tx:AppWriteTx)=>tx.exec(taskTemplateSchemaSql),productivityTaskTemplateChecksum);
}
