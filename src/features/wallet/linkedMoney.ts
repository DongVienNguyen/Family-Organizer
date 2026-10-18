import {assertMoney,minorInteger} from './money.js';
import {editableAmount} from './accountDraft.js';
import type {Money} from './contracts.js';
/** Original number rows remain readable without silently converting newly
 * linked exact money into floating point. New commands validate legacy inputs. */
export type TrackingAmount=number|Money;
function pair(a:TrackingAmount,b:TrackingAmount){
 const currency=typeof a==='number'?(b as Money).currency:a.currency;
 const minor=(v:TrackingAmount)=>{if(typeof v==='number'){if(!Number.isSafeInteger(v)||currency!=='VND'&&v!==0)throw Error('Legacy amount needs explicit remediation');return BigInt(v);}assertMoney(v);if(v.currency!==currency)throw Error('Tracking currencies differ');return minorInteger(v.minor);};
 return {currency,a:minor(a),b:minor(b)};
}
export function addTrackingAmount(a:TrackingAmount,b:TrackingAmount):TrackingAmount {if(typeof a==='number'&&typeof b==='number')return a+b;const p=pair(a,b);return {currency:p.currency,minor:minorInteger((p.a+p.b).toString()).toString()};}
export function subtractTrackingAmount(a:TrackingAmount,b:TrackingAmount):TrackingAmount {if(typeof a==='number'&&typeof b==='number')return a-b;const p=pair(a,b);return {currency:p.currency,minor:minorInteger((p.a-p.b).toString()).toString()};}
export function compareTrackingAmount(a:TrackingAmount,b:TrackingAmount):number {if(typeof a==='number'&&typeof b==='number')return Math.sign(a-b);const p=pair(a,b);return p.a<p.b?-1:p.a>p.b?1:0;}
export function trackingPercent(amount:TrackingAmount,target:TrackingAmount):number {
 if(typeof amount==='number'&&typeof target==='number')return target<=0?0:Math.max(0,Math.min(100,Math.round(amount/target*100)));
 const p=pair(amount,target);if(p.b<=0n||p.a<=0n)return 0;if(p.a>=p.b)return 100;return Number((p.a*200n+p.b)/(2n*p.b));
}
export function formatTrackingAmount(value:TrackingAmount,locale='vi-VN'):string {return typeof value==='number'?value.toLocaleString(locale):editableAmount(value.minor,value.currency,locale,true);}
export function outsideBookSavings(goals:readonly {contributions:readonly {amount:TrackingAmount;walletLinkId?:string}[]}[]):TrackingAmount {
 let total:TrackingAmount=0;for(const goal of goals)for(const contribution of goal.contributions)if(!contribution.walletLinkId)total=addTrackingAmount(total,contribution.amount);return total;
}
/** A legacy/mixed aggregate may need reconciliation (currency, fraction or
 * signed64 overflow). The UI must show that state, never zero or a rounded sum. */
export function trackingProjection<T>(read:()=>T):T|null {try{return read();}catch{return null;}}
