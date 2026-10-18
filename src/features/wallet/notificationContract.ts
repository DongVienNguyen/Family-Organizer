import {object,keys,text,integer,choice} from '../productivity/validation.js';
export interface WalletOccurrenceNotificationSource {domain:'wallet-occurrence';id:string;offsetDays:number}
export function walletNotificationSource(raw:unknown):WalletOccurrenceNotificationSource {
 const value=object(raw);keys(value,['domain','id','offsetDays']);choice(value.domain,['wallet-occurrence']);text(value.id,256);integer(value.offsetDays,0,366);return {domain:value.domain,id:value.id,offsetDays:value.offsetDays};
}
export interface WalletBudgetNotificationSource {domain:'wallet-budget';id:string}
export type WalletNotificationSource=WalletOccurrenceNotificationSource|WalletBudgetNotificationSource;
export function walletBudgetNotificationSource(raw:unknown):WalletBudgetNotificationSource {const value=object(raw);keys(value,['domain','id']);choice(value.domain,['wallet-budget']);text(value.id,256);return {domain:value.domain,id:value.id};}
export function walletDerivedNotificationSource(raw:unknown):WalletNotificationSource {const value=object(raw);return value.domain==='wallet-budget'?walletBudgetNotificationSource(value):walletNotificationSource(value);}
