import {validateWalletLinkLegacy} from './linkValidation.js';
import {walletSchemas,walletStorageVersions,type WalletStorageVersion} from './schemaRegistry.js';
import {prepareWalletReceipts,walletReceiptSql,walletReceiptChecksum,validateWalletReceiptMedia} from './receiptSchema.js';
import type * as Migrations from '../appMigrations.js';
import type * as Snapshot from '../appSnapshot.js';
import type {AppSnapshot} from '../snapshotValidation.js';
import type {AppWriteTx} from '../appStore.js';
import {prepareWalletSchema,walletCoreChecksum,walletCoreSql,prepareWalletMetadata,walletMetadataChecksum,walletMetadataSql,prepareWalletFinancial,walletFinancialChecksum,walletFinancialSql,prepareWalletLegacyMigration,walletLegacyMigrationChecksum,walletLegacyMigrationSql} from './schema.js';
import {walletTablesAt,moneyColumns,validate,walletSnapshotChecksum} from './snapshot.js';
type Reader=Pick<AppWriteTx,'get'|'all'>;
// SQLite retains trusted CREATE text with IF NOT EXISTS removed. Freeze table,
// constraint and explicit-index definitions without creating another connection.
const normalizedSql=(sql:string)=>sql.replace(/\bIF NOT EXISTS\s+/gi,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
const expectedObjects=(version:number)=>new Map(walletSchemas.filter(row=>row.version<=version).map(row=>row.sql).join('').split(';').map(sql=>sql.trim()).flatMap(sql=>{
 const match=/^CREATE (?:TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS ([a-z0-9_]+)/.exec(sql);
 return match?[[match[1],normalizedSql(sql)] as const]:[];
}));
/** Cold compatibility gate, used under the existing native startup lock. */
export function inspectWalletStorage(reader:Reader):boolean {
 const names=new Set(reader.all("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name)),present=[...names].filter(name=>name.startsWith('wallet_'));
 const records=names.has('app_migrations')?reader.all("SELECT version,checksum FROM app_migrations WHERE namespace='wallet' ORDER BY version"):[];
 if(!present.length&&!records.length)return false;
 if(!walletStorageVersions.includes(records.length)||records.some((row,i)=>row.version!==i+1||row.checksum!==walletSchemas[i]?.checksum))throw Error('Unsupported domain migration namespace: Wallet');
 const definitions=walletTablesAt(records.length),objectsExpected=expectedObjects(records.length);
 if(present.some(name=>!Object.hasOwn(definitions,name)))throw Error('Unsupported domain storage table');
 for(const [name,columns]of Object.entries(definitions))if(!names.has(name)||JSON.stringify(reader.all('PRAGMA table_info('+name+')').map(row=>row.name))!==JSON.stringify(columns))throw Error('Unsupported Wallet storage schema');
 const objects=reader.all("SELECT name,sql FROM sqlite_master WHERE tbl_name LIKE 'wallet_%' AND sql IS NOT NULL");
 if(objects.length!==objectsExpected.size||objects.some(row=>objectsExpected.get(row.name)!==normalizedSql(row.sql)))throw Error('Unsupported Wallet storage schema');
 return true;
}
export function validateSharedWalletSnapshot(source:AppSnapshot):void {
 if(source.manifest.domains.wallet===0)return;
 if(!walletStorageVersions.includes(source.manifest.domains.wallet))throw Error('Unsupported Wallet snapshot version');
 const value={schemaVersion:source.manifest.domains.wallet+1,tables:Object.fromEntries(Object.keys(walletTablesAt(source.manifest.domains.wallet)).map(name=>[name,source.tables[name]])),checksum:''};
 value.checksum=walletSnapshotChecksum(value);validate(value,new Set(source.legacy.users.map(user=>user.id)));
 if(source.manifest.domains.wallet>=5)validateWalletReceiptMedia(value.tables,source.media);
 if(source.manifest.domains.wallet>=13)validateWalletLinkLegacy(value.tables,source.legacy);
}
/** Registration only. The caller must explicitly apply the I01 pilot migration. */
export function configureWalletStorage(ports:{migrations:typeof Migrations;snapshot:typeof Snapshot;version?:WalletStorageVersion}):void {
 const version=ports.version??1;
 for(const [name,columns]of Object.entries(walletTablesAt(version)))ports.snapshot.registerSnapshotTable('wallet',name,columns,{integerText:moneyColumns[name]??[]});
 for(const entry of walletSchemas.filter(row=>row.version<=version))ports.migrations.registerDomainMigration('wallet',entry.version,entry.prepare,entry.checksum);
 ports.snapshot.registerSnapshotValidator('wallet',validateSharedWalletSnapshot);
}
