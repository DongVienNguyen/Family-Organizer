import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable} from '../appSnapshot.js';

export const seriesTables={
 productivity_series:['id','task_id','revision','policy_json','anchor_json','next_ordinal','accepted_count','rotation_cursor','ended_at','created_at','updated_at'],
 productivity_series_exceptions:['series_id','ordinal','kind','due_json','revision'],
} as const;
export const seriesSchemaSql=`
CREATE TABLE productivity_series(
 id TEXT PRIMARY KEY,task_id TEXT NOT NULL UNIQUE REFERENCES productivity_tasks(id),
 revision INTEGER NOT NULL CHECK(revision>=1),policy_json TEXT NOT NULL,anchor_json TEXT NOT NULL,
 next_ordinal INTEGER NOT NULL CHECK(next_ordinal>=1),accepted_count INTEGER NOT NULL CHECK(accepted_count>=0),
 rotation_cursor INTEGER NOT NULL CHECK(rotation_cursor>=0),ended_at TEXT,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE productivity_series_exceptions(
 series_id TEXT NOT NULL REFERENCES productivity_series(id),ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 kind TEXT NOT NULL CHECK(kind IN('skip','due')),due_json TEXT,
 revision INTEGER NOT NULL CHECK(revision>=1),PRIMARY KEY(series_id,ordinal),
 CHECK((kind='skip' AND due_json IS NULL) OR (kind='due' AND due_json IS NOT NULL))
);
`;
export const productivitySeriesChecksum=createHash('sha256').update(seriesSchemaSql+'\ndurable-recurrence-series-v10-explicit-pilot').digest('hex');
function migrateSeries(tx:AppWriteTx):void {tx.exec(seriesSchemaSql);}
/** Explicit pilot only. Registration imports no storage and never applies SQL.
 * Existing occurrence rows remain untouched; later commands own their typed
 * payloads only for an explicitly registered durable series. */
export function registerSeriesMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {
 for(const [name,columns]of Object.entries(seriesTables))ports.registerSnapshot('productivity',name,columns);
 ports.registerMigration('productivity',10,migrateSeries,productivitySeriesChecksum);
}
