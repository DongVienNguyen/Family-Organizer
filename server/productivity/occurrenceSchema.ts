import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable} from '../appSnapshot.js';
export const ownedOccurrenceTables={
 productivity_series_occurrences:['series_id','ordinal','task_id','state','policy_json','due_json','created_at','accepted_at','accepted_revision'],
} as const;
export const ownedOccurrenceSchemaSql=`
CREATE TABLE productivity_series_occurrences(
 series_id TEXT NOT NULL REFERENCES productivity_series(id),
 ordinal INTEGER NOT NULL CHECK(ordinal>=0 AND ordinal<=100000),
 task_id TEXT NOT NULL UNIQUE REFERENCES productivity_tasks(id),
 state TEXT NOT NULL CHECK(state IN('open','accepted')),policy_json TEXT NOT NULL,due_json TEXT NOT NULL,
 created_at TEXT NOT NULL,accepted_at TEXT,accepted_revision INTEGER,
 PRIMARY KEY(series_id,ordinal),
 CHECK((state='open' AND ordinal>0 AND accepted_at IS NULL AND accepted_revision IS NULL) OR
       (state='accepted' AND accepted_at IS NOT NULL AND accepted_revision IS NOT NULL AND accepted_revision>=1))
);
`;
export const productivityOccurrenceChecksum=createHash('sha256').update(ownedOccurrenceSchemaSql+'\nowned-accepted-recurrence-v11-explicit-pilot').digest('hex');
function migrateOccurrences(tx:AppWriteTx):void {tx.exec(ownedOccurrenceSchemaSql);}
/** Additive explicit pilot; old opaque productivity_occurrences is untouched. */
export function registerOccurrenceMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {
 for(const [table,columns]of Object.entries(ownedOccurrenceTables))ports.registerSnapshot('productivity',table,columns);
 ports.registerMigration('productivity',11,migrateOccurrences,productivityOccurrenceChecksum);
}
