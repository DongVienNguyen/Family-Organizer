import {object,keys,boolean,choice,integer} from './validation.js';
import {assertTimezone,calendarDate,localDateAt,utcInstant} from './dates.js';
import {calendarLocalTime} from './calendarLocalTime.js';
export interface TaskNotificationPreferences {enabled:boolean;timezone:string;quiet:{startMinute:number;endMinute:number}|null;mode:'immediate'|'daily';digestMinute:number}
export const defaultTaskNotificationPreferences:Readonly<TaskNotificationPreferences>=Object.freeze({enabled:true,timezone:'Asia/Saigon',quiet:null,mode:'immediate',digestMinute:480});
export function normalizeTaskNotificationPreferences(raw:unknown):TaskNotificationPreferences {
 const value=object(raw);keys(value,['enabled','timezone','quiet','mode','digestMinute']);boolean(value.enabled);assertTimezone(value.timezone as string);choice(value.mode,['immediate','daily']);integer(value.digestMinute,0,1439);
 let quiet:TaskNotificationPreferences['quiet']=null;
 if(value.quiet!==null){const q=object(value.quiet);keys(q,['startMinute','endMinute']);integer(q.startMinute,0,1439);integer(q.endMinute,0,1439);if(q.startMinute===q.endMinute)throw Error('Quiet hours cannot cover every minute; disable delivery explicitly');quiet={startMinute:q.startMinute,endMinute:q.endMinute};}
 return {enabled:value.enabled,timezone:value.timezone as string,quiet,mode:value.mode,digestMinute:value.digestMinute};
}
/** Earliest planned delivery at/after the source eligibility instant. Dispatch
 * must keep this source instant rather than repeatedly selecting tomorrow from
 * its current clock. Durable daily claims own dedupe, not this pure policy. */
export function nextTaskDelivery(earliestUtc:string,raw:TaskNotificationPreferences):string|null {
 const preferences=normalizeTaskNotificationPreferences(raw),earliest=utcInstant(earliestUtc);if(!preferences.enabled)return null;
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:preferences.timezone,calendar:'gregory',numberingSystem:'latn',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}),wall=(stamp:number)=>{const parts=formatter.formatToParts(new Date(stamp)),p=(name:string)=>parts.find(row=>row.type===name)!.value;return {date:p('year')+'-'+p('month')+'-'+p('day'),minute:Number(p('hour'))*60+Number(p('minute'))};};
 const quiet=(stamp:number)=>{const q=preferences.quiet;if(!q)return false;const minute=wall(stamp).minute;return q.startMinute<q.endMinute?minute>=q.startMinute&&minute<q.endMinute:minute>=q.startMinute||minute<q.endMinute;};
 let planned=earliest;
 if(preferences.mode==='daily'){
  const today=localDateAt(earliest,preferences.timezone),base=calendarDate(today);let selected:number|undefined;
  for(let day=0;day<4&&selected===undefined;day++){
   const date=new Date(base+day*86400000).toISOString().slice(0,10),minute=preferences.digestMinute,local=date+'T'+String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),slot=calendarLocalTime(local,preferences.timezone),options=slot.options.map(utcInstant);
   if(slot.kind==='gap'){
    // A missing wall minute advances to this day's first real wall minute after
    // it. A wholly skipped date contributes no candidate. Never host Date.parse.
    const anchor=calendarDate(date)+minute*60000;
    for(let stamp=anchor-36*3600000;stamp<=anchor+36*3600000;stamp+=60000){const current=wall(stamp);if(current.date===date&&current.minute>=minute){options.push(stamp);break;}}
   }
   selected=options.find(stamp=>stamp>=earliest);
  }
  if(selected===undefined)throw Error('No real digest slot in bounded policy horizon');planned=selected;
 }
 if(quiet(planned)){
  let candidate=Math.floor(planned/60000)*60000+60000,found=false;
  for(let minute=0;minute<72*60;minute++,candidate+=60000)if(!quiet(candidate)){planned=candidate;found=true;break;}
  if(!found)throw Error('No quiet-hours release in bounded policy horizon');
 }
 return new Date(planned).toISOString();
}
