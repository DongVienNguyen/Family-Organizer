import type {AppWriteTx} from '../appStore.js';
import {productivityTables} from './schema.js';
import {productivityMigrationChecksum} from './migrate.js';
type Reader=Pick<AppWriteTx,'get'|'all'>;
/** Inspect supported persisted storage; no schema/bootstrap writes or connection. */
export function inspectProductivityStorage(reader:Reader):boolean {
 const names=new Set(reader.all("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name));
 if([...names].some(name=>name.startsWith('wallet_')||(name.startsWith('productivity_')&&!Object.hasOwn(productivityTables,name))))throw new Error('Unsupported domain storage table');
 const records=names.has('app_migrations')?reader.all('SELECT namespace,version,checksum FROM app_migrations ORDER BY namespace,version'):[];
 if(records.some(row=>row.namespace!=='productivity'))throw new Error('Unsupported domain migration namespace');
 const applied=records.filter(row=>row.namespace==='productivity');
 const present=Object.keys(productivityTables).filter(name=>names.has(name));
 const marker=reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value;
 if(!present.length&&!applied.length&&marker===undefined)return false;
 if(applied.length!==1||applied[0].version!==1||applied[0].checksum!==productivityMigrationChecksum)throw new Error('Unsupported productivity migration');
 if(marker!==undefined&&marker!=='1')throw new Error('Unsupported canonical task marker');
 for(const [name,columns] of Object.entries(productivityTables)){
  if(!names.has(name)||JSON.stringify(reader.all(`PRAGMA table_info(${name})`).map(row=>row.name))!==JSON.stringify(columns))throw new Error('Unsupported productivity storage schema');
 }
 return true;
}
