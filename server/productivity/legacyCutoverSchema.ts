import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable} from '../appSnapshot.js';
export const legacyCutoverTables={productivity_legacy_cutovers:['legacy_root_task_id','series_id','selected_task_id','actor_id','source_json','created_at']}as const;
export const legacyCutoverSchemaSql=`
CREATE TABLE productivity_legacy_cutovers(
 legacy_root_task_id TEXT NOT NULL PRIMARY KEY REFERENCES productivity_tasks(id),
 series_id TEXT NOT NULL UNIQUE REFERENCES productivity_series(id),
 selected_task_id TEXT NOT NULL UNIQUE REFERENCES productivity_tasks(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),created_at TEXT NOT NULL
);
`;
export const productivityLegacyCutoverChecksum=createHash('sha256').update(legacyCutoverSchemaSql+'\ncontrolled-legacy-recurrence-cutover-v13-pilot').digest('hex');
export function registerLegacyCutoverMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {
 for(const [table,columns]of Object.entries(legacyCutoverTables))ports.registerSnapshot('productivity',table,columns);
 ports.registerMigration('productivity',13,(tx:AppWriteTx)=>tx.exec(legacyCutoverSchemaSql),productivityLegacyCutoverChecksum);
}
