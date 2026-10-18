import {object,keys,text,choice} from '../productivity/validation.js';
import {assertMoney,minorInteger,currencyExponent} from './money.js';
import type {Money} from './contracts.js';

export interface NetWorthInput {
 accounts:{id:string;book:Money;positions:{instrumentId:string;currency:string;marketValue:Money|null}[]}[];
 assets:{id:string;currency:string;value:Money|null}[];
 bindings:{assetId:string;accountId:string;instrumentId:string}[];
 debts:{id:string;direction:'lent'|'borrowed';money:Money}[];
}
export interface NetWorthCurrency {
 currency:string;cash:Money;investments:Money;assets:Money;receivables:Money;liabilities:Money;coveredTotal:Money;total:Money|null;
}
/** Pure composition of CURRENTLY AUTHORIZED facts. This function grants no
 * access, fetches no quote and never converts money through Number or FX. */
export function calculateNetWorth(raw:NetWorthInput):{complete:boolean;currencies:NetWorthCurrency[];excludedAssetIds:string[];missing:{kind:'position'|'asset';id:string;currency:string}[]}{
 const input=object(raw);keys(input,['accounts','assets','bindings','debts']);
 for(const field of['accounts','assets','bindings','debts'])if(!Array.isArray(input[field])||input[field].length>100000)throw Error('Net worth input exceeds budget');
 const groups=new Map<string,{cash:bigint;investments:bigint;assets:bigint;receivables:bigint;liabilities:bigint;complete:boolean}>(),accountIds=new Set<string>(),assets=new Map<string,{currency:string;value:Money|null}>(),positions=new Map<string,{currency:string;marketValue:Money|null}>(),boundAssets=new Set<string>(),boundPositions=new Set<string>(),debtIds=new Set<string>(),missing:{kind:'position'|'asset';id:string;currency:string}[]=[];
 const group=(currency:string)=>{currencyExponent(currency);let value=groups.get(currency);if(!value){value={cash:0n,investments:0n,assets:0n,receivables:0n,liabilities:0n,complete:true};groups.set(currency,value);}return value;};
 const exact=(value:unknown,currency?:string,nonnegative=false)=>{assertMoney(value);const amount=minorInteger(value.minor);if(currency!==undefined&&value.currency!==currency||nonnegative&&amount<0n)throw Error('Net worth currency/sign mismatch');return amount;};
 for(const raw of input.accounts as unknown[]){const account=object(raw);keys(account,['id','book','positions']);text(account.id,256);if(accountIds.has(account.id))throw Error('Duplicate net worth account');accountIds.add(account.id);const cash=exact(account.book),currency=(account.book as Money).currency;group(currency).cash+=cash;if(!Array.isArray(account.positions)||account.positions.length>10000)throw Error('Position budget exceeded');for(const raw of account.positions){const position=object(raw);keys(position,['instrumentId','currency','marketValue']);text(position.instrumentId,256);if(position.currency!==currency)throw Error('Portfolio currency mismatch');const id=JSON.stringify([account.id,position.instrumentId]);if(positions.has(id))throw Error('Duplicate net worth position');if(position.marketValue!==null)group(currency).investments+=exact(position.marketValue,currency,true);else{group(currency).complete=false;missing.push({kind:'position',id,currency});}positions.set(id,{currency,marketValue:position.marketValue as Money|null});}}
 for(const raw of input.assets as unknown[]){const asset=object(raw);keys(asset,['id','currency','value']);text(asset.id,256);if(assets.has(asset.id))throw Error('Duplicate net worth Asset');currencyExponent(asset.currency as string);if(asset.value!==null)exact(asset.value,asset.currency as string,true);assets.set(asset.id,{currency:asset.currency as string,value:asset.value as Money|null});}
 for(const raw of input.bindings as unknown[]){const binding=object(raw);keys(binding,['assetId','accountId','instrumentId']);for(const field of['assetId','accountId','instrumentId'])text(binding[field],256);const key=JSON.stringify([binding.accountId,binding.instrumentId]),asset=assets.get(binding.assetId as string),position=positions.get(key);if(!asset||!position||asset.currency!==position.currency)throw Error('Binding has no authorized matching sources');if(boundAssets.has(binding.assetId as string)||boundPositions.has(key))throw Error('Duplicate economic representation');boundAssets.add(binding.assetId as string);boundPositions.add(key);}
 for(const[id,asset]of assets){if(boundAssets.has(id))continue;if(asset.value!==null)group(asset.currency).assets+=exact(asset.value,asset.currency,true);else{group(asset.currency).complete=false;missing.push({kind:'asset',id,currency:asset.currency});}}
 for(const raw of input.debts as unknown[]){const debt=object(raw);keys(debt,['id','direction','money']);text(debt.id,256);choice(debt.direction,['lent','borrowed']);if(debtIds.has(debt.id))throw Error('Duplicate net worth debt');debtIds.add(debt.id);const amount=exact(debt.money,undefined,true),value=group((debt.money as Money).currency);if(debt.direction==='lent')value.receivables+=amount;else value.liabilities+=amount;}
 const currencies=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>{const money=(value:bigint):Money=>({minor:minorInteger(value.toString()).toString(),currency}),covered=row.cash+row.investments+row.assets+row.receivables-row.liabilities;return {currency,cash:money(row.cash),investments:money(row.investments),assets:money(row.assets),receivables:money(row.receivables),liabilities:money(row.liabilities),coveredTotal:money(covered),total:row.complete?money(covered):null};});
 return {complete:[...groups.values()].every(row=>row.complete),currencies,excludedAssetIds:[...boundAssets].sort(),missing};
}
