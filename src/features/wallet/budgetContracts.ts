import {object,keys,text,choice,integer} from '../productivity/validation.js';
import {timezoneFormatter} from '../productivity/dates.js';
import {assertMoney,minorInteger} from './money.js';
import {normalizeFilter} from './filter.js';
import {assertPeriod,resolvePeriod} from './dates.js';
import type {Money,Period,RecordFilter} from './contracts.js';
export type BudgetFilter=Pick<RecordFilter,'accountIds'|'categoryIds'|'categoryMatch'|'uncategorized'|'labelIds'|'labelMatch'|'unlabeled'>;
export interface WalletBudgetDraft {name:string;limit:Money;filter:BudgetFilter;timezone:string;carryPolicy:'none'|'positive'|'signed';alertThresholds:number[]}
const filterKeys=['accountIds','categoryIds','categoryMatch','uncategorized','labelIds','labelMatch','unlabeled'];
/** A budget always measures nonvoid consumption. Callers cannot turn principal
 * transfers, income, alternate currency or a hidden date range into expenses. */
export function normalizeBudgetDraft(raw:unknown):WalletBudgetDraft {
 const v=object(raw);keys(v,['name','limit','filter','timezone','carryPolicy','alertThresholds']);text(v.name,120);assertMoney(v.limit);if(minorInteger(v.limit.minor)<=0n)throw Error('Positive budget limit required');text(v.timezone,100);timezoneFormatter(v.timezone);
 const selection=v.filter===undefined?{}:object(v.filter);keys(selection,filterKeys);
 const normalized=normalizeFilter({...selection,period:{fromDate:'2000-01-01',toDateExclusive:'2000-02-01',timezone:v.timezone},referenceCurrency:v.limit.currency});
 const filter:BudgetFilter={};for(const key of filterKeys)if(normalized[key]!==undefined)(filter as Record<string,unknown>)[key]=Array.isArray(normalized[key])?[...normalized[key]].sort():normalized[key];
 filter.categoryMatch=filter.categoryMatch??'descendants';filter.labelMatch=filter.labelMatch??'any';
 const carryPolicy=v.carryPolicy===undefined?'none':v.carryPolicy;choice(carryPolicy,['none','positive','signed']);
 const thresholds=v.alertThresholds===undefined?[80,100]:v.alertThresholds;if(!Array.isArray(thresholds)||thresholds.length>8)throw Error('Invalid budget alert policy');for(const threshold of thresholds)integer(threshold,1,100);if(new Set(thresholds).size!==thresholds.length)throw Error('Duplicate budget alert threshold');
 const result:WalletBudgetDraft={name:v.name.trim(),limit:{minor:v.limit.minor,currency:v.limit.currency},filter:Object.fromEntries(Object.entries(filter).sort(([a],[b])=>a<b?-1:a>b?1:0)) as BudgetFilter,timezone:v.timezone,carryPolicy,alertThresholds:[...thresholds].sort((a,b)=>a-b)};if(new TextEncoder().encode(JSON.stringify(result)).length>256*1024)throw Error('Budget definition byte limit');return result;
}
export function normalizeBudgetPeriod(raw:unknown,timezone:string):Period {
 assertPeriod(raw);if(raw.timezone!==timezone)throw Error('Budget period timezone differs');const month=resolvePeriod({kind:'month',anchorDate:raw.fromDate},timezone);if(month.fromDate!==raw.fromDate||month.toDateExclusive!==raw.toDateExclusive)throw Error('A whole calendar budget month is required');return {...raw};
}
export function budgetRecordFilter(budget:WalletBudgetDraft,raw:Period):RecordFilter {
 const draft=normalizeBudgetDraft(budget),period=normalizeBudgetPeriod(raw,draft.timezone);
 return normalizeFilter({...draft.filter,period,referenceCurrency:draft.limit.currency,kinds:['expense'],statuses:['uncleared','cleared','reconciled'],transferMode:'exclude'});
}

export function budgetPolicyValue(draft:WalletBudgetDraft){const {name:_name,...fields}=normalizeBudgetDraft(draft);return fields;}
