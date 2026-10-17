import type {AppWriteTx} from '../appStore.js';
import {minorInteger} from '../../src/features/wallet/money.js';
import {object,keys,text,choice,integer,boolean} from '../../src/features/productivity/validation.js';
import {walletMetadataParents} from './metadataSchema.js';
export interface WalletProvenance {createdAt:string|null;updatedAt:string|null;createdBy:string|null;updatedBy:string|null}
export interface WalletAccountMetadata extends WalletProvenance {accountId:string;excludedFromStats:boolean;creditLimitMinor:string|null;dueDay:number|null;balanceDisplay:'book'|'available'|'both'}
export interface WalletRecordMetadata extends WalletProvenance {recordId:string;occurredAt:string|null;payee:string;paymentMethod:string;reviewedAt:string|null}
export interface WalletCategoryMetadata extends WalletProvenance {categoryId:string;icon:string;color:string;hidden:boolean;revision:number}
export interface WalletLabelMetadata extends WalletProvenance {labelId:string;icon:string;color:string;hidden:boolean;revision:number}
export interface WalletAuditMetadata {auditId:string;occurredAt:string|null;before:Record<string,unknown>|null;after:Record<string,unknown>|null}
const provenance=['created_at','updated_at','created_by','updated_by'] as const;
export const walletMetadataColumns={
 wallet_account_metadata:['account_id',...provenance,'excluded_from_stats','credit_limit_minor','due_day','balance_display'],
 wallet_record_metadata:['record_id',...provenance,'occurred_at','payee','payment_method','reviewed_at'],
 wallet_category_metadata:['category_id',...provenance,'icon','color','hidden','revision'],
 wallet_label_metadata:['label_id',...provenance,'icon','color','hidden','revision'],
 wallet_audit_metadata:['audit_id','occurred_at','before_json','after_json'],
} as const;
export type WalletMetadataTable=keyof typeof walletMetadataColumns;
type Row=Record<string,string|number|null>;
const camel=(key:string)=>key.replace(/_([a-z])/g,(_all,letter:string)=>letter.toUpperCase());
const field=(column:string)=>column==='before_json'?'before':column==='after_json'?'after':camel(column);
function timestamp(value:unknown):void {if(value===null)return;text(value,24);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw Error('Invalid Wallet metadata timestamp');}
function json(value:unknown):string|null {if(value===null)return null;object(value);const encoded=JSON.stringify(value);text(encoded,100000);return encoded;}
export function validateMetadata(table:WalletMetadataTable,value:unknown,userIds?:Set<string>):void {
 const v=object(value),fields=walletMetadataColumns[table].map(field);keys(v,fields);if(Object.keys(v).length!==fields.length)throw Error('Incomplete Wallet metadata');
 for(const [key,entry]of Object.entries(v)){
  if(key.endsWith('At'))timestamp(entry);
  else if(key==='createdBy'||key==='updatedBy'){if(entry!==null){text(entry,256);if(userIds&&!userIds.has(entry))throw Error('Invalid Wallet metadata user');}}
  else if(key.endsWith('Id'))text(entry,256);
 }
 if(v.createdAt!==undefined&&v.createdAt!==null&&v.updatedAt!==null&&String(v.updatedAt)<String(v.createdAt))throw Error('Backwards Wallet metadata time');
 if(table==='wallet_account_metadata'){boolean(v.excludedFromStats);if(v.creditLimitMinor!==null&&minorInteger(v.creditLimitMinor)<0n)throw Error('Negative Wallet credit limit');if(v.dueDay!==null)integer(v.dueDay,1,31);choice(v.balanceDisplay,['book','available','both']);}
 if(table==='wallet_record_metadata'){text(v.payee,500,false);text(v.paymentMethod,256,false);}
 if(table==='wallet_category_metadata'||table==='wallet_label_metadata'){text(v.icon,256,false);text(v.color,256,false);boolean(v.hidden);integer(v.revision,1);}
 if(table==='wallet_audit_metadata'){json(v.before);json(v.after);}
}
export function decodeMetadata(table:WalletMetadataTable,row:Row):Record<string,unknown> {
 return Object.fromEntries(walletMetadataColumns[table].map(column=>[field(column),column==='before_json'||column==='after_json'?row[column]===null?null:JSON.parse(String(row[column])):column==='hidden'||column==='excluded_from_stats'?row[column]===1:row[column]]));
}
export function validateWalletMetadataTables(tables:Record<string,Row[]>,userIds?:Set<string>):void {
 for(const [name,parent]of Object.entries(walletMetadataParents)){
  const table=name as WalletMetadataTable,columns=walletMetadataColumns[table],ids=new Set(tables[parent].map(row=>row.id)),rows=tables[table];
  if(rows.length!==ids.size)throw Error('Incomplete Wallet metadata coverage');
  for(const row of rows){if(!ids.has(row[columns[0]]))throw Error('Invalid Wallet metadata reference');for(const flag of ['hidden','excluded_from_stats'])if(flag in row&&row[flag]!==0&&row[flag]!==1)throw Error('Invalid Wallet metadata boolean');validateMetadata(table,decodeMetadata(table,row),userIds);}
 }
}
export function walletMetadataRepositories(tx:AppWriteTx){
 const repository=<T>(table:WalletMetadataTable)=>({
  get(id:string):T|null {text(id,256);const columns=walletMetadataColumns[table];const row=tx.get('SELECT '+columns.map(column=>column==='credit_limit_minor'?'CAST(credit_limit_minor AS TEXT) AS credit_limit_minor':column).join(',')+' FROM '+table+' WHERE '+columns[0]+'=?',id);return row?decodeMetadata(table,row) as T:null;},
  set(value:T):void {validateMetadata(table,value,new Set(tx.legacy.users.map(user=>user.id)));const columns=walletMetadataColumns[table];const v=value as Record<string,unknown>;tx.run('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+') ON CONFLICT('+columns[0]+') DO UPDATE SET '+columns.slice(1).map(column=>column+'=excluded.'+column).join(','),...columns.map(column=>{const entry=v[field(column)];return column==='credit_limit_minor'?entry===null?null:minorInteger(entry):column==='before_json'||column==='after_json'?json(entry):typeof entry==='boolean'?Number(entry):entry;}));},
 });
 return {accounts:repository<WalletAccountMetadata>('wallet_account_metadata'),records:repository<WalletRecordMetadata>('wallet_record_metadata'),categories:repository<WalletCategoryMetadata>('wallet_category_metadata'),labels:repository<WalletLabelMetadata>('wallet_label_metadata'),audit:repository<WalletAuditMetadata>('wallet_audit_metadata')};
}
