import {createHash} from 'node:crypto';import type {AppWriteTx} from '../appStore.js';import type {registerDomainMigration} from '../appMigrations.js';import type {registerSnapshotTable,registerSnapshotRestorePolicy} from '../appSnapshot.js';
export const taskImportTables={
 productivity_task_import_batches:['id','owner_id','owner_role','format','file_name','file_size','file_sha256','status','revision','row_count','processed_count','undone_count','kept_count','warnings_json','mapping_json','job_id','queued_revision','error_code','created_at','updated_at','expires_at'],
 productivity_task_import_rows:['batch_id','ordinal','source_id','parent_source_id','list_key','draft_json'],
 productivity_task_import_entries:['batch_id','ordinal','task_id','task_revision','task_hash','undo_state','undone_revision'],
}as const;
export const taskImportSchemaSql=`
CREATE TABLE productivity_task_import_batches(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),owner_role TEXT NOT NULL,format TEXT NOT NULL CHECK(format IN('json','csv','ics')),
 file_name TEXT NOT NULL,file_size INTEGER NOT NULL CHECK(file_size>=1 AND file_size<=20971520),file_sha256 TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('preview','queued','committed','failed','queued_undo','undone','expired')),
 revision INTEGER NOT NULL CHECK(revision>=1),row_count INTEGER NOT NULL CHECK(row_count>=1 AND row_count<=10000),
 processed_count INTEGER NOT NULL CHECK(processed_count>=0 AND processed_count<=row_count),undone_count INTEGER NOT NULL CHECK(undone_count>=0),kept_count INTEGER NOT NULL CHECK(kept_count>=0),
 warnings_json TEXT NOT NULL,mapping_json TEXT,job_id TEXT,queued_revision INTEGER,error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,expires_at TEXT NOT NULL,
 CHECK(undone_count+kept_count<=processed_count)
);
CREATE INDEX productivity_task_import_owner ON productivity_task_import_batches(owner_id,status,created_at);
CREATE TABLE productivity_task_import_rows(
 batch_id TEXT NOT NULL REFERENCES productivity_task_import_batches(id),ordinal INTEGER NOT NULL CHECK(ordinal>=1 AND ordinal<=10000),
 source_id TEXT NOT NULL,parent_source_id TEXT,list_key TEXT NOT NULL,draft_json TEXT NOT NULL,PRIMARY KEY(batch_id,ordinal),UNIQUE(batch_id,source_id)
);
CREATE TABLE productivity_task_import_entries(
 batch_id TEXT NOT NULL,ordinal INTEGER NOT NULL,task_id TEXT NOT NULL UNIQUE REFERENCES productivity_tasks(id),task_revision INTEGER NOT NULL CHECK(task_revision>=1),task_hash TEXT NOT NULL,
 undo_state TEXT CHECK(undo_state IN('kept','undone')),undone_revision INTEGER,PRIMARY KEY(batch_id,ordinal),
 FOREIGN KEY(batch_id,ordinal)REFERENCES productivity_task_import_rows(batch_id,ordinal),
 CHECK((undo_state='undone' AND undone_revision IS NOT NULL) OR((undo_state IS NULL OR undo_state='kept')AND undone_revision IS NULL))
);
`;
export const productivityTaskImportChecksum=createHash('sha256').update(taskImportSchemaSql+'\nowned-task-import-preview-bounded-jobs-conditional-undo-v18-pilot').digest('hex');
/** Shared restore already retires durable leases. No imported row is replayed
 * automatically from a replacement snapshot; partial creations remain explicit. */
function retireRestoredTaskImports(tx:AppWriteTx,now:number):void {tx.run("UPDATE productivity_task_import_batches SET status='failed',revision=revision+1,job_id=NULL,queued_revision=NULL,error_code='IMPORT_REVIEW_REQUIRED',updated_at=CASE WHEN updated_at>? THEN updated_at ELSE ? END WHERE status IN('queued','queued_undo')",new Date(now).toISOString(),new Date(now).toISOString());}
export function registerTaskImportMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable;registerRestorePolicy?:typeof registerSnapshotRestorePolicy}):void {for(const [table,columns]of Object.entries(taskImportTables))ports.registerSnapshot('productivity',table,columns);ports.registerMigration('productivity',18,(tx:AppWriteTx)=>tx.exec(taskImportSchemaSql),productivityTaskImportChecksum);ports.registerRestorePolicy?.('productivity','task-import-review',18,retireRestoredTaskImports);}
