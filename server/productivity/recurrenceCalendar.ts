import {object,keys,choice,integer,text} from '../../src/features/productivity/validation.js';
import {calendarDate,localDateAt,localDayStart,utcInstant,timezoneFormatter} from '../../src/features/productivity/dates.js';
export type CalendarRecurrenceInput={base:'due'|'completion';anchorDate:string;acceptedCompletedAt?:string;timezone:string;frequency:'daily'|'weekly'|'monthly'|'yearly';interval:number;ordinal:number;invalidDate:'clamp'|'skip'};
export type CalendarOccurrence={kind:'date';date:string}|{kind:'skipped';year:number;month:number;requestedDay:number};
/** Pure calendar slot planning only. Ordinal always refers to the original
 * anchor, never a previously clamped date. It creates no Task or reward and
 * confers no accepted-completion/series authority on its caller. */
export function planRecurrenceCalendar(input:CalendarRecurrenceInput):CalendarOccurrence {
 const value=object(input);keys(value,['base','anchorDate','acceptedCompletedAt','timezone','frequency','interval','ordinal','invalidDate']);
 choice(input.base,['due','completion']);choice(input.frequency,['daily','weekly','monthly','yearly']);choice(input.invalidDate,['clamp','skip']);integer(input.interval,1,366);integer(input.ordinal,1,100000);text(input.anchorDate,10);calendarDate(input.anchorDate);timezoneFormatter(input.timezone);localDayStart(input.anchorDate,input.timezone);
 if(input.acceptedCompletedAt!==undefined)utcInstant(input.acceptedCompletedAt);
 if(input.base==='completion'&&input.acceptedCompletedAt===undefined)throw Error('Accepted completion instant required');
 const anchor=input.base==='completion'?localDateAt(utcInstant(input.acceptedCompletedAt!),input.timezone):input.anchorDate,[year,month,day]=anchor.split('-').map(Number),steps=input.interval*input.ordinal;
 let targetYear=year,targetMonth=month,targetDay=day;
 if(input.frequency==='daily'||input.frequency==='weekly'){
  const date=new Date(calendarDate(anchor)+steps*(input.frequency==='weekly'?7:1)*86400000);if(!Number.isFinite(date.getTime()))throw Error('Occurrence outside supported range');const result=date.toISOString().slice(0,10);calendarDate(result);localDayStart(result,input.timezone);return {kind:'date',date:result};
 }
 if(input.frequency==='monthly'){const serial=year*12+month-1+steps;targetYear=Math.floor(serial/12);targetMonth=serial%12+1;}else targetYear+=steps;
 if(targetYear<1000||targetYear>9999)throw Error('Occurrence year outside supported range');
 const lastDay=new Date(Date.UTC(targetYear,targetMonth,0)).getUTCDate();
 if(targetDay>lastDay){if(input.invalidDate==='skip')return {kind:'skipped',year:targetYear,month:targetMonth,requestedDay:targetDay};targetDay=lastDay;}
 const date=String(targetYear).padStart(4,'0')+'-'+String(targetMonth).padStart(2,'0')+'-'+String(targetDay).padStart(2,'0');localDayStart(date,input.timezone);return {kind:'date',date};
}
/** Explicit-date series use a canonical immutable list; no occurrences persist. */
export function normalizeRecurrenceDates(dates:readonly string[],timezone:string):string[]{
 if(!Array.isArray(dates)||dates.length<1||dates.length>366)throw Error('Explicit date count outside supported range');timezoneFormatter(timezone);
 for(const date of dates){text(date,10);localDayStart(date,timezone);}
 return [...new Set(dates)].sort();
}
