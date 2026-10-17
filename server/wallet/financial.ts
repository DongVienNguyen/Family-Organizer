import type {AppWriteTx} from '../appStore.js';
import {object,keys,text} from '../../src/features/productivity/validation.js';
import {minorInteger,currencyExponent,convertMoney} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
export interface WalletFxSnapshot {recordId:string;fromCurrency:string;toCurrency:string;debitMinor:string;creditMinor:string;numerator:string;denominator:string;asOf:string;source:string}
export const walletFinancialColumns={wallet_record_fx:['record_id','from_currency','to_currency','debit_minor','credit_minor','rate_numerator','rate_denominator','as_of','source'],wallet_transfer_fees:['transfer_record_id','fee_record_id']} as const;
type Row=Record<string,string|number|null>;
type TransferRecord={id:string;kind:string;settlementStatus:string};
type Posting={accountId:string;currency:string;minor:string};
function validateFx(value:unknown):asserts value is WalletFxSnapshot {
 const fields=['recordId','fromCurrency','toCurrency','debitMinor','creditMinor','numerator','denominator','asOf','source'];
 const v=object(value);keys(v,fields);if(Object.keys(v).length!==fields.length)throw Error('Incomplete Wallet FX');
 for(const key of ['recordId','source'])text(v[key],256);for(const key of ['fromCurrency','toCurrency']){text(v[key],3);currencyExponent(v[key]);}
 for(const key of ['debitMinor','creditMinor','numerator','denominator'])if(minorInteger(v[key])<=0n)throw Error('Invalid positive Wallet FX');
 text(v.asOf,10);parseEffectiveDate(v.asOf);if(v.fromCurrency===v.toCurrency)throw Error('Redundant Wallet FX');
 if(convertMoney({currency:v.fromCurrency as string,minor:v.debitMinor as string},v.toCurrency as string,{numerator:v.numerator as string,denominator:v.denominator as string}).minor!==v.creditMinor)throw Error('Wallet FX amount mismatch');
}
function decodeFx(row:Row):WalletFxSnapshot {return {recordId:row.record_id as string,fromCurrency:row.from_currency as string,toCurrency:row.to_currency as string,debitMinor:row.debit_minor as string,creditMinor:row.credit_minor as string,numerator:row.rate_numerator as string,denominator:row.rate_denominator as string,asOf:row.as_of as string,source:row.source as string};}
function validateTransfer(record:TransferRecord|undefined,postings:Posting[],fx?:WalletFxSnapshot):void {
 if(!record||record.kind!=='transfer'||postings.length<1||postings.length>2||postings.some(p=>minorInteger(p.minor)===0n))throw Error('Invalid Wallet transfer legs');
 if(fx){validateFx(fx);if(fx.recordId!==record.id||postings.some(p=>!(p.currency===fx.fromCurrency&&p.minor==='-'+fx.debitMinor||p.currency===fx.toCurrency&&p.minor===fx.creditMinor)))throw Error('Wallet FX posting mismatch');
  if(postings.length===2&&(postings[0].currency===postings[1].currency||minorInteger(postings[0].minor)*minorInteger(postings[1].minor)>=0n))throw Error('Invalid Wallet FX legs');
 }else if(postings.length===2&&(postings[0].currency!==postings[1].currency||minorInteger(postings[0].minor)+minorInteger(postings[1].minor)!==0n))throw Error('Missing Wallet FX or unbalanced transfer');
}
function validateFee(parent:TransferRecord|undefined,fee:TransferRecord|undefined,postings:Posting[]):void {
 if(!parent||parent.kind!=='transfer'||!fee||fee.kind!=='expense'||parent.id===fee.id||postings.length!==1||minorInteger(postings[0].minor)>=0n||parent.settlementStatus==='voided'&&fee.settlementStatus!=='voided')throw Error('Invalid Wallet transfer fee');
}
export function validateWalletFinancialTables(tables:Record<string,Row[]>):void {
 const records=new Map(tables.wallet_records.map(r=>[r.id,{id:r.id as string,kind:r.kind as string,settlementStatus:r.settlement_status as string}])),accounts=new Map(tables.wallet_accounts.map(r=>[r.id,r.currency as string])),postings=new Map<string,Posting[]>();
 for(const r of tables.wallet_postings){const id=r.record_id as string,rows=postings.get(id)??[];rows.push({accountId:r.account_id as string,currency:accounts.get(r.account_id)!,minor:r.delta_minor as string});postings.set(id,rows);}
 const rates=new Map<string,WalletFxSnapshot>();for(const row of tables.wallet_record_fx){const value=decodeFx(row);validateFx(value);if(!records.has(value.recordId)||records.get(value.recordId)!.kind!=='transfer')throw Error('Invalid Wallet FX reference');rates.set(value.recordId,value);}
 for(const record of records.values())if(record.kind==='transfer')validateTransfer(record,postings.get(record.id)??[],rates.get(record.id));
 const fees=new Set<string>();for(const r of tables.wallet_transfer_fees){const id=r.fee_record_id as string;if(fees.has(id))throw Error('Duplicate Wallet transfer fee');fees.add(id);validateFee(records.get(r.transfer_record_id),records.get(id),postings.get(id)??[]);}
}
export function walletFinancialRepositories(tx:AppWriteTx){
 const record=(id:string):TransferRecord|undefined=>tx.get('SELECT id,kind,settlement_status AS settlementStatus FROM wallet_records WHERE id=?',id);
 const postings=(id:string):Posting[]=>tx.all('SELECT p.account_id AS accountId,a.currency,CAST(p.delta_minor AS TEXT) AS minor FROM wallet_postings p JOIN wallet_accounts a ON a.id=p.account_id WHERE p.record_id=? ORDER BY p.account_id',id);
 const fx=(id:string):WalletFxSnapshot|null=>{text(id,256);const row=tx.get('SELECT record_id,from_currency,to_currency,CAST(debit_minor AS TEXT) AS debit_minor,CAST(credit_minor AS TEXT) AS credit_minor,rate_numerator,rate_denominator,as_of,source FROM wallet_record_fx WHERE record_id=?',id);return row?decodeFx(row):null;};
 return {
  fx:{
   insert(value:WalletFxSnapshot):void {validateFx(value);validateTransfer(record(value.recordId),postings(value.recordId),value);tx.run('INSERT INTO wallet_record_fx VALUES(?,?,?,?,?,?,?,?,?)',value.recordId,value.fromCurrency,value.toCurrency,minorInteger(value.debitMinor),minorInteger(value.creditMinor),value.numerator,value.denominator,value.asOf,value.source);},
   get:fx,
  },
  fees:{
   link(transferId:string,feeId:string):void {text(transferId,256);text(feeId,256);const parent=record(transferId);validateTransfer(parent,postings(transferId),fx(transferId)??undefined);validateFee(parent,record(feeId),postings(feeId));tx.run('INSERT INTO wallet_transfer_fees VALUES(?,?)',transferId,feeId);},
   get(transferId:string):string|null {text(transferId,256);return tx.get('SELECT fee_record_id FROM wallet_transfer_fees WHERE transfer_record_id=?',transferId)?.fee_record_id??null;},
  },
 };
}
