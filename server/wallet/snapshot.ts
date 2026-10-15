import type {WalletTx} from './store.js';
import {createHash} from 'node:crypto';
import {minorInteger,currencyExponent} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {timezoneFormatter} from '../../src/features/productivity/dates.js';
import {object,keys,text,integer,choice} from '../../src/features/productivity/validation.js';
export const walletSnapshotColumns={
 wallet_currencies:['code','exponent'],wallet_accounts:['id','name','type','currency','owner_user_id','access_mode','opening_minor','opening_date','revision','archived_at'],wallet_account_grants:['account_id','user_id','permission'],wallet_categories:['id','parent_id','name','nature','archived_at'],wallet_labels:['id','name','archived_at'],wallet_schedules:['id','payload_json'],wallet_occurrences:['id','schedule_id','due_date'],wallet_records:['id','kind','effective_date','timezone','source','external_key','note','settlement_status','creator_id','revision','category_id','occurrence_id'],wallet_postings:['record_id','account_id','effective_date','delta_minor'],wallet_record_labels:['record_id','label_id'],wallet_allocations:['record_id','category_id','amount_minor'],wallet_audit:['id','record_id','actor_id','action'],
} as const;
const moneyColumns:Record<string,readonly string[]>={wallet_accounts:['opening_minor'],wallet_postings:['delta_minor'],wallet_allocations:['amount_minor']};
const primaryKeys:Record<string,readonly string[]>={wallet_currencies:['code'],wallet_account_grants:['account_id','user_id'],wallet_postings:['record_id','account_id'],wallet_record_labels:['record_id','label_id'],wallet_allocations:['record_id','category_id']};
const nullable=new Set(['archived_at','parent_id','external_key','category_id','occurrence_id','record_id']);
type Row=Record<string,string|number|null>;
export interface WalletSnapshot {schemaVersion:number;tables:Record<string,Row[]>;checksum:string}
export function walletSnapshotChecksum(snapshot:WalletSnapshot):string{return createHash('sha256').update(JSON.stringify({schemaVersion:snapshot.schemaVersion,tables:snapshot.tables})).digest('hex');}
function validate(value:unknown,userIds?:Set<string>):asserts value is WalletSnapshot {
 const raw=object(value);keys(raw,['schemaVersion','tables','checksum']);if(raw.schemaVersion!==2||typeof raw.checksum!=='string'||raw.checksum!==walletSnapshotChecksum(raw as unknown as WalletSnapshot))throw Error('Unsupported or invalid Wallet snapshot');const tables=object(raw.tables);keys(tables,Object.keys(walletSnapshotColumns));if(Object.keys(tables).length!==Object.keys(walletSnapshotColumns).length)throw Error('Incomplete Wallet snapshot');
 for(const [name,columns]of Object.entries(walletSnapshotColumns)){
  const rows=tables[name];if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid Wallet snapshot rows');const seen=new Set<string>();
  for(const value of rows){const row=object(value);keys(row,[...columns]);if(Object.keys(row).length!==columns.length)throw Error('Incomplete Wallet snapshot row');for(const column of columns){const v=row[column];if(v===null){if(!nullable.has(column)||column==='record_id'&&name!=='wallet_audit')throw Error('Unexpected Wallet null');continue;}if(moneyColumns[name]?.includes(column)){minorInteger(v);if(column==='amount_minor'&&BigInt(v as string)<0n)throw Error('Negative allocation');}else if(column==='revision'||column==='exponent')integer(v,column==='revision'?1:0, column==='exponent'?8:Number.MAX_SAFE_INTEGER);else{text(v,column==='note'?100000:column==='payload_json'?20000:column==='name'||column==='action'?500:256,column!=='note');}}
   const identity=JSON.stringify((primaryKeys[name]??['id']).map(column=>row[column]));if(seen.has(identity))throw Error('Duplicate Wallet snapshot key');seen.add(identity);
  }
 }
 const rows=tables as unknown as Record<string,Row[]>,map=(name:string,key='id')=>new Map(rows[name].map(row=>[row[key],row])),accounts=map('wallet_accounts'),records=map('wallet_records'),categories=map('wallet_categories'),labels=map('wallet_labels'),schedules=map('wallet_schedules'),occurrences=map('wallet_occurrences'),currencies=map('wallet_currencies','code');
 const ref=(map:Map<string|number|null,Row>,id:Row[string],allowNull=false)=>{if(!(allowNull&&id===null)&&!map.has(id))throw Error('Invalid Wallet snapshot reference');};const user=(id:Row[string])=>{if(userIds&&!userIds.has(String(id)))throw Error('Invalid Wallet snapshot user');};
 for(const r of rows.wallet_currencies)if(currencyExponent(String(r.code))!==r.exponent)throw Error('Invalid Wallet currency exponent');
 for(const r of rows.wallet_accounts){choice(r.type,['cash','bank','savings','credit','e_wallet','investment','asset','liability']);choice(r.access_mode,['shared','private']);parseEffectiveDate(String(r.opening_date));ref(currencies,r.currency);user(r.owner_user_id);}
 for(const r of rows.wallet_account_grants){ref(accounts,r.account_id);choice(r.permission,['read','contribute','manage']);user(r.user_id);}
 for(const r of rows.wallet_categories){ref(categories,r.parent_id,true);choice(r.nature,['must','need','want','unspecified']);}
 for(const r of rows.wallet_schedules)object(JSON.parse(String(r.payload_json)));
 const occurrenceKeys=new Set<string>();for(const r of rows.wallet_occurrences){ref(schedules,r.schedule_id);parseEffectiveDate(String(r.due_date));const key=JSON.stringify([r.schedule_id,r.due_date]);if(occurrenceKeys.has(key))throw Error('Duplicate Wallet occurrence');occurrenceKeys.add(key);}
 const external=new Set<string>(),linked=new Set<Row[string]>();for(const r of rows.wallet_records){choice(r.kind,['income','expense','transfer','adjustment','trade']);choice(r.source,['manual','import','schedule','legacy']);choice(r.settlement_status,['uncleared','cleared','reconciled','voided']);parseEffectiveDate(String(r.effective_date));timezoneFormatter(String(r.timezone));ref(categories,r.category_id,true);ref(occurrences,r.occurrence_id,true);if(r.external_key!==null){const key=JSON.stringify([r.source,r.external_key]);if(external.has(key))throw Error('Duplicate Wallet external key');external.add(key);}if(r.occurrence_id!==null){if(linked.has(r.occurrence_id))throw Error('Duplicate Wallet linked occurrence');linked.add(r.occurrence_id);}}
 for(const r of rows.wallet_postings){ref(records,r.record_id);ref(accounts,r.account_id);if(r.effective_date!==records.get(r.record_id)!.effective_date)throw Error('Wallet posting date mismatch');}
 for(const r of rows.wallet_record_labels){ref(records,r.record_id);ref(labels,r.label_id);}
 for(const r of rows.wallet_allocations){ref(records,r.record_id);ref(categories,r.category_id);}
 for(const r of rows.wallet_audit)ref(records,r.record_id,true);
}
/** Full bytes are a marked read result, never a command-cache payload. */
export function exportWalletSnapshot(tx:WalletTx,mark:<T extends object>(value:T)=>T):WalletSnapshot {
 const tables=Object.fromEntries(Object.entries(walletSnapshotColumns).map(([name,columns])=>[name,tx.sql.all('SELECT '+columns.map(column=>moneyColumns[name]?.includes(column)?'CAST('+column+' AS TEXT) AS '+column:column).join(',')+' FROM '+name+' ORDER BY '+(primaryKeys[name]??['id']).join(','))]));const result={schemaVersion:2,tables,checksum:''};result.checksum=walletSnapshotChecksum(result);validate(result);return mark(result);
}
/** Caller already owns I01's one legacy+domain transaction. Validate before writes. */
export function restoreWalletSnapshot(tx:WalletTx,value:unknown):void {
 validate(value,new Set(tx.legacy.users.map(user=>user.id)));for(const name of [...Object.keys(walletSnapshotColumns)].reverse())tx.sql.run('DELETE FROM '+name);
 for(const [name,columns]of Object.entries(walletSnapshotColumns))for(const row of value.tables[name])tx.sql.run('INSERT INTO '+name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',...columns.map(column=>moneyColumns[name]?.includes(column)?minorInteger(row[column]):row[column]));
}
