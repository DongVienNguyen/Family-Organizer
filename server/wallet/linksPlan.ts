import {object,keys,text,choice,boolean} from '../../src/features/productivity/validation.js';
import {timezoneFormatter} from '../../src/features/productivity/dates.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {assertMoney,minorInteger} from '../../src/features/wallet/money.js';
import {recordDraftValue} from '../../src/features/wallet/recordDraftValue.js';
import type {Money} from '../../src/features/wallet/contracts.js';
import type {RecordDraft} from './records.js';

const value=(minor:bigint,currency:string):Money=>({minor:minorInteger(minor.toString()).toString(),currency});
function amount(raw:unknown,positive=false):Money {assertMoney(raw);const n=minorInteger(raw.minor);if(n<0n||positive&&n===0n)throw Error('Invalid financial link amount');return {...raw};}
function base(v:Record<string,unknown>){text(v.date,10);parseEffectiveDate(v.date);text(v.timezone,100);timezoneFormatter(v.timezone);const note=v.note===undefined?'':v.note;text(note,100000,false);return {effectiveDate:v.date,timezone:v.timezone,note,payee:'',paymentMethod:'',occurredAt:null,reviewedAt:null,settlementStatus:'cleared' as const,categoryId:null,labelIds:[]};}
/** Pure cashflow plan, without owner, record identity, migration or write
 * authority. The command must recheck the debt and accounts inside I01. */
export function planDebtPayment(raw:unknown){
 const v=object(raw);keys(v,['direction','principal','interest','accountId','counterAccountId','date','timezone','note','interestCategoryId']);choice(v.direction,['borrowed','lent']);text(v.accountId,256);if(v.counterAccountId!==undefined){text(v.counterAccountId,256);if(v.counterAccountId===v.accountId)throw Error('Debt accounts must differ');}
 const principal=amount(v.principal),interest=amount(v.interest);if(principal.currency!==interest.currency)throw Error('Debt payment currencies differ');const total=value(minorInteger(principal.minor)+minorInteger(interest.minor),principal.currency);if(total.minor==='0')throw Error('Empty debt payment');
 const common=base(v),records:{role:'principal'|'interest';draft:RecordDraft}[]=[],outgoing=v.direction==='borrowed';
 if(v.interestCategoryId!==undefined&&v.interestCategoryId!==null)text(v.interestCategoryId,256);
 if(principal.minor!=='0')records.push({role:'principal',draft:recordDraftValue({...common,kind:'transfer',fromAccountId:outgoing?v.accountId:v.counterAccountId??null,toAccountId:outgoing?v.counterAccountId??null:v.accountId,debit:principal,credit:principal,fx:null})});
 if(interest.minor!=='0')records.push({role:'interest',draft:recordDraftValue({...common,kind:outgoing?'expense':'income',accountId:v.accountId,money:interest,categoryId:v.interestCategoryId??null})});
 return {direction:v.direction,principal,interest,total,cashDelta:value(minorInteger(total.minor)*(outgoing?-1n:1n),total.currency),records};
}
export interface GoalAllocationPolicy {strict:boolean;available:Money;allocated:Money}
/** Allocation is a claim on an existing account, never another asset or income.
 * Available and allocated are trusted current projections, not HTTP claims. */
export function planGoalContribution(raw:unknown,policy:GoalAllocationPolicy){
 const v=object(raw);keys(v,['mode','money','fromAccountId','toAccountId','date','timezone','note']);choice(v.mode,['allocation','transfer']);text(v.fromAccountId,256);const money=amount(v.money,true),common=base(v);
 const p=object(policy);keys(p,['strict','available','allocated']);boolean(p.strict);assertMoney(p.available);const allocated=amount(p.allocated);if(p.available.currency!==money.currency||allocated.currency!==money.currency)throw Error('Goal policy currencies differ');
 const remainingAvailable=value(minorInteger(p.available.minor)-minorInteger(allocated.minor)-minorInteger(money.minor),money.currency),overallocated=minorInteger(remainingAvailable.minor)<0n;if(p.strict&&overallocated)throw Error('Goal exceeds available unallocated balance');
 let record:RecordDraft|null=null;if(v.mode==='transfer'){text(v.toAccountId,256);if(v.toAccountId===v.fromAccountId)throw Error('Goal accounts must differ');record=recordDraftValue({...common,kind:'transfer',fromAccountId:v.fromAccountId,toAccountId:v.toAccountId,debit:money,credit:money,fx:null});}else if(v.toAccountId!==undefined)throw Error('Allocation has no destination transfer');
 return {mode:v.mode,money,record,cashDelta:value(v.mode==='transfer'?-minorInteger(money.minor):0n,money.currency),remainingAvailable,overallocated};
}
