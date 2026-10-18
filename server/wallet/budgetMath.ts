import {assertMoney,minorInteger} from '../../src/features/wallet/money.js';
import type {Money} from '../../src/features/wallet/contracts.js';
export interface BudgetHistorySample {expense:Money;recordCount:number}
export interface BudgetCalculation {limit:Money;carry:Money;actual:Money;unpaidPlanned:Money;actualOther:Money;method:'scheduledOnly'|'historicalAverage';complete:boolean;forecastComplete?:boolean;history:BudgetHistorySample[]}
export interface BudgetAmounts {actual:Money;unpaidPlanned:Money;estimatedOther:Money|null;remaining:Money|null;expectedBalance:Money|null;method:BudgetCalculation['method'];sampleCount:number;status:'complete'|'incomplete'|'insufficient-data';formulaVersion:'wallet-budget-v1'}
/** Inputs come from the shared report engine and authorized frozen schedule
 * projections. This pure arithmetic cannot read data, carry money or alert. */
export function budgetAmounts(input:BudgetCalculation):BudgetAmounts {
 const currency=input.limit.currency,n=(m:Money,nonnegative=true)=>{assertMoney(m);const v=minorInteger(m.minor);if(m.currency!==currency||nonnegative&&v<0n)throw Error('Invalid budget money');return v;},money=(v:bigint):Money=>({minor:minorInteger(v.toString()).toString(),currency});
 const limit=n(input.limit),carry=n(input.carry,false),actual=n(input.actual),planned=n(input.unpaidPlanned),actualOther=n(input.actualOther);
 if(limit<=0n||actualOther>actual||!['scheduledOnly','historicalAverage'].includes(input.method)||typeof input.complete!=='boolean'||input.forecastComplete!==undefined&&typeof input.forecastComplete!=='boolean'||!Array.isArray(input.history)||input.history.length>3)throw Error('Invalid budget calculation');
 const samples=input.history.map(sample=>{if(!Number.isSafeInteger(sample.recordCount)||sample.recordCount<0)throw Error('Invalid history evidence');return {expense:n(sample.expense),records:sample.recordCount};});
 const available=minorInteger((limit+carry).toString()),remaining=input.complete?money(available-actual):null;
 const sampleCount=input.method==='historicalAverage'?samples.length:0;
 let status:BudgetAmounts['status']=input.complete&&input.forecastComplete!==false?'complete':'incomplete',estimatedOther:Money|null=null;
 if(input.complete&&input.forecastComplete!==false){if(input.method==='scheduledOnly')estimatedOther=money(0n);else if(samples.length===3&&samples.some(v=>v.records>0)){const sum=samples.reduce((total,sample)=>total+sample.expense,0n),average=(sum+1n)/3n;estimatedOther=money(average>actualOther?average-actualOther:0n);}else status='insufficient-data';}
 return {actual:{...input.actual},unpaidPlanned:{...input.unpaidPlanned},estimatedOther,remaining,expectedBalance:remaining&&estimatedOther?money(minorInteger(remaining.minor)-planned-minorInteger(estimatedOther.minor)):null,method:input.method,sampleCount,status,formulaVersion:'wallet-budget-v1'};
}
export function budgetCarry(result:Pick<BudgetAmounts,'remaining'>,allowNegative=false):Money {
 if(!result.remaining)throw Error('Incomplete budget cannot be carried');assertMoney(result.remaining);return {...result.remaining,minor:!allowNegative&&minorInteger(result.remaining.minor)<0n?'0':result.remaining.minor};
}
