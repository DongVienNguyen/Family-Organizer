import {object,keys,text,integer,choice,boolean} from '../productivity/validation.js';
import {calendarDate,localDayStart,timezoneFormatter} from '../productivity/dates.js';
import {recordDraftValue} from './recordDraftValue.js';
import type {RecordDraft} from '../../../server/wallet/records.js';

export interface ScheduleRecurrence {
 anchorDate:string;
 timezone:string;
 frequency:'weekly'|'monthly'|'yearly';
 interval:number;
 monthEndPolicy:'clamp'|'skip';
 untilDate?:string;
}
export interface ScheduleDraft {
 name:string;
 record:RecordDraft;
 recurrence:ScheduleRecurrence;
 mode:'manual'|'automatic';
 reminderDays:number[];
 paused:boolean;
}
/** Calendar configuration only. It cannot confer write, payment or job authority. */
export function normalizeScheduleRecurrence(raw:unknown):ScheduleRecurrence {
 const v=object(raw);keys(v,['anchorDate','timezone','frequency','interval','monthEndPolicy','untilDate']);
 text(v.anchorDate,10);calendarDate(v.anchorDate);text(v.timezone,100);timezoneFormatter(v.timezone);localDayStart(v.anchorDate,v.timezone);
 choice(v.frequency,['weekly','monthly','yearly']);integer(v.interval,1,366);choice(v.monthEndPolicy,['clamp','skip']);
 const result:ScheduleRecurrence={anchorDate:v.anchorDate,timezone:v.timezone,frequency:v.frequency,interval:v.interval,monthEndPolicy:v.monthEndPolicy};
 if('untilDate'in v){text(v.untilDate,10);calendarDate(v.untilDate);localDayStart(v.untilDate,v.timezone);if(v.untilDate<v.anchorDate)throw Error('Schedule end precedes anchor');result.untilDate=v.untilDate;}
 return result;
}
export function normalizeScheduleDraft(raw:unknown):ScheduleDraft {
 const v=object(raw);keys(v,['name','record','recurrence','mode','reminderDays','paused']);text(v.name,500);
 const recurrence=normalizeScheduleRecurrence(v.recurrence),record=recordDraftValue(v.record),mode=v.mode===undefined?'manual':v.mode,paused=v.paused===undefined?false:v.paused;
 choice(mode,['manual','automatic']);boolean(paused);
 if(!['income','expense','transfer'].includes(record.kind)||record.effectiveDate!==recurrence.anchorDate||record.timezone!==recurrence.timezone||record.occurredAt!==null||record.reviewedAt!==null||record.settlementStatus==='reconciled')throw Error('Invalid scheduled record draft');
 const reminderDays=v.reminderDays===undefined?[3,0]:v.reminderDays;if(!Array.isArray(reminderDays)||reminderDays.length>16||new Set(reminderDays).size!==reminderDays.length)throw Error('Invalid schedule reminders');for(const day of reminderDays)integer(day,0,366);
 return {name:v.name.trim(),record,recurrence,mode,paused,reminderDays:[...reminderDays].sort((a,b)=>b-a)};
}
