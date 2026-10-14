import type {withAppWriteTransaction,AppWriteMetadata,AppWriteTx} from '../appStore.js';
import type {Source,RecordKind,Settlement} from '../../src/features/wallet/contracts.js';
import {minorInteger,currencyExponent} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {timezoneFormatter} from '../../src/features/productivity/dates.js';
import {text,choice,integer} from '../../src/features/productivity/validation.js';
export interface WalletAccount {id:string;name:string;type:'cash'|'bank'|'savings'|'credit'|'e_wallet'|'investment'|'asset'|'liability';currency:string;ownerUserId:string;accessMode:'shared'|'private';openingMinor:string;openingDate:string;revision:number}
export interface WalletRecord {id:string;kind:RecordKind;effectiveDate:string;timezone:string;source:Source;externalKey?:string;note:string;settlementStatus:Settlement;creatorId:string;revision:number;categoryId?:string;occurrenceId?:string}
export interface WalletPosting {recordId:string;accountId:string;deltaMinor:string}
const accountColumns='id,name,type,currency,owner_user_id AS ownerUserId,access_mode AS accessMode,CAST(opening_minor AS TEXT) AS openingMinor,opening_date AS openingDate,revision';
const recordColumns='id,kind,effective_date AS effectiveDate,timezone,source,external_key AS externalKey,note,settlement_status AS settlementStatus,creator_id AS creatorId,revision,category_id AS categoryId,occurrence_id AS occurrenceId';
function walletTx(tx:AppWriteTx) {
 return {
  get legacy(){return tx.legacy;},
  accounts:{
   insert(value:WalletAccount){for(const key of ['id','name','ownerUserId'] as const)text(value[key],key==='name'?500:256);choice(value.type,['cash','bank','savings','credit','e_wallet','investment','asset','liability']);currencyExponent(value.currency);choice(value.accessMode,['shared','private']);parseEffectiveDate(value.openingDate);integer(value.revision,1);tx.run('INSERT INTO wallet_accounts(id,name,type,currency,owner_user_id,access_mode,opening_minor,opening_date,revision) VALUES(?,?,?,?,?,?,?,?,?)',value.id,value.name,value.type,value.currency,value.ownerUserId,value.accessMode,minorInteger(value.openingMinor),value.openingDate,value.revision);},
   get(id:string):WalletAccount|null{text(id,256);return tx.get('SELECT '+accountColumns+' FROM wallet_accounts WHERE id=?',id)??null;},
   all():WalletAccount[]{return tx.all('SELECT '+accountColumns+' FROM wallet_accounts ORDER BY id');},
  },
  records:{
   insert(value:WalletRecord){text(value.id,256);text(value.creatorId,256);text(value.note,100000,false);choice(value.kind,['income','expense','transfer','adjustment','trade']);choice(value.source,['manual','import','schedule','legacy']);choice(value.settlementStatus,['uncleared','cleared','reconciled','voided']);parseEffectiveDate(value.effectiveDate);timezoneFormatter(value.timezone);integer(value.revision,1);for(const key of ['externalKey','categoryId','occurrenceId'] as const)if(value[key]!==undefined)text(value[key],256);tx.run('INSERT INTO wallet_records VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',value.id,value.kind,value.effectiveDate,value.timezone,value.source,value.externalKey??null,value.note,value.settlementStatus,value.creatorId,value.revision,value.categoryId??null,value.occurrenceId??null);},
   get(id:string):WalletRecord|null{text(id,256);return tx.get('SELECT '+recordColumns+' FROM wallet_records WHERE id=?',id)??null;},
  },
  postings:{
   insert(value:WalletPosting){text(value.recordId,256);text(value.accountId,256);const record=tx.get('SELECT effective_date FROM wallet_records WHERE id=?',value.recordId);if(!record)throw Error('Wallet record not found');tx.run('INSERT INTO wallet_postings VALUES(?,?,?,?)',value.recordId,value.accountId,record.effective_date,minorInteger(value.deltaMinor));},
   forRecord(id:string):WalletPosting[]{text(id,256);return tx.all('SELECT record_id AS recordId,account_id AS accountId,CAST(delta_minor AS TEXT) AS deltaMinor FROM wallet_postings WHERE record_id=? ORDER BY account_id',id);},
  },
  audit:{append(value:{id:string;recordId:string;actorId:string;action:string}){for(const key of ['id','recordId','actorId','action'] as const)text(value[key],key==='action'?500:256);tx.run('INSERT INTO wallet_audit VALUES(?,?,?,?)',value.id,value.recordId,value.actorId,value.action);}},
  schedules:{insert(value:{id:string;config:Record<string,unknown>}){text(value.id,256);const json=JSON.stringify(value.config);text(json,20000);tx.run('INSERT INTO wallet_schedules VALUES(?,?)',value.id,json);}},
  occurrences:{insert(value:{id:string;scheduleId:string;dueDate:string}){text(value.id,256);text(value.scheduleId,256);parseEffectiveDate(value.dueDate);tx.run('INSERT INTO wallet_occurrences VALUES(?,?,?)',value.id,value.scheduleId,value.dueDate);}},
 };
}
export type WalletTx=ReturnType<typeof walletTx>;
/** I01 remains the only transaction/idempotency owner; no direct native DB/writer. */
export function openWalletStore(ports:{write:typeof withAppWriteTransaction}) {
 return {transaction<T>(meta:AppWriteMetadata,fn:(tx:WalletTx)=>T):T {if(fn.constructor.name==='AsyncFunction')throw Error('Wallet callback must be synchronous');return ports.write(meta,tx=>fn(walletTx(tx)));}};
}
