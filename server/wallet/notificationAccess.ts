import type {WalletNotificationAccess} from '../derivedPrivacy.js';
import {walletNotificationSource} from '../../src/features/wallet/notificationContract.js';
import {calendarDate} from '../../src/features/productivity/dates.js';
import {effectiveDateAt} from '../../src/features/wallet/dates.js';
import type {createWalletSchedules} from './schedules.js';
export interface WalletNotificationPolicy {read:WalletNotificationAccess;delivery:WalletNotificationAccess}
/** No global resolver or database is installed on import. Each app supplies its
 * current Wallet owner; missing policies deny this source in legacy projections. */
export function createWalletNotificationAccess(schedules:Pick<ReturnType<typeof createWalletSchedules>,'getOccurrence'|'getSchedule'>,options:{enabled:()=>boolean;now?:()=>number}):WalletNotificationPolicy {
 const policy=(delivery:boolean):WalletNotificationAccess=>(actor,raw,notification)=>{
  try{
   if(!options.enabled()||notification.userId!==actor.userId)return false;
   const source=walletNotificationSource(raw),slot=schedules.getOccurrence(actor,source.id);
   if(!delivery)return true;
   const parent=schedules.getSchedule(actor,slot.scheduleId);
   if(slot.state!=='pending'||parent.paused||parent.archivedAt!==null||!parent.draft.reminderDays.includes(source.offsetDays))return false;
   const target=new Date(calendarDate(slot.dueDate)-source.offsetDays*86400000).toISOString().slice(0,10),today=effectiveDateAt(new Date((options.now??Date.now)()).toISOString(),slot.timezone);
   return target===today;
  }catch{return false;}
 };
 return {read:policy(false),delivery:policy(true)};
}
