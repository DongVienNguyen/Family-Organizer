import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable} from '../appSnapshot.js';
export const occurrenceSkipTables={productivity_occurrence_skips:['series_id','ordinal','task_id','skipped_at','skipped_by_id','task_revision']}as const;
export const occurrenceSkipSchemaSql=`
CREATE TABLE productivity_occurrence_skips(
 series_id TEXT NOT NULL REFERENCES productivity_series(id),ordinal INTEGER NOT NULL CHECK(ordinal>=0 AND ordinal<=100000),
 task_id TEXT NOT NULL UNIQUE REFERENCES productivity_tasks(id),skipped_at TEXT NOT NULL,
 skipped_by_id TEXT NOT NULL REFERENCES users(id),task_revision INTEGER NOT NULL CHECK(task_revision>=1),
 PRIMARY KEY(series_id,ordinal)
);
`;
export const productivityOccurrenceSkipChecksum=createHash('sha256').update(occurrenceSkipSchemaSql+'\nexplicit-skip-decisions-v12-pilot').digest('hex');
function migrateOccurrenceSkips(tx:AppWriteTx):void {tx.exec(occurrenceSkipSchemaSql);}
/** Additive skip decisions never rewrite frozen11 occurrence facts. */
export function registerOccurrenceSkipMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {
 for(const [table,columns]of Object.entries(occurrenceSkipTables))ports.registerSnapshot('productivity',table,columns);
 ports.registerMigration('productivity',12,migrateOccurrenceSkips,productivityOccurrenceSkipChecksum);
}
