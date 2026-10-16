import {object,keys,choice} from '../../src/features/productivity/validation.js';
import {utcInstant,localDateAt,parseLegacyDue,timezoneFormatter,localDayStart} from '../../src/features/productivity/dates.js';
import {planRecurrenceCalendar,type CalendarRecurrenceInput,type CalendarOccurrence} from './recurrenceCalendar.js';
export type TimedRecurrenceInput=Omit<CalendarRecurrenceInput,'anchorDate'>&{anchorInstantUtc:string};
export type TimedOccurrence=Exclude<CalendarOccurrence,{kind:'date'}>|{kind:'timed';instantUtc:string;timezone:string}|{kind:'time-resolution-required';date:string;wallTime:string;timezone:string;reason:'explicit-instant-required'};
/** Pure wall-clock planning. A gap or fold requires explicit resolution; never
 * guess an offset, persist an occurrence, or grant completion authority. */
export function planTimedRecurrence(input:TimedRecurrenceInput):TimedOccurrence {
 keys(object(input),['base','anchorInstantUtc','acceptedCompletedAt','timezone','frequency','interval','ordinal','invalidDate']);choice(input.base,['due','completion']);
 const anchor=utcInstant(input.anchorInstantUtc);timezoneFormatter(input.timezone);
 if(input.acceptedCompletedAt!==undefined)utcInstant(input.acceptedCompletedAt);if(input.base==='completion'&&input.acceptedCompletedAt===undefined)throw Error('Accepted completion instant required');
 const base=input.base==='completion'?utcInstant(input.acceptedCompletedAt!):anchor;
 const slot=planRecurrenceCalendar({base:'due',anchorDate:localDateAt(base,input.timezone),timezone:input.timezone,frequency:input.frequency,interval:input.interval,ordinal:input.ordinal,invalidDate:input.invalidDate});if(slot.kind==='skipped')return slot;
 return resolveTimedRecurrenceDate({anchorInstantUtc:new Date(base).toISOString(),date:slot.date,timezone:input.timezone});
}
/** Resolve the original wall time on an explicit local successor date. A gap or
 * fold remains unresolved; callers must never guess an offset. */
export function resolveTimedRecurrenceDate(input:{anchorInstantUtc:string;date:string;timezone:string}):Extract<TimedOccurrence,{kind:'timed'|'time-resolution-required'}>{
 keys(object(input),['anchorInstantUtc','date','timezone']);const base=utcInstant(input.anchorInstantUtc);localDayStart(input.date,input.timezone);
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:input.timezone,calendar:'gregory',numberingSystem:'latn',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(base)),part=(name:string)=>parts.find(p=>p.type===name)!.value;
 const wallTime=part('hour')+':'+part('minute')+':'+part('second')+'.'+String(new Date(base).getUTCMilliseconds()).padStart(3,'0'),resolved=parseLegacyDue(input.date+' '+wallTime,input.timezone);
 if(resolved.due.kind!=='timed')return {kind:'time-resolution-required',date:input.date,wallTime,timezone:input.timezone,reason:'explicit-instant-required'};
 return {kind:'timed',instantUtc:resolved.due.instantUtc,timezone:input.timezone};
}
