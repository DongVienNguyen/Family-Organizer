import {calendarDate,assertTimezone} from './dates.js';
/** Enumerate real instants for an explicit wall minute. Zero means a DST gap;
 * two means a fold, requiring the user's choice. Never parse in the host zone. */
export function calendarLocalTime(raw:string,timezone:string):{kind:'unique'|'choice'|'gap';options:string[]}{
 assertTimezone(timezone);if(!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(raw))throw Error('Expected local date and24-hour minute');const date=raw.slice(0,10),hour=Number(raw.slice(11,13)),minute=Number(raw.slice(14,16));if(hour>23||minute>59)throw Error('Invalid wall time');const base=calendarDate(date)+hour*3600000+minute*60000,formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,calendar:'gregory',numberingSystem:'latn',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}),wall=(stamp:number)=>{const parts=formatter.formatToParts(new Date(stamp)),p=(name:string)=>parts.find(row=>row.type===name)!.value;return {date:p('year')+'-'+p('month')+'-'+p('day'),hour:Number(p('hour')),minute:Number(p('minute'))};},offsets=new Set<number>();
 for(let hours=-36;hours<=36;hours+=6){const stamp=base+hours*3600000,local=wall(stamp);offsets.add(calendarDate(local.date)+local.hour*3600000+local.minute*60000-stamp);}
 const options=[...offsets].map(offset=>base-offset).filter(stamp=>{const value=wall(stamp);return value.date===date&&value.hour===hour&&value.minute===minute;}).sort((a,b)=>a-b).map(stamp=>new Date(stamp).toISOString());return {kind:options.length===0?'gap':options.length===1?'unique':'choice',options};
}
