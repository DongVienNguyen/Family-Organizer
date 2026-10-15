import {boardTables,inspectBoardSchema} from './boardSchema.js';
import {productivityBoardChecksum} from './boardMigration.js';
import {matrixTables,inspectMatrixSchema,productivityMatrixChecksum} from './matrixSchema.js';
import {inspectWalletStorage} from '../wallet/integration.js';
import {viewTables} from './viewSchema.js';
import {taskPinTables} from './pinSchema.js';
import {tagOwnershipTables} from './tagSchema.js';
import type {AppWriteTx} from '../appStore.js';
import {productivityTables} from './schema.js';
import {productivityMigrationChecksum,productivityStructureChecksum,productivityTagChecksum,productivityPinChecksum,productivityViewChecksum} from './migrate.js';
import {structureTables,productivityTablesAt} from './structureSchema.js';
type Reader=Pick<AppWriteTx,'get'|'all'>;
/** Inspect persisted compatibility only; damaged data is validated by ordinary
 * bootstrap or the authenticated replacement snapshot, never by this schema gate. */
export function inspectProductivityStorage(reader:Reader):boolean {
 inspectWalletStorage(reader);
 const names=new Set(reader.all("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name));
 if([...names].some(name=>name.startsWith('productivity_')&&!Object.hasOwn({...productivityTables,...structureTables,...tagOwnershipTables,...taskPinTables,...viewTables,...matrixTables,...boardTables},name)))throw new Error('Unsupported domain storage table');
 const records=names.has('app_migrations')?reader.all('SELECT namespace,version,checksum FROM app_migrations ORDER BY namespace,version'):[];
 if(records.some(row=>row.namespace!=='productivity'&&row.namespace!=='wallet'))throw new Error('Unsupported domain migration namespace');
 const applied=records.filter(row=>row.namespace==='productivity');
 const present=Object.keys({...productivityTables,...structureTables,...tagOwnershipTables,...taskPinTables,...viewTables,...matrixTables,...boardTables}).filter(name=>names.has(name));
 const marker=reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value;
 if(!present.length&&!applied.length&&marker===undefined)return false;
 if(![1,2,3,4,5,6,7].includes(applied.length)||applied[0].version!==1||applied[0].checksum!==productivityMigrationChecksum||(applied.length>=2&&(applied[1].version!==2||applied[1].checksum!==productivityStructureChecksum)))throw new Error('Unsupported productivity migration');
 if(applied.length>=3&&(applied[2].version!==3||applied[2].checksum!==productivityTagChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=4&&(applied[3].version!==4||applied[3].checksum!==productivityPinChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=5&&(applied[4].version!==5||applied[4].checksum!==productivityViewChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=6&&(applied[5].version!==6||applied[5].checksum!==productivityMatrixChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=7&&(applied[6].version!==7||applied[6].checksum!==productivityBoardChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length<7&&(Object.keys(boardTables).some(name=>names.has(name))||reader.get("SELECT name FROM sqlite_master WHERE type='index' AND name IN('productivity_tasks_board_identity','productivity_board_positions_lane')")))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=7)inspectBoardSchema(reader);
 if(applied.length<6&&Object.keys(matrixTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=6)inspectMatrixSchema(reader);
 if(applied.length<5&&Object.keys(viewTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length<4&&Object.keys(taskPinTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length<3&&Object.keys(tagOwnershipTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length===1&&Object.keys(structureTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(marker!==undefined&&marker!=='1')throw new Error('Unsupported canonical task marker');
 for(const [name,columns] of Object.entries(productivityTablesAt(applied.length))){
  if(!names.has(name)||JSON.stringify(reader.all(`PRAGMA table_info(${name})`).map(row=>row.name))!==JSON.stringify(columns))throw new Error('Unsupported productivity storage schema');
 }
 return true;
}
