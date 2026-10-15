import type * as Migrations from '../appMigrations.js';
import type * as Snapshot from '../appSnapshot.js';
import type {AppSnapshot} from '../snapshotValidation.js';
import type {AppWriteTx} from '../appStore.js';
import {prepareWalletSchema,walletCoreChecksum,walletCoreSql} from './schema.js';
import {walletSnapshotColumns,moneyColumns,validate,walletSnapshotChecksum} from './snapshot.js';
type Reader=Pick<AppWriteTx,'get'|'all'>;
// SQLite retains trusted CREATE text with IF NOT EXISTS removed. Freeze table,
// constraint and explicit-index definitions without creating another connection.
const normalizedSql=(sql:string)=>sql.replace(/\bIF NOT EXISTS\s+/gi,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
const expectedObjects=new Map(walletCoreSql.split(';').map(sql=>sql.trim()).flatMap(sql=>{
 const match=/^CREATE (?:TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS ([a-z0-9_]+)/.exec(sql);
 return match?[[match[1],normalizedSql(sql)] as const]:[];
}));
/** Cold compatibility gate, used under the existing native startup lock. */
export function inspectWalletStorage(reader:Reader):boolean {
 const names=new Set(reader.all("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name)),present=[...names].filter(name=>name.startsWith('wallet_'));
 const records=names.has('app_migrations')?reader.all("SELECT version,checksum FROM app_migrations WHERE namespace='wallet' ORDER BY version"):[];
 if(!present.length&&!records.length)return false;
 if(present.some(name=>!Object.hasOwn(walletSnapshotColumns,name)))throw Error('Unsupported domain storage table');
 if(records.length!==1||records[0].version!==1||records[0].checksum!==walletCoreChecksum)throw Error('Unsupported domain migration namespace: Wallet');
 for(const [name,columns]of Object.entries(walletSnapshotColumns))if(!names.has(name)||JSON.stringify(reader.all('PRAGMA table_info('+name+')').map(row=>row.name))!==JSON.stringify(columns))throw Error('Unsupported Wallet storage schema');
 const objects=reader.all("SELECT name,sql FROM sqlite_master WHERE tbl_name LIKE 'wallet_%' AND sql IS NOT NULL");
 if(objects.length!==expectedObjects.size||objects.some(row=>expectedObjects.get(row.name)!==normalizedSql(row.sql)))throw Error('Unsupported Wallet storage schema');
 return true;
}
export function validateSharedWalletSnapshot(source:AppSnapshot):void {
 if(source.manifest.domains.wallet===0)return;
 if(source.manifest.domains.wallet!==1)throw Error('Unsupported Wallet snapshot version');
 const value={schemaVersion:2,tables:Object.fromEntries(Object.keys(walletSnapshotColumns).map(name=>[name,source.tables[name]])),checksum:''};
 value.checksum=walletSnapshotChecksum(value);validate(value,new Set(source.legacy.users.map(user=>user.id)));
}
/** Registration only. The caller must explicitly apply the I01 pilot migration. */
export function configureWalletStorage(ports:{migrations:typeof Migrations;snapshot:typeof Snapshot}):void {
 for(const [name,columns]of Object.entries(walletSnapshotColumns))ports.snapshot.registerSnapshotTable('wallet',name,columns,{integerText:moneyColumns[name]??[]});
 ports.migrations.registerDomainMigration('wallet',1,prepareWalletSchema,walletCoreChecksum);
 ports.snapshot.registerSnapshotValidator('wallet',validateSharedWalletSnapshot);
}
