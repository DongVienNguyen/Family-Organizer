import {object,keys,text,integer,choice} from '../productivity/validation.js';
export interface WalletOccurrenceNotificationSource {domain:'wallet-occurrence';id:string;offsetDays:number}
export function walletNotificationSource(raw:unknown):WalletOccurrenceNotificationSource {
 const value=object(raw);keys(value,['domain','id','offsetDays']);choice(value.domain,['wallet-occurrence']);text(value.id,256);integer(value.offsetDays,0,366);return {domain:value.domain,id:value.id,offsetDays:value.offsetDays};
}
