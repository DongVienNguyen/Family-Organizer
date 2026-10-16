import {normalizeRecurrencePolicy,type RecurrencePolicy} from './recurrencePolicy.js';
import type {Due} from '../../src/features/productivity/contracts.js';
import {planRecurrenceCalendar,type CalendarOccurrence} from './recurrenceCalendar.js';
import {planTimedRecurrence,resolveTimedRecurrenceDate,type TimedOccurrence} from './recurrenceTimed.js';
import {assertDue,utcInstant,localDateAt} from '../../src/features/productivity/dates.js';
import {keys,object,integer} from '../../src/features/productivity/validation.js';
export type RecurrenceSlotInput={policy:RecurrencePolicy;anchor:Due;ordinal:number;acceptedCompletedAt?:string};
export type RecurrenceSlot={ordinal:number}&({kind:'due';due:Due}|{kind:'end';reason:'count'|'date'|'dates-exhausted'}|{kind:'awaiting-acceptance'}|Exclude<CalendarOccurrence,{kind:'date'}>|Extract<TimedOccurrence,{kind:'time-resolution-required'}>);
/** Pure candidates only: no Task/series write, clock read, accepted claim,
 * rotation or reward authority is established by a successful plan. */
export function planRecurrenceSlot(input:RecurrenceSlotInput):RecurrenceSlot {
 try{keys(object(input),['policy','anchor','ordinal','acceptedCompletedAt']);}catch{throw Error('Invalid recurrence candidate input');}
 const {ordinal,...shared}=input;return createRecurrenceSlotPlanner(shared)(ordinal);
}
/** A detached, validated projection context; callers cannot opt out of policy,
 * anchor or instant validation. Only the ordinal varies within one projection. */
export function createRecurrenceSlotPlanner(input:Omit<RecurrenceSlotInput,'ordinal'>):(ordinal:number,calendarOffset?:number)=>RecurrenceSlot {
 let policy:RecurrencePolicy,anchor:Due,acceptedCompletedAt:string|undefined;
 try{
  keys(object(input),['policy','anchor','acceptedCompletedAt']);policy=normalizeRecurrencePolicy(input.policy);assertDue(input.anchor);anchor=structuredClone(input.anchor);
  if(anchor.kind==='none'&&policy.base==='due'||anchor.kind!=='none'&&anchor.timezone!==policy.timezone)throw Error('Invalid anchor');
  acceptedCompletedAt=input.acceptedCompletedAt;if(acceptedCompletedAt!==undefined)utcInstant(acceptedCompletedAt);
 }catch{throw Error('Invalid recurrence candidate input');}
 return (ordinal:number,calendarOffset=1):RecurrenceSlot=>{
 try{integer(ordinal,1,100000);integer(calendarOffset,1,100000);if(policy.base!=='completion'&&calendarOffset!==1)throw Error('Completion offset only');}catch{throw Error('Invalid recurrence candidate input');}
 if(policy.end.kind==='count'&&ordinal>=policy.end.count)return {kind:'end',ordinal,reason:'count'};
 if(policy.base==='completion'&&acceptedCompletedAt===undefined)return {kind:'awaiting-acceptance',ordinal};
 let slot:CalendarOccurrence|TimedOccurrence;
 if(policy.cadence.kind==='dates'){
  const date=policy.cadence.dates[ordinal-1];if(date===undefined)return {kind:'end',ordinal,reason:'dates-exhausted'};
  slot=anchor.kind==='timed'?resolveTimedRecurrenceDate({anchorInstantUtc:anchor.instantUtc,date,timezone:policy.timezone}):{kind:'date',date};
 }else{
  const options={base:policy.base,timezone:policy.timezone,...policy.cadence,ordinal:policy.base==='completion'?calendarOffset:ordinal};
  const {kind:_,...calendar}=options;
  slot=anchor.kind==='timed'?planTimedRecurrence({...calendar,anchorInstantUtc:anchor.instantUtc,...acceptedCompletedAt!==undefined?{acceptedCompletedAt:acceptedCompletedAt}:{}}):planRecurrenceCalendar({...calendar,anchorDate:anchor.kind==='all_day'?anchor.date:localDateAt(utcInstant(acceptedCompletedAt!),policy.timezone),...acceptedCompletedAt!==undefined?{acceptedCompletedAt:acceptedCompletedAt}:{}});
 }
 const date=slot.kind==='timed'?localDateAt(utcInstant(slot.instantUtc),policy.timezone):slot.kind==='skipped'?String(slot.year).padStart(4,'0')+'-'+String(slot.month).padStart(2,'0')+'-'+String(Math.min(slot.requestedDay,new Date(Date.UTC(slot.year,slot.month,0)).getUTCDate())).padStart(2,'0'):slot.date;
 if(policy.end.kind==='date'&&date>policy.end.date)return {kind:'end',ordinal,reason:'date'};
 if(slot.kind==='skipped'||slot.kind==='time-resolution-required')return {...slot,ordinal};
 return {kind:'due',ordinal,due:slot.kind==='timed'?{kind:'timed',instantUtc:slot.instantUtc,timezone:policy.timezone}:{kind:'all_day',date:slot.date,timezone:policy.timezone}};
 };
}
