import {allocationRows,assertAllocationTotal} from './allocations.js';
import {object,keys,text,choice} from '../productivity/validation.js';
import {utcInstant,timezoneFormatter} from '../productivity/dates.js';
import {parseEffectiveDate} from './dates.js';
import {assertMoney,minorInteger,convertMoney} from './money.js';
import type {Money} from './contracts.js';
import type {RecordDraft} from '../../../server/wallet/records.js';
/** Public draft-only DTO. No record identity, provenance, receipt or schedule link. */
export function recordDraftValue(raw:unknown):RecordDraft {
 const value=object(raw),common=['allocations','effectiveDate','timezone','note','occurredAt','payee','paymentMethod','reviewedAt','settlementStatus','categoryId','labelIds'];choice(value.kind,['income','expense','adjustment','transfer']);keys(value,[...common,...(value.kind==='transfer'?['kind','fromAccountId','toAccountId','debit','credit','fx','fee']:['kind','accountId','money'])]);
 text(value.effectiveDate,10);parseEffectiveDate(value.effectiveDate);text(value.timezone,100);timezoneFormatter(value.timezone);text(value.note,100000,false);text(value.payee,500,false);text(value.paymentMethod,256,false);for(const key of ['occurredAt','reviewedAt'])if(value[key]!==null){text(value[key],24);utcInstant(value[key]);}choice(value.settlementStatus,['uncleared','cleared','reconciled']);if(value.categoryId!==null)text(value.categoryId,256);if(!Array.isArray(value.labelIds)||value.labelIds.length>20||new Set(value.labelIds).size!==value.labelIds.length)throw Error('Invalid draft labels');for(const id of value.labelIds)text(id,256);
 const amount=(raw:unknown,signed=false):Money=>{assertMoney(raw);const n=minorInteger(raw.minor);if(n===0n||!signed&&n<0n)throw Error('Invalid draft amount');return raw;};
 if(value.kind!=='transfer'){text(value.accountId,256);amount(value.money,value.kind==='adjustment');}
 else {
  for(const key of ['fromAccountId','toAccountId'])if(value[key]!==null)text(value[key],256);if(value.fromAccountId===value.toAccountId)throw Error('Invalid transfer endpoints');const debit=amount(value.debit),credit=amount(value.credit);
  if(debit.currency===credit.currency){if(debit.minor!==credit.minor||value.fx!==null&&value.fx!==undefined)throw Error('Unbalanced transfer');}
  else{const fx=object(value.fx);keys(fx,['numerator','denominator','asOf']);text(fx.asOf,10);parseEffectiveDate(fx.asOf);if(minorInteger(fx.numerator)<=0n||minorInteger(fx.denominator)<=0n||convertMoney(debit,credit.currency,{numerator:fx.numerator as string,denominator:fx.denominator as string}).minor!==credit.minor)throw Error('Invalid draft FX');}
  if(value.fee!==undefined&&value.fee!==null){const fee=object(value.fee);keys(fee,['accountId','money','note','categoryId']);text(fee.accountId,256);amount(fee.money);if(fee.note!==undefined)text(fee.note,100000,false);if(fee.categoryId!==undefined&&fee.categoryId!==null)text(fee.categoryId,256);}
 }
 if(value.allocations!==undefined){const rows=allocationRows(value.allocations);if(value.kind==='transfer'){if(rows.length)throw Error('Transfer split not supported');}else{const money=amount(value.money,value.kind==='adjustment');assertAllocationTotal(rows,{kind:value.kind as string},[{deltaMinor:(value.kind==='expense'?-minorInteger(money.minor):minorInteger(money.minor)).toString()}]);}}
 return structuredClone(value) as unknown as RecordDraft;
}
