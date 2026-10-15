import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
export const matrixPinColumns=['view_id','task_id','quadrant','view_revision','revision','expires_at'] as const;
export const matrixPinSchemaSql=`
CREATE TABLE productivity_matrix_overrides(
 view_id TEXT NOT NULL REFERENCES productivity_views(id) ON DELETE CASCADE,task_id TEXT NOT NULL REFERENCES productivity_tasks(id) ON DELETE CASCADE,
 quadrant TEXT NOT NULL CHECK(quadrant IN('q1','q2','q3','q4')),
 view_revision INTEGER NOT NULL CHECK(typeof(view_revision)='integer' AND view_revision>=1),revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),expires_at TEXT,
 PRIMARY KEY(view_id,task_id)
);
CREATE INDEX productivity_matrix_overrides_expiry ON productivity_matrix_overrides(expires_at,view_id,task_id);
`;
export const matrixPinMigrationSql=matrixPinSchemaSql;
export const matrixTables={productivity_matrix_overrides:matrixPinColumns}as const;
export const productivityMatrixChecksum=createHash('sha256').update(matrixPinMigrationSql+'\nrevisioned-expiring-view-matrix-pins-v6').digest('hex');
export function migrateMatrixPins(tx:AppWriteTx):void {tx.exec(matrixPinMigrationSql);}
export function registerMatrixMigration(register:typeof registerDomainMigration):void {register('productivity',6,migrateMatrixPins,productivityMatrixChecksum);}

/** v6 owns this new schema; earlier pilot pin storage remains frozen. */
export function inspectMatrixSchema(reader:Pick<AppWriteTx,'get'|'all'>):void {
 const normalize=(sql:string)=>sql.trim().replace(/;$/,'').replace(/\s+/g,' ');
 const [table,index]=matrixPinSchemaSql.trim().split(/(?=CREATE INDEX)/);
 if(normalize(reader.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='productivity_matrix_overrides'")?.sql??'')!==normalize(table)||normalize(reader.get("SELECT sql FROM sqlite_master WHERE type='index' AND name='productivity_matrix_overrides_expiry'")?.sql??'')!==normalize(index))throw Error('Unsupported productivity Matrix storage schema');
}
