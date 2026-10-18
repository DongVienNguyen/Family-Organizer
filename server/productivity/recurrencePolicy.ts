import {object,keys,text,choice,integer} from '../../src/features/productivity/validation.js';
import {timezoneFormatter,localDayStart} from '../../src/features/productivity/dates.js';
import {normalizeRecurrenceDates} from './recurrenceCalendar.js';
export interface RecurrencePolicy {timezone:string;base:'due'|'completion';cadence:{kind:'calendar';frequency:'daily'|'weekly'|'monthly'|'yearly';interval:number;invalidDate:'clamp'|'skip'}|{kind:'dates';dates:string[]};end:{kind:'never'}|{kind:'date';date:string}|{kind:'count';count:number};missed:'skip'|'latest'|'catch_up';rotationMembers:string[]}
function members(value:unknown):string[]{if(!Array.isArray(value)||value.length>256)throw Error('Invalid recurrence rotation members');for(const id of value)text(id,256);if(new Set(value).size!==value.length)throw Error('Duplicate recurrence rotation member');return [...value];}
/** Data contract only: no Task/series persistence, accepted-completion authority,
 * materialization, reward policy or default activation is established here. */
export function normalizeRecurrencePolicy(value:unknown):RecurrencePolicy {
 const input=object(value);keys(input,['timezone','base','cadence','end','missed','rotationMembers']);text(input.timezone,128);timezoneFormatter(input.timezone);choice(input.base,['due','completion']);choice(input.missed,['skip','latest','catch_up']);
 const c=object(input.cadence);let cadence:RecurrencePolicy['cadence'];
 if(c.kind==='calendar'){keys(c,['kind','frequency','interval','invalidDate']);choice(c.frequency,['daily','weekly','monthly','yearly']);integer(c.interval,1,366);choice(c.invalidDate,['clamp','skip']);cadence={kind:'calendar',frequency:c.frequency,interval:c.interval,invalidDate:c.invalidDate};}
 else{keys(c,['kind','dates']);choice(c.kind,['dates']);if(input.base!=='due')throw Error('Explicit dates cannot be completion based');cadence={kind:'dates',dates:normalizeRecurrenceDates(c.dates as string[],input.timezone)};}
 const e=object(input.end);let end:RecurrencePolicy['end'];
 if(e.kind==='never'){keys(e,['kind']);end={kind:'never'};}
 else if(e.kind==='date'){keys(e,['kind','date']);text(e.date,10);localDayStart(e.date,input.timezone);end={kind:'date',date:e.date};}
 else{keys(e,['kind','count']);choice(e.kind,['count']);integer(e.count,1,100000);end={kind:'count',count:e.count};}
 return {timezone:input.timezone,base:input.base,cadence,end,missed:input.missed,rotationMembers:members(input.rotationMembers)};
}
/** Only a new durable accepted-occurrence claim may advance the cursor; this
 * pure helper does not deduplicate claims or establish authority. Skips, pending
 * approval, rejection and reopen never advance or rewind accepted rotation. */
export function transitionRotation(input:{members:readonly string[];cursor:number;transition:'accepted'|'pending'|'skipped'|'rejected'|'reopened'}):{cursor:number;assigneeId:string|null}{
 keys(object(input),['members','cursor','transition']);const ids=members(input.members);integer(input.cursor);choice(input.transition,['accepted','pending','skipped','rejected','reopened']);
 if(ids.length===0)return {cursor:input.cursor,assigneeId:null};
 if(input.transition==='accepted'&&input.cursor===Number.MAX_SAFE_INTEGER)throw Error('Recurrence rotation cursor exhausted');const cursor=input.cursor+(input.transition==='accepted'?1:0);return {cursor,assigneeId:ids[cursor%ids.length]};
}
