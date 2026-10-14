import type {AppWriteTx} from '../appStore.js';
import {productivityTables} from './schema.js';
import {productivityMigrationChecksum,productivityStructureChecksum} from './migrate.js';
import {structureTables,productivityTablesAt} from './structureSchema.js';
type Reader=Pick<AppWriteTx,'get'|'all'>;
/** Inspect persisted compatibility only; damaged data is validated by ordinary
 * bootstrap or the authenticated replacement snapshot, never by this schema gate. */
export function inspectProductivityStorage(reader:Reader):boolean {
 const names=new Set(reader.all("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name));
 if([...names].some(name=>name.startsWith('wallet_')||(name.startsWith('productivity_')&&!Object.hasOwn({...productivityTables,...structureTables},name))))throw new Error('Unsupported domain storage table');
 const records=names.has('app_migrations')?reader.all('SELECT namespace,version,checksum FROM app_migrations ORDER BY namespace,version'):[];
 if(records.some(row=>row.namespace!=='productivity'))throw new Error('Unsupported domain migration namespace');
 const applied=records.filter(row=>row.namespace==='productivity');
 const present=Object.keys({...productivityTables,...structureTables}).filter(name=>names.has(name));
 const marker=reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value;
 if(!present.length&&!applied.length&&marker===undefined)return false;
 if(![1,2].includes(applied.length)||applied[0].version!==1||applied[0].checksum!==productivityMigrationChecksum||(applied.length===2&&(applied[1].version!==2||applied[1].checksum!==productivityStructureChecksum)))throw new Error('Unsupported productivity migration');
 if(applied.length===1&&Object.keys(structureTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(marker!==undefined&&marker!=='1')throw new Error('Unsupported canonical task marker');
 for(const [name,columns] of Object.entries(productivityTablesAt(applied.length))){
  if(!names.has(name)||JSON.stringify(reader.all(`PRAGMA table_info(${name})`).map(row=>row.name))!==JSON.stringify(columns))throw new Error('Unsupported productivity storage schema');
 }
 return true;
}
