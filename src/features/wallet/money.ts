import type {CurrencyCode,Money,Minor} from './contracts.js';
import {object,keys} from '../productivity/validation.js';
const min=-(1n<<63n),max=(1n<<63n)-1n;
export function currencyExponent(currency:CurrencyCode):number {
 if(currency==='VND')return 0;if(currency==='USD')return 2;throw new Error('Unsupported currency');
}
export function minorInteger(value:unknown):bigint {
 if(typeof value!=='string'||value.length>20||! /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value))throw new Error('Invalid canonical minor');
 const n=BigInt(value);if(n<min||n>max)throw new Error('Money overflow');return n;
}
export function assertMoney(value:unknown):asserts value is Money {
 const m=object(value);keys(m,['minor','currency']);currencyExponent(m.currency as string);minorInteger(m.minor);
}
function checked(n:bigint,currency:CurrencyCode):Money {const minor=n.toString();minorInteger(minor);currencyExponent(currency);return {minor,currency};}
function separators(locale:string):{group:string;decimal:string} {
 if(!['en-US','vi-VN','zh-CN'].includes(locale))throw new Error('Unsupported money locale');
 const parts=new Intl.NumberFormat(locale,{numberingSystem:'latn'}).formatToParts(1234.5);
 return {group:parts.find(p=>p.type==='group')!.value,decimal:parts.find(p=>p.type==='decimal')!.value};
}
/** Unsigned form amount. Grouping and fractional precision follow the selected locale/currency. */
function parseMagnitude(text:string,currency:CurrencyCode,locale:string):bigint {
 const exponent=currencyExponent(currency),{group,decimal}=separators(locale);
 if(typeof text!=='string'||text.length>128)throw new Error('Invalid amount');
 const parts=text.trim().split(decimal);if(parts.length>2)throw new Error('Invalid decimal amount');
 const integer=parts[0],groups=integer.split(group);
 if(groups.length===1){if(!/^\d+$/.test(integer))throw new Error('Invalid amount');}
 else if(!/^\d{1,3}$/.test(groups[0])||groups.slice(1).some(g=>!/^\d{3}$/.test(g)))throw new Error('Invalid amount grouping');
 const fraction=parts[1]??'';
 if(parts.length===2&&(exponent===0||!/^\d+$/.test(fraction)||fraction.length>exponent))throw new Error('Invalid money precision');
 return BigInt(groups.join(''))*10n**BigInt(exponent)+BigInt(fraction.padEnd(exponent,'0')||'0');
}
export function parseMoney(text:string,currency:CurrencyCode,locale:string):Money {return checked(parseMagnitude(text,currency,locale),currency);}
/** Opening/correction inputs may be negative, including signed64 minimum. */
export function parseSignedMoney(text:string,currency:CurrencyCode,locale:string):Money {
 if(typeof text!=='string'||text.length>128)throw new Error('Invalid amount');
 const raw=text.trim(),negative=raw.startsWith('-'),magnitude=parseMagnitude(negative?raw.slice(1):raw,currency,locale);
 if(negative&&magnitude===0n)throw new Error('Negative zero');
 return checked(negative?-magnitude:magnitude,currency);
}
export function addMoney(a:Money,b:Money):Money {
 assertMoney(a);assertMoney(b);if(a.currency!==b.currency)throw new Error('Currency mismatch');return checked(minorInteger(a.minor)+minorInteger(b.minor),a.currency);
}
/** Rate is target MAJOR units/source MAJOR unit; half-up ties round away from zero once. */
export function convertMoney(m:Money,target:CurrencyCode,rate:{numerator:Minor;denominator:Minor}):Money {
 assertMoney(m);const sourceScale=currencyExponent(m.currency),targetScale=currencyExponent(target);
 const numerator=minorInteger(rate.numerator),denominator=minorInteger(rate.denominator);if(numerator<=0n||denominator<=0n)throw new Error('Invalid positive FX ratio');
 const n=minorInteger(m.minor)*numerator*10n**BigInt(targetScale),d=denominator*10n**BigInt(sourceScale),absolute=n<0n?-n:n;
 const rounded=absolute/d+(absolute%d*2n>=d?1n:0n);return checked(n<0n?-rounded:rounded,target);
}
export function formatMoney(m:Money,locale:string):string {
 assertMoney(m);separators(locale);const exponent=currencyExponent(m.currency),amount=minorInteger(m.minor),scale=10n**BigInt(exponent),whole=amount/scale;
 const fraction=((amount<0n?-amount:amount)%scale).toString().padStart(exponent,'0');
 // -0 is used only to preserve the sign when whole units are zero; money stays bigint.
 const parts=new Intl.NumberFormat(locale,{style:'currency',currency:m.currency,numberingSystem:'latn',minimumFractionDigits:exponent,maximumFractionDigits:exponent}).formatToParts(amount<0n&&whole===0n?-0:whole);
 return parts.map(p=>p.type==='fraction'?fraction:p.value).join('');
}
