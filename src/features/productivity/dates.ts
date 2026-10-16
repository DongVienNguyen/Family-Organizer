import type {Due, QueryClock} from './contracts.js';
import {object,keys,text} from './validation.js';
const dayMs=86_400_000;
// Private bounded formatters avoid constructing ICU state at every binary-search
// probe. Keep public timezoneFormatter instances fresh and caller-owned.
const localDateFormatters=new Map<string,Intl.DateTimeFormat>();
function localDateFormatter(timezone:string):Intl.DateTimeFormat {
 const existing=localDateFormatters.get(timezone);if(existing)return existing;
 const formatter=timezoneFormatter(timezone);
 if(localDateFormatters.size>=32){const oldest=localDateFormatters.keys().next().value;if(oldest!==undefined)localDateFormatters.delete(oldest);}
 localDateFormatters.set(timezone,formatter);return formatter;
}
// ICU supplies timezone rules on Node22/24 and browsers; every conversion
// specifies a timezone and Gregorian calendar instead of the host locale.
export function timezoneFormatter(timezone:string):Intl.DateTimeFormat {
 text(timezone,128);
 if(timezone.startsWith('+')||timezone.startsWith('-'))throw new Error('Expected named timezone');
 return new Intl.DateTimeFormat('en-US',{timeZone:timezone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit'});
}
export function localDateAt(instant:number,timezone:string):string {
 const parts=localDateFormatter(timezone).formatToParts(new Date(instant));
 const part=(key:string)=>parts.find(item=>item.type===key)!.value;
 return `${part('year').padStart(4,'0')}-${part('month')}-${part('day')}`;
}
export function calendarDate(raw:string):number {
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw new Error('Expected YYYY-MM-DD');
 const [year,month,day]=raw.split('-').map(Number);
 if(year<1000)throw new Error('Year outside supported range');
 const instant=Date.UTC(year,month-1,day);
 if(new Date(instant).toISOString().slice(0,10)!==raw)throw new Error('Invalid calendar date');
 return instant;
}
export function utcInstant(raw:string):number {
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw))throw new Error('Expected explicit UTC instant');
 const base=calendarDate(raw.slice(0,10));
 const [hour,minute,second]=raw.slice(11,-1).split(':').map(Number);
 if(hour>23||minute>59||second>=60)throw new Error('Invalid instant time');
 return base+hour*3_600_000+minute*60_000+Math.round(second*1000);
}
/** First valid instant of a local date, including a DST gap at midnight.
 * Bounded search avoids assuming that local days are always 24 hours long.
 * A wholly skipped date (e.g. Apia2011-12-30) is an invalid input.
 */
export function localDayStart(date:string,timezone:string):number {
 const base=calendarDate(date);
 localDateFormatter(timezone);
 let low=base-2*dayMs,high=base+2*dayMs;
 while(low<high){const mid=Math.floor((low+high)/2);if(localDateAt(mid,timezone)<date)low=mid+1;else high=mid;}
 if(localDateAt(low,timezone)!==date)throw new Error('Local date does not exist in timezone');
 return low;
}
export function assertDue(value:unknown):asserts value is Due {
 const due=object(value);
 if(due.kind==='none'){keys(due,['kind']);return;}
 if(due.kind==='all_day'){
  keys(due,['kind','date','timezone']);text(due.date,10);text(due.timezone,128);
  localDayStart(due.date,due.timezone);return;
 }
 if(due.kind==='timed'){
  keys(due,['kind','instantUtc','timezone']);text(due.instantUtc,30);text(due.timezone,128);
  utcInstant(due.instantUtc);timezoneFormatter(due.timezone);return;
 }
 throw new Error('Invalid deadline kind');
}
export function resolveDue(due:Due,clock:QueryClock):{overdue:boolean;localDate:string|null} {
 assertDue(due);timezoneFormatter(clock.timezone);const now=utcInstant(clock.nowUtc);
 if(due.kind==='none')return {overdue:false,localDate:null};
 if(due.kind==='timed')return {overdue:now>=utcInstant(due.instantUtc),localDate:localDateAt(utcInstant(due.instantUtc),clock.timezone)};
 return {overdue:localDateAt(now,due.timezone)>due.date,localDate:due.date};
}
export function dueInstant(due:Due):number|null {
 assertDue(due);
 return due.kind==='none'?null:due.kind==='timed'?utcInstant(due.instantUtc):localDayStart(due.date,due.timezone);
}
/** Resolve a local wall timestamp only when ICU finds one unique instant.
 * Sampling both sides collects the zone offsets around a DST transition;
 * round-trip validation rejects nonexistent times and ambiguous folds.
 */
function legacyLocalInstant(raw:string,timezone:string):number {
 const match=raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2}(?:\.\d{1,3})?)?$/);
 if(!match)throw new Error('Unsupported local timestamp');
 const wall=utcInstant(`${match[1]}T${match[2]}${match[3]||':00'}Z`);
 const format=new Intl.DateTimeFormat('en-US',{timeZone:timezone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const wallAt=(instant:number)=>{
  const parts=format.formatToParts(new Date(instant));
  const part=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  return Date.UTC(part('year'),part('month')-1,part('day'),part('hour'),part('minute'),part('second'),new Date(instant).getUTCMilliseconds());
 };
 const offsets=new Set<number>();
 for(let hour=-36;hour<=36;hour++){const sample=wall+hour*3_600_000;offsets.add(wallAt(sample)-sample);}
 const candidates=[...offsets].map(offset=>wall-offset).filter(instant=>wallAt(instant)===wall);
 if(candidates.length!==1)throw new Error('Ambiguous or nonexistent local timestamp');
 return candidates[0];
}
export function parseLegacyDue(raw:string,timezone:string):{due:Due;warnings:string[]} {
 timezoneFormatter(timezone);
 if(raw==='')return {due:{kind:'none'},warnings:[]};
 if(typeof raw!=='string')throw new Error('Expected raw legacy string');
 try {
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
   const due:Due={kind:'all_day',date:raw,timezone};assertDue(due);
   return {due,warnings:[`Legacy date ${JSON.stringify(raw)} assumes timezone ${timezone}`]};
  }
  if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw)){
   const due:Due={kind:'timed',instantUtc:new Date(legacyLocalInstant(raw,timezone)).toISOString(),timezone};assertDue(due);
   return {due,warnings:[`Legacy local timestamp ${JSON.stringify(raw)} assumes timezone ${timezone}`]};
  }
  const offset=raw.match(/([+-])(\d{2}):(\d{2})$/);
  const base=offset?raw.slice(0,-6)+'Z':raw;
  let instant=utcInstant(base);
  if(offset){const hours=Number(offset[2]),minutes=Number(offset[3]);if(hours>14||minutes>59||(hours===14&&minutes!==0))throw new Error('Invalid UTC offset');instant-=(offset[1]==='+'?1:-1)*(hours*60+minutes)*60_000;}
  const due:Due={kind:'timed',instantUtc:new Date(instant).toISOString(),timezone};assertDue(due);
  return {due,warnings:[]};
 } catch {return {due:{kind:'none'},warnings:[`Rejected legacy deadline ${JSON.stringify(raw)}: invalid or ambiguous date/time`]};}
}
