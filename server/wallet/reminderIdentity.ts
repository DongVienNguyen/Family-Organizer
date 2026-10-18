import {createHash} from 'node:crypto';
import {text,integer} from '../../src/features/productivity/validation.js';
/** Stable identity only, never a read token or a delivery guarantee. */
export function walletReminderId(occurrenceId:string,offsetDays:number,recipientId:string){text(occurrenceId,256);text(recipientId,256);integer(offsetDays,0,366);return 'wallet-reminder-'+createHash('sha256').update(JSON.stringify([occurrenceId,offsetDays,recipientId])).digest('hex');}
