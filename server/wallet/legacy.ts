import type {Actor} from '../../src/features/wallet/contracts.js';
import {AccountType,TransactionType,type FinancialTransaction} from '../../src/types.js';
import {minorInteger} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {text,integer,choice} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
import type {WalletRecord,WalletPosting,WalletAccount} from './store.js';
import {walletAccountReadScope,type WalletReader} from './access.js';
export interface LegacyProjectionInput {record:WalletRecord;postings:WalletPosting[];account:Pick<WalletAccount,'id'|'type'|'currency'>;createdAt:string|null;categoryValue?:string;receiptImage?:string}
export interface LegacyFinancialTransaction extends FinancialTransaction {walletRevision:number;createdAtKnown:boolean}
type Unsupported='kind'|'currency'|'account'|'range';
const unsupported=(kind:Unsupported):never=>{throw new AppStoreError('Bản ghi cần giao diện Wallet để biểu diễn đầy đủ.',422,'legacy-unsupported-'+kind);};
const invalid=():never=>{throw new AppStoreError('Dữ liệu giao dịch không hợp lệ.',422,'legacy-invalid-shape');};
/** This pure conversion receives an already authorized owned projection. */
export function projectLegacyRecord(input:LegacyProjectionInput):LegacyFinancialTransaction {
 const r=input.record;if(!r||!['income','expense'].includes(r.kind))unsupported('kind');if(r.settlementStatus==='voided')throw new AppStoreError('Giao dịch đã hủy.',422,'legacy-voided-record');
 let n:bigint,category:string;
 try{
  text(r.id,256);text(r.creatorId,256);text(r.note,100000,false);integer(r.revision,1);parseEffectiveDate(r.effectiveDate);choice(r.settlementStatus,['uncleared','cleared','reconciled']);
  if(input.postings.length!==1)invalid();const p=input.postings[0];if(p.recordId!==r.id||p.accountId!==input.account.id)invalid();n=minorInteger(p.deltaMinor);if(r.kind==='expense'&&n>0n||r.kind==='income'&&n<0n)invalid();
  if(input.createdAt!==null){text(input.createdAt,24);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.createdAt)||!Number.isFinite(Date.parse(input.createdAt))||new Date(input.createdAt).toISOString()!==input.createdAt)invalid();}
  category=input.categoryValue??r.categoryId??'other';text(category,256);if(input.receiptImage!==undefined)text(input.receiptImage,16*1024*1024,false);
 }catch(error){if(error instanceof AppStoreError)throw error;invalid();}
 if(input.account.currency!=='VND')unsupported('currency');if(!['cash','bank','e_wallet'].includes(input.account.type))unsupported('account');
 const absolute=n<0n?-n:n;if(absolute>BigInt(Number.MAX_SAFE_INTEGER))unsupported('range');
 return {id:r.id,type:r.kind as TransactionType,amount:Number(absolute),category,account:input.account.type as AccountType,description:r.note,date:r.effectiveDate,creatorId:r.creatorId,...(input.receiptImage===undefined?{}:{receiptImage:input.receiptImage}),createdAt:input.createdAt??'',createdAtKnown:input.createdAt!==null,walletRevision:r.revision};
}
export interface LegacyFinanceRead {transactions:LegacyFinancialTransaction[];coverage:{complete:boolean;visibleRecords:number;projectedRecords:number;unsupported:Record<Unsupported,number>}}
/** Compatibility read only; scope precedes bodies and unsupported classes remain explicit. */
export function createLegacyFinanceReader(ports:{reader:WalletReader;categoryValue?:(id:string)=>string;receiptUrl?:(actor:Actor,recordId:string)=>string|undefined}){
 return {readLegacyFinance(actor:Actor):LegacyFinanceRead {
  const scope=walletAccountReadScope(ports.reader,actor);
  if(ports.reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')throw new AppStoreError('Kho Wallet chưa được kích hoạt.',409,'wallet-storage-inactive');
  const rows=ports.reader.all(`SELECT r.id,r.kind,r.effective_date,r.timezone,r.source,r.external_key,r.note,r.settlement_status,r.creator_id,r.revision,r.category_id,r.occurrence_id,p.account_id,CAST(p.delta_minor AS TEXT) AS delta_minor,a.type AS account_type,a.currency,m.record_id AS metadata_id,m.created_at,(SELECT count(*) FROM wallet_postings allp WHERE allp.record_id=r.id) AS posting_count
FROM wallet_records r JOIN wallet_postings p ON p.record_id=r.id JOIN wallet_accounts a ON a.id=p.account_id LEFT JOIN wallet_record_metadata m ON m.record_id=r.id
WHERE r.settlement_status!='voided' AND (`+scope.sql+`) IN('read','contribute','manage') ORDER BY r.effective_date DESC,r.id DESC,p.account_id`,...scope.args);
  const transactions:LegacyFinancialTransaction[]=[],unsupported:Record<Unsupported,number>={kind:0,currency:0,account:0,range:0},seen=new Set<string>();
  for(const row of rows){if(seen.has(row.id))continue;seen.add(row.id);if(row.metadata_id!==row.id)invalid();
   const record:WalletRecord={id:row.id,kind:row.kind,effectiveDate:row.effective_date,timezone:row.timezone,source:row.source,note:row.note,settlementStatus:row.settlement_status,creatorId:row.creator_id,revision:row.revision,...(row.category_id===null?{}:{categoryId:row.category_id})};
   let value:LegacyFinancialTransaction;
   try{value=projectLegacyRecord({record,postings:row.posting_count===1?[{recordId:row.id,accountId:row.account_id,deltaMinor:row.delta_minor}]:[],account:{id:row.account_id,type:row.account_type,currency:row.currency},createdAt:row.created_at});}
   catch(error){const code=(error as AppStoreError)?.code,kind=code?.startsWith('legacy-unsupported-')?code.slice('legacy-unsupported-'.length) as Unsupported:undefined;if(kind&&Object.hasOwn(unsupported,kind)){unsupported[kind]++;continue;}throw error;}
   if(row.category_id!==null&&ports.categoryValue){const category=ports.categoryValue(row.category_id);text(category,256);value.category=category;}
   if(ports.receiptUrl){const url=ports.receiptUrl(actor,row.id);if(url!==undefined){text(url,16*1024*1024,false);value.receiptImage=url;}}
   transactions.push(value);
  }
  return {transactions,coverage:{complete:transactions.length===seen.size,visibleRecords:seen.size,projectedRecords:transactions.length,unsupported}};
 }};
}
