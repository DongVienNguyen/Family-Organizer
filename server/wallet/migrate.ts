import type {Actor} from '../../src/features/wallet/contracts.js';
import {UserRole} from '../../src/types.js';
import {text} from '../../src/features/productivity/validation.js';
import {timezoneFormatter} from '../../src/features/productivity/dates.js';
import {AppStoreError} from '../appErrors.js';
import type {WalletTx} from './store.js';
import {legacySourceChecksum,legacyPilotChecksum,legacyPilotChecksumNames,validateWalletLegacyTables} from './legacyMigrationData.js';
import {buildLegacyMigrationPlan} from './migrationPlan.js';
import {moneyColumns,walletTablesAt,restoreWalletSnapshot,walletSnapshotChecksum,storageVersion} from './snapshot.js';
export interface LegacyFinanceSnapshot {transactions:unknown[];customCategories?:unknown[];hiddenBuiltinCategories?:unknown[];debts?:unknown[];savingsGoals?:unknown[]}
export interface LegacyMigrationCounts {accounts:number;categories:number;records:number;quarantined:number;legacyUnlinked:number;pendingReceipts:number}
export interface LegacyMigrationReceipt {version:2;runId:string;checksum:string;walletChecksum:string;mapping:{accounts:Record<string,string>;recordIdsPreserved:true};totals:LegacyMigrationCounts;created:LegacyMigrationCounts}
function fail(status:number,message:string,code='wallet-legacy-migration'):never {throw new AppStoreError(message,status,code);}
const zero=():LegacyMigrationCounts=>({accounts:0,categories:0,records:0,quarantined:0,legacyUnlinked:0,pendingReceipts:0});
function dataset(tx:WalletTx){const definitions=walletTablesAt(4);return Object.fromEntries(legacyPilotChecksumNames.map(name=>[name,tx.sql.all('SELECT '+definitions[name].map(column=>moneyColumns[name]?.includes(column)?'CAST('+column+' AS TEXT) AS '+column:column).join(',')+' FROM '+name)]));}
function receipt(tx:WalletTx,run:any,created:LegacyMigrationCounts):LegacyMigrationReceipt {return {version:2,runId:run.id,checksum:run.source_checksum,walletChecksum:run.wallet_checksum,mapping:{accounts:Object.fromEntries(tx.sql.all("SELECT legacy_id,target_id FROM wallet_legacy_links WHERE run_id=? AND source_kind='account' AND state='mapped' ORDER BY legacy_id",run.id).map(row=>[row.legacy_id,row.target_id])),recordIdsPreserved:true},totals:{accounts:run.accounts_count,categories:run.categories_count,records:run.records_count,quarantined:run.quarantined_count,legacyUnlinked:run.unlinked_count,pendingReceipts:run.receipts_pending_count},created};}
/** Trusted caller must own I01 and retain its safety backup; this never activates Wallet. */
export function migrateLegacyFinance(tx:WalletTx,input:LegacyFinanceSnapshot,options:{actor:Actor;timezone:string;now:string}):LegacyMigrationReceipt {
 const user=tx.legacy.users.find(user=>user.id===options.actor.userId);if(options.actor.role!==UserRole.ADMIN||!user||user.role!==UserRole.ADMIN||user.isDeleted)fail(403,'Chỉ quản trị viên được di trú tài chính.');
 if(tx.sql.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value==='1')fail(409,'Không nhập dữ liệu cũ đè lên Wallet đang hoạt động.');
 text(options.now,24);if(!Number.isFinite(Date.parse(options.now))||new Date(options.now).toISOString()!==options.now)fail(400,'Thời điểm di trú không hợp lệ.');timezoneFormatter(options.timezone);
 const source=structuredClone(input);
 const checksum=legacySourceChecksum({version:2,timezone:options.timezone,source}),runs=tx.sql.all('SELECT * FROM wallet_legacy_runs LIMIT 2'),prior=runs[0];if(runs.length>1)fail(409,'Có nhiều lần pilot không nhất quán; cần đối soát trước khi chạy lại.');
 if(prior){const tables=dataset(tx);try{validateWalletLegacyTables({...tables,wallet_legacy_runs:[prior]},new Set(tx.legacy.users.map(user=>user.id)));}catch{fail(409,'Biên nhận di trú không còn nhất quán; cần đối soát trước khi chạy lại.');}if(prior.source_checksum!==checksum||prior.wallet_checksum!==legacyPilotChecksum(tables))fail(409,'Nguồn hoặc dữ liệu pilot đã thay đổi; cần đối soát trước khi chạy lại.');return receipt(tx,prior,zero());}
 for(const name of legacyPilotChecksumNames.filter(name=>name!=='wallet_currencies'))if(tx.sql.get('SELECT 1 AS present FROM '+name+' LIMIT 1'))fail(409,'Kho Wallet pilot chứa dữ liệu không thuộc lần di trú này.');
 const plan=buildLegacyMigrationPlan(source,tx.legacy.users,options,tx.sql.all('SELECT code,exponent FROM wallet_currencies'));const snapshot=plan.snapshot;
 const installed=storageVersion(tx);
 if(installed>4){
  for(const name of Object.keys(walletTablesAt(installed)).filter(name=>!Object.hasOwn(snapshot.tables,name))){
   if(tx.sql.get('SELECT 1 AS present FROM '+name+' LIMIT 1'))fail(409,'Kho pilot chứa dữ liệu mới; cần đối soát trước khi di trú.');snapshot.tables[name]=[];
  }
  snapshot.schemaVersion=installed+1;snapshot.checksum=walletSnapshotChecksum(snapshot);
 }
 restoreWalletSnapshot(tx,snapshot);return plan.receipt;
}
