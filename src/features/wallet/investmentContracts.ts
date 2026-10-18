import {object,keys,text,integer,choice} from '../productivity/validation.js';
import {timezoneFormatter} from '../productivity/dates.js';
import {parseEffectiveDate} from './dates.js';
import {assertMoney,minorInteger,currencyExponent} from './money.js';
import type {Money} from './contracts.js';
export interface InstrumentDraft {exchange:string;ticker:string;name:string;kind:'stock'|'etf';currency:string;timezone:string}
export interface InstrumentHeader extends InstrumentDraft {id:string;revision:number;archivedAt:string|null;createdAt:string;updatedAt:string}
export interface InvestmentDraft {accountId:string;instrumentId:string;kind:'buy'|'sell';quantity:string;price:Money;fee:Money;date:string;timezone:string;note:string;accountRevision:number;portfolioRevision:number}
export function normalizeInstrumentDraft(raw:unknown):InstrumentDraft {
 const v=object(raw);keys(v,['exchange','ticker','name','kind','currency','timezone']);text(v.exchange,16);text(v.ticker,32);text(v.name,256);choice(v.kind,['stock','etf']);text(v.currency,3);currencyExponent(v.currency);text(v.timezone,100);timezoneFormatter(v.timezone);const exchange=v.exchange.trim().toUpperCase(),ticker=v.ticker.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9._-]{0,15}$/.test(exchange)||! /^[A-Z0-9][A-Z0-9._/-]{0,31}$/.test(ticker))throw Error('Invalid exchange/ticker');return {exchange,ticker,name:v.name.trim(),kind:v.kind,currency:v.currency,timezone:v.timezone};
}
/** Quantity is a positive decimal with at most eight fractional places.
 * Canonical decimal strings and integer units use no JavaScript Number money. */
export function normalizeInvestmentQuantity(raw:unknown):string {
 if(typeof raw!=='string'||raw.length>30||! /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(raw))throw Error('Invalid quantity');const [whole,fraction='']=raw.split('.'),units=minorInteger((BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'))).toString());if(units<=0n)throw Error('Positive quantity required');const tail=fraction.replace(/0+$/,'');return whole+(tail?'.'+tail:'');
}
export function normalizeInvestmentDraft(raw:unknown):InvestmentDraft {
 const v=object(raw);keys(v,['accountId','instrumentId','kind','quantity','price','fee','date','timezone','note','accountRevision','portfolioRevision']);text(v.accountId,256);text(v.instrumentId,256);choice(v.kind,['buy','sell']);const quantity=normalizeInvestmentQuantity(v.quantity);assertMoney(v.price);assertMoney(v.fee);if(v.price.currency!==v.fee.currency||minorInteger(v.price.minor)<=0n||minorInteger(v.fee.minor)<0n)throw Error('Invalid trade price/fee');parseEffectiveDate(v.date as string);text(v.timezone,100);timezoneFormatter(v.timezone);const note=v.note===undefined?'':v.note;text(note,20000,false);integer(v.accountRevision,1);integer(v.portfolioRevision,0);return {accountId:v.accountId,instrumentId:v.instrumentId,kind:v.kind,quantity,price:{minor:v.price.minor,currency:v.price.currency},fee:{minor:v.fee.minor,currency:v.fee.currency},date:v.date as string,timezone:v.timezone,note,accountRevision:v.accountRevision,portfolioRevision:v.portfolioRevision};
}
