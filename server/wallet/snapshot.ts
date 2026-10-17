import {walletSchemas,walletTableDefinitions,walletStorageVersions} from './schemaRegistry.js';
import {validateWalletSelectionTables} from './selectionSchema.js';
import {walletReceiptColumns,validateWalletReceiptTables} from './receiptSchema.js';
import {walletLegacyMigrationColumns} from './legacyMigrationSchema.js';
import {validateWalletLegacyTables} from './legacyMigrationData.js';
import type {WalletTx} from './store.js';
import {createHash} from 'node:crypto';
import {minorInteger,currencyExponent} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {timezoneFormatter} from '../../src/features/productivity/dates.js';
import {walletFinancialColumns,validateWalletFinancialTables} from './financial.js';
import {walletMetadataColumns,validateWalletMetadataTables} from './metadata.js';
import {object,keys,text,integer,choice} from '../../src/features/productivity/validation.js';
export {walletCoreColumns as walletSnapshotColumns} from './coreColumns.js';
export function walletTablesAt(version:number):Record<string,readonly string[]> {return walletTableDefinitions(version);}
export const moneyColumns:Record<string,readonly string[]>={wallet_accounts:['opening_minor'],wallet_postings:['delta_minor'],wallet_allocations:['amount_minor'],wallet_account_metadata:['credit_limit_minor'],wallet_record_fx:['debit_minor','credit_minor']};
const metadataPrimaryKeys=Object.fromEntries(Object.entries(walletMetadataColumns).map(([name,columns])=>[name,[columns[0]]]));
const primaryKeys:Record<string,readonly string[]>={...metadataPrimaryKeys,wallet_selection_records:['selection_id','record_id'],wallet_legacy_links:['run_id','source_kind','parent_id','legacy_id'],wallet_record_fx:['record_id'],wallet_transfer_fees:['transfer_record_id'],wallet_currencies:['code'],wallet_account_grants:['account_id','user_id'],wallet_postings:['record_id','account_id'],wallet_record_labels:['record_id','label_id'],wallet_allocations:['record_id','category_id']};
const nullable=new Set(['filter_json','filter_hash','applied_at','applied_request_id','target_id','reason','archived_at','parent_id','external_key','category_id','occurrence_id','record_id','created_at','updated_at','created_by','updated_by','occurred_at','reviewed_at','credit_limit_minor','due_day','before_json','after_json']);
type Row=Record<string,string|number|null>;
export interface WalletSnapshot {schemaVersion:number;tables:Record<string,Row[]>;checksum:string}
export function walletSnapshotChecksum(snapshot:WalletSnapshot):string{return createHash('sha256').update(JSON.stringify({schemaVersion:snapshot.schemaVersion,tables:snapshot.tables})).digest('hex');}
export function validate(value:unknown,userIds?:Set<string>):asserts value is WalletSnapshot {
 const raw=object(value);keys(raw,['schemaVersion','tables','checksum']);if(!walletStorageVersions.includes((raw.schemaVersion as number)-1)||typeof raw.checksum!=='string'||raw.checksum!==walletSnapshotChecksum(raw as unknown as WalletSnapshot))throw Error('Unsupported or invalid Wallet snapshot');const definitions=walletTablesAt((raw.schemaVersion as number)-1),tables=object(raw.tables);keys(tables,Object.keys(definitions));if(Object.keys(tables).length!==Object.keys(definitions).length)throw Error('Incomplete Wallet snapshot');
 for(const [name,columns]of Object.entries(definitions)){
  const rows=tables[name];if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid Wallet snapshot rows');const seen=new Set<string>();
  for(const value of rows){const row=object(value);keys(row,[...columns]);if(Object.keys(row).length!==columns.length)throw Error('Incomplete Wallet snapshot row');for(const column of columns){const v=row[column];if(v===null){if(!nullable.has(column)||column==='record_id'&&name!=='wallet_audit')throw Error('Unexpected Wallet null');continue;}if(moneyColumns[name]?.includes(column)){minorInteger(v);if(column==='amount_minor'&&BigInt(v as string)<0n)throw Error('Negative allocation');}else if(['record_count','record_revision','ordinal','size','revision','exponent','due_day','hidden','excluded_from_stats','migration_version','accounts_count','categories_count','records_count','quarantined_count','unlinked_count','receipts_pending_count'].includes(column))integer(v,column==='revision'||column==='record_revision'||column==='due_day'?1:0,column==='exponent'?8:column==='due_day'?31:column==='hidden'||column==='excluded_from_stats'?1:Number.MAX_SAFE_INTEGER);else{text(v,column==='filter_json'?4*1024*1024:column==='note'||column==='before_json'||column==='after_json'?100000:column==='payload_json'||column==='detail_json'?20000:column==='name'||column==='action'||column==='payee'?500:256,!['note','payee','payment_method','icon','color'].includes(column));}}
   const identity=JSON.stringify((primaryKeys[name]??['id']).map(column=>row[column]));if(seen.has(identity))throw Error('Duplicate Wallet snapshot key');seen.add(identity);
  }
 }
 const rows=tables as unknown as Record<string,Row[]>,map=(name:string,key='id')=>new Map(rows[name].map(row=>[row[key],row])),accounts=map('wallet_accounts'),records=map('wallet_records'),categories=map('wallet_categories'),labels=map('wallet_labels'),schedules=map('wallet_schedules'),occurrences=map('wallet_occurrences'),currencies=map('wallet_currencies','code');
 const ref=(map:Map<string|number|null,Row>,id:Row[string],allowNull=false)=>{if(!(allowNull&&id===null)&&!map.has(id))throw Error('Invalid Wallet snapshot reference');};const user=(id:Row[string])=>{if(userIds&&!userIds.has(String(id)))throw Error('Invalid Wallet snapshot user');};
 for(const r of rows.wallet_currencies)if(currencyExponent(String(r.code))!==r.exponent)throw Error('Invalid Wallet currency exponent');
 for(const r of rows.wallet_accounts){choice(r.type,['cash','bank','savings','credit','e_wallet','investment','asset','liability']);choice(r.access_mode,['shared','private']);parseEffectiveDate(String(r.opening_date));ref(currencies,r.currency);user(r.owner_user_id);}
 for(const r of rows.wallet_account_grants){ref(accounts,r.account_id);choice(r.permission,['read','contribute','manage']);user(r.user_id);}
 for(const r of rows.wallet_categories){ref(categories,r.parent_id,true);choice(r.nature,['must','need','want','unspecified']);}
 // Validate category ancestry iteratively: large legitimate catalogs must not
 // exhaust the call stack, and a valid checksum does not make a cycle valid.
 const complete=new Set<Row[string]>();
 for(const category of rows.wallet_categories){const path=new Set<Row[string]>();let id=category.id;while(id!==null&&!complete.has(id)){if(path.has(id))throw Error('Cyclic Wallet category graph');path.add(id);id=categories.get(id)!.parent_id;}for(const seen of path)complete.add(seen);}
 for(const r of rows.wallet_schedules)object(JSON.parse(String(r.payload_json)));
 const occurrenceKeys=new Set<string>();for(const r of rows.wallet_occurrences){ref(schedules,r.schedule_id);parseEffectiveDate(String(r.due_date));const key=JSON.stringify([r.schedule_id,r.due_date]);if(occurrenceKeys.has(key))throw Error('Duplicate Wallet occurrence');occurrenceKeys.add(key);}
 const external=new Set<string>(),linked=new Set<Row[string]>();for(const r of rows.wallet_records){user(r.creator_id);choice(r.kind,['income','expense','transfer','adjustment','trade']);choice(r.source,['manual','import','schedule','legacy']);choice(r.settlement_status,['uncleared','cleared','reconciled','voided']);parseEffectiveDate(String(r.effective_date));timezoneFormatter(String(r.timezone));ref(categories,r.category_id,true);ref(occurrences,r.occurrence_id,true);if(r.external_key!==null){const key=JSON.stringify([r.source,r.external_key]);if(external.has(key))throw Error('Duplicate Wallet external key');external.add(key);}if(r.occurrence_id!==null){if(linked.has(r.occurrence_id))throw Error('Duplicate Wallet linked occurrence');linked.add(r.occurrence_id);}}
 for(const r of rows.wallet_postings){ref(records,r.record_id);ref(accounts,r.account_id);if(r.effective_date!==records.get(r.record_id)!.effective_date)throw Error('Wallet posting date mismatch');}
 for(const r of rows.wallet_record_labels){ref(records,r.record_id);ref(labels,r.label_id);}
 for(const r of rows.wallet_allocations){ref(records,r.record_id);ref(categories,r.category_id);}
 for(const r of rows.wallet_audit){ref(records,r.record_id,true);user(r.actor_id);}
 if((raw.schemaVersion as number)>=3)validateWalletMetadataTables(rows,userIds);
 if((raw.schemaVersion as number)>=4)validateWalletFinancialTables(rows);
 if((raw.schemaVersion as number)>=5)validateWalletLegacyTables(rows,userIds);
 if((raw.schemaVersion as number)>=6)validateWalletReceiptTables(rows,userIds);
 if((raw.schemaVersion as number)>=7)validateWalletSelectionTables(rows,userIds);
}
/** Full bytes are a marked read result, never a command-cache payload. */
export function storageVersion(tx:WalletTx):number {
 const names=tx.sql.all("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name).filter(name=>name.startsWith('wallet_'));
 const version=[...walletSchemas].reverse().find(entry=>Object.keys(entry.columns).some(name=>names.includes(name)))?.version??1;
 if(JSON.stringify([...names].sort())!==JSON.stringify(Object.keys(walletTablesAt(version)).sort()))throw Error('Unsupported or incomplete Wallet storage version');
 return version;
}
export function exportWalletSnapshot(tx:WalletTx,mark:<T extends object>(value:T)=>T):WalletSnapshot {
 const version=storageVersion(tx);
 const tables=Object.fromEntries(Object.entries(walletTablesAt(version)).map(([name,columns])=>[name,tx.sql.all('SELECT '+columns.map(column=>moneyColumns[name]?.includes(column)?'CAST('+column+' AS TEXT) AS '+column:column).join(',')+' FROM '+name+' ORDER BY '+(primaryKeys[name]??['id']).join(','))]));const result={schemaVersion:version+1,tables,checksum:''};result.checksum=walletSnapshotChecksum(result);validate(result,new Set(tx.legacy.users.map(user=>user.id)));return mark(result);
}
/** Caller already owns I01's one legacy+domain transaction. Validate before writes. */
export function restoreWalletSnapshot(tx:WalletTx,value:unknown):void {
 validate(value,new Set(tx.legacy.users.map(user=>user.id)));const version=storageVersion(tx);if(value.schemaVersion!==version+1)throw Error('Wallet snapshot storage version mismatch');const definitions=walletTablesAt(version);for(const name of [...Object.keys(definitions)].reverse())tx.sql.run('DELETE FROM '+name);
 for(const [name,columns]of Object.entries(definitions))for(const row of value.tables[name])tx.sql.run('INSERT INTO '+name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',...columns.map(column=>moneyColumns[name]?.includes(column)&&row[column]!==null?minorInteger(row[column]):row[column]));
}
