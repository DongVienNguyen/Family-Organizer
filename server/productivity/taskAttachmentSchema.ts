import {createHash} from 'node:crypto';import type {AppWriteTx} from '../appStore.js';import type {registerDomainMigration} from '../appMigrations.js';import type {registerSnapshotTable} from '../appSnapshot.js';
export const taskAttachmentTables={productivity_task_attachments:['id','task_id','file_key','file_name','mime','size','sha256','created_at','created_by','revision','deleted_at']}as const;
export const taskAttachmentSchemaSql=`
CREATE TABLE productivity_task_attachments(
 id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES productivity_tasks(id),file_key TEXT NOT NULL UNIQUE,file_name TEXT NOT NULL,
 mime TEXT NOT NULL CHECK(mime IN('image/png','image/jpeg','image/webp','image/gif','application/pdf')),
 size INTEGER NOT NULL CHECK(size>=1 AND size<=20971520),sha256 TEXT NOT NULL,created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),revision INTEGER NOT NULL CHECK(revision IN(1,2)),deleted_at TEXT,
 CHECK((deleted_at IS NULL AND revision=1) OR(deleted_at IS NOT NULL AND revision=2))
);
CREATE INDEX productivity_task_attachments_task ON productivity_task_attachments(task_id,deleted_at,id);
`;
export const productivityTaskAttachmentChecksum=createHash('sha256').update(taskAttachmentSchemaSql+'\nprivate-task-file-metadata-20mib-v17-pilot').digest('hex');
export function registerTaskAttachmentMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {for(const [table,columns]of Object.entries(taskAttachmentTables))ports.registerSnapshot('productivity',table,columns);ports.registerMigration('productivity',17,(tx:AppWriteTx)=>tx.exec(taskAttachmentSchemaSql),productivityTaskAttachmentChecksum);}
