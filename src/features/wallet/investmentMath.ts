import {assertMoney,minorInteger,currencyExponent} from './money.js';
import {parseEffectiveDate} from './dates.js';
import {object,keys,text,integer,choice} from '../productivity/validation.js';
import type {Money} from './contracts.js';
const scale=100000000n;
/** Quantities have eight decimal places at most; there is no floating-point
 * conversion. Internal scaled units are bounded before multiplication. */
export function quantityUnits(value:string):bigint {
 if(typeof value!=='string'||value.length>30||! /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value))throw Error('Invalid investment quantity');
 const [whole,fraction='']=value.split('.'),units=minorInteger((BigInt(whole)*scale+BigInt(fraction.padEnd(8,'0'))).toString());
 if(units<=0n)throw Error('Positive quantity required');return units;
}
export function quantityText(units:bigint):string {
 minorInteger(units.toString());if(units<0n)throw Error('Negative holdings');const whole=units/scale,fraction=(units%scale).toString().padStart(8,'0').replace(/0+$/,'');return whole.toString()+(fraction?'.'+fraction:'');
}
export interface InvestmentMathTrade {id:string;kind:'buy'|'sell';quantity:string;price:Money;fee:Money;effectiveDate:string;sequence:number}
export function investmentExecution(trade:Pick<InvestmentMathTrade,'kind'|'quantity'|'price'|'fee'>,currency:string):{gross:Money;cashDelta:Money}{
 currencyExponent(currency);choice(trade.kind,['buy','sell']);assertMoney(trade.price);assertMoney(trade.fee);if(trade.price.currency!==currency||trade.fee.currency!==currency||minorInteger(trade.price.minor)<=0n||minorInteger(trade.fee.minor)<0n)throw Error('Invalid execution money');const gross=minorInteger(rounded(minorInteger(trade.price.minor)*quantityUnits(trade.quantity),scale).toString()),fee=minorInteger(trade.fee.minor);if(gross<=0n)throw Error('Trade is below the currency minor unit');return {gross:amount(gross,currency),cashDelta:amount(trade.kind==='buy'?-minorInteger((gross+fee).toString()):gross-fee,currency)};
}
export interface InvestmentMathResult {id:string;gross:Money;cashDelta:Money;costAllocated:Money;realized:Money;remainingQuantity:string;remainingCost:Money}
export interface InvestmentPosition {currency:string;quantity:string;cost:Money;realized:Money;trades:InvestmentMathResult[]}
const amount=(n:bigint,currency:string):Money=>({minor:minorInteger(n.toString()).toString(),currency});
const rounded=(numerator:bigint,denominator:bigint)=>{if(numerator<0n||denominator<=0n)throw Error('Invalid cost ratio');return (numerator+denominator/2n)/denominator;};
/** Average cost is replayed in persisted local-date/sequence order. A historical
 * edit must validate every intermediate position, including later sales. Trade
 * fees belong to acquisition cost or net sale proceeds. Cash deposits are not
 * trades and never enter realized or unrealized profit. */
export function replayInvestmentTrades(raw:readonly InvestmentMathTrade[],currency:string):InvestmentPosition {
 currencyExponent(currency);if(!Array.isArray(raw)||raw.length>100000)throw Error('Investment history limit');const ids=new Set<string>(),sequences=new Set<number>();
 const trades=raw.map(input=>{const v=object(input);keys(v,['id','kind','quantity','price','fee','effectiveDate','sequence']);text(v.id,256);choice(v.kind,['buy','sell']);integer(v.sequence,1);parseEffectiveDate(v.effectiveDate as string);const units=quantityUnits(v.quantity as string);assertMoney(v.price);assertMoney(v.fee);if(v.price.currency!==currency||v.fee.currency!==currency||minorInteger(v.price.minor)<=0n||minorInteger(v.fee.minor)<0n||ids.has(v.id)||sequences.has(v.sequence))throw Error('Invalid investment trade binding');ids.add(v.id);sequences.add(v.sequence);return {...structuredClone(input),units};}).sort((a,b)=>a.effectiveDate<b.effectiveDate?-1:a.effectiveDate>b.effectiveDate?1:a.sequence-b.sequence);
 let held=0n,cost=0n,realized=0n;const results:InvestmentMathResult[]=[];
 for(const trade of trades){const execution=investmentExecution(trade,currency),gross=minorInteger(execution.gross.minor),fee=minorInteger(trade.fee.minor);let delta:bigint,allocated=0n,profit=0n;
  if(trade.kind==='buy'){held=minorInteger((held+trade.units).toString());cost=minorInteger((cost+gross+fee).toString());delta=-(gross+fee);}
  else {if(trade.units>held)throw Error('Sale exceeds holdings');allocated=trade.units===held?cost:rounded(cost*trade.units,held);held-=trade.units;cost-=allocated;delta=gross-fee;profit=minorInteger((delta-allocated).toString());realized=minorInteger((realized+profit).toString());}
  results.push({id:trade.id,gross:amount(gross,currency),cashDelta:amount(delta,currency),costAllocated:amount(allocated,currency),realized:amount(profit,currency),remainingQuantity:quantityText(held),remainingCost:amount(cost,currency)});
 }
 return {currency,quantity:quantityText(held),cost:amount(cost,currency),realized:amount(realized,currency),trades:results};
}
export function valueInvestmentPosition(position:Pick<InvestmentPosition,'quantity'|'cost'|'currency'>,quote:Money|null):{marketValue:Money|null;unrealized:Money|null}{
 currencyExponent(position.currency);assertMoney(position.cost);if(position.cost.currency!==position.currency||minorInteger(position.cost.minor)<0n)throw Error('Invalid position cost');const units=position.quantity==='0'?0n:quantityUnits(position.quantity);if(units===0n){if(position.cost.minor!=='0')throw Error('Nonzero empty-position cost');return {marketValue:amount(0n,position.currency),unrealized:amount(0n,position.currency)};}
 if(quote===null)return {marketValue:null,unrealized:null};assertMoney(quote);if(quote.currency!==position.currency||minorInteger(quote.minor)<=0n)throw Error('Invalid investment quote');const value=rounded(units*minorInteger(quote.minor),scale);return {marketValue:amount(value,position.currency),unrealized:amount(value-minorInteger(position.cost.minor),position.currency)};
}
