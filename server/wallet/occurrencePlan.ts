import type {Period} from '../../src/features/wallet/contracts.js';
import {assertPeriod} from '../../src/features/wallet/dates.js';
import {calendarDate} from '../../src/features/productivity/dates.js';
import {object,keys,integer,boolean} from '../../src/features/productivity/validation.js';
import {normalizeScheduleRecurrence,type ScheduleRecurrence} from '../../src/features/wallet/scheduleContracts.js';
import {planRecurrenceCalendar} from '../productivity/recurrenceCalendar.js';

export interface OccurrenceDraft {ordinal:number;dueDate:string;timezone:string}
export interface ScheduledSeries {recurrence:ScheduleRecurrence;paused:boolean}
export interface OccurrenceBatch {items:OccurrenceDraft[];limited:boolean;nextOrdinal:number|null}
function firstOrdinal(r:ScheduleRecurrence,from:string):number {
 const [ay,am]=r.anchorDate.split('-').map(Number),[fy,fm]=from.split('-').map(Number);
 const distance=r.frequency==='weekly'?(calendarDate(from)-calendarDate(r.anchorDate))/(86400000*7):r.frequency==='monthly'?(fy-ay)*12+fm-am:fy-ay;
 return Math.max(0,Math.floor(distance/r.interval)-1);
}
/** Earliest possible day of a slot, used to stop before asking the shared
 * planner for an out-of-range year. It never invents a clamped occurrence. */
function slotLowerBound(r:ScheduleRecurrence,ordinal:number):string|null {
 if(!ordinal)return r.anchorDate;
 if(r.frequency==='weekly'){
  const date=new Date(calendarDate(r.anchorDate)+ordinal*r.interval*7*86400000);
  if(!Number.isFinite(date.getTime())||date.getUTCFullYear()>9999)return null;
  return date.toISOString().slice(0,10);
 }
 const [year,month]=r.anchorDate.split('-').map(Number),serial=year*12+month-1+ordinal*r.interval*(r.frequency==='yearly'?12:1),targetYear=Math.floor(serial/12);
 if(targetYear>9999)return null;
 return String(targetYear).padStart(4,'0')+'-'+String(serial%12+1).padStart(2,'0')+'-01';
}
/** Pure bounded catch-up. Ordinals always use the original anchor; a short
 * month never changes the following month's requested day. No DB/job is opened. */
export function planOccurrenceBatch(raw:ScheduledSeries,period:Period,options:{limit?:number;startOrdinal?:number}={}):OccurrenceBatch {
 const s=object(raw),recurrence=normalizeScheduleRecurrence(s.recurrence);boolean(s.paused);assertPeriod(period);
 if(period.timezone!==recurrence.timezone)throw Error('Schedule period timezone mismatch');
 keys(object(options),['limit','startOrdinal']);const limit=options.limit===undefined?100:options.limit;integer(limit,1,100);if(options.startOrdinal!==undefined)integer(options.startOrdinal,0,100000);
 const done=(items:OccurrenceDraft[]):OccurrenceBatch=>({items,limited:false,nextOrdinal:null});if(s.paused)return done([]);
 const items:OccurrenceDraft[]=[],start=Math.max(firstOrdinal(recurrence,period.fromDate),options.startOrdinal??0);
 for(let ordinal=start;ordinal<=100000;ordinal++){
  const lower=slotLowerBound(recurrence,ordinal);if(lower===null||lower>=period.toDateExclusive||recurrence.untilDate!==undefined&&lower>recurrence.untilDate)return done(items);
  const planned=ordinal===0?{kind:'date' as const,date:recurrence.anchorDate}:planRecurrenceCalendar({base:'due',anchorDate:recurrence.anchorDate,timezone:recurrence.timezone,frequency:recurrence.frequency,interval:recurrence.interval,ordinal,invalidDate:recurrence.monthEndPolicy});
  if(planned.kind==='skipped')continue;
  if(planned.date>=period.toDateExclusive||recurrence.untilDate!==undefined&&planned.date>recurrence.untilDate)return done(items);
  if(planned.date<period.fromDate)continue;
  if(items.length===limit)return {items,limited:true,nextOrdinal:ordinal};
  items.push({ordinal,dueDate:planned.date,timezone:recurrence.timezone});
 }
 throw Error('Occurrence ordinal limit exceeded');
}
/** Consumers needing long catch-up must use the explicit paginated contract. */
export function generateOccurrences(schedule:ScheduledSeries,period:Period):OccurrenceDraft[]{
 const result=planOccurrenceBatch(schedule,period);if(result.limited)throw Error('Occurrence count limit exceeded; use bounded catch-up');return result.items;
}
