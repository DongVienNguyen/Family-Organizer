import type {LegacyRecurrencePreview,LegacyRecurrenceInput} from './seriesApi.js';
import type {RecurrenceSeries} from '../../../server/productivity/seriesRecord.js';
import {normalizeRecurrencePolicy} from '../../../server/productivity/recurrencePolicy.js';
import {assertDue,parseLegacyDue} from './dates.js';
import type {Due} from './contracts.js';
import type {RecurrencePolicy} from '../../../server/productivity/recurrencePolicy.js';
export interface RecurrenceDraft {timezone:string;base:'due'|'completion';frequency:'daily'|'weekly'|'monthly'|'yearly'|'dates';interval:string;invalidDate:'clamp'|'skip';dates:string;end:'never'|'count'|'date';count:string;endDate:string;missed:''|'catch_up'|'latest'|'skip';rotationMembers:string[]}
export function recurrenceDraft(policy?:RecurrencePolicy,due:Due={kind:'none'}):RecurrenceDraft {
 return {timezone:policy?.timezone??(due.kind==='none'?'Asia/Saigon':due.timezone),base:policy?.base??(due.kind==='none'?'completion':'due'),frequency:policy?.cadence.kind==='dates'?'dates':policy?.cadence.frequency??'weekly',interval:String(policy?.cadence.kind==='calendar'?policy.cadence.interval:1),invalidDate:policy?.cadence.kind==='calendar'?policy.cadence.invalidDate:'clamp',dates:policy?.cadence.kind==='dates'?policy.cadence.dates.join(', '):'',end:policy?.end.kind??'never',count:String(policy?.end.kind==='count'?policy.end.count:10),endDate:policy?.end.kind==='date'?policy.end.date:'',missed:policy?.missed??'',rotationMembers:[...(policy?.rotationMembers??[])]};
}
const number=(value:string)=>{if(!/^[1-9]\d*$/.test(value))throw Error('Invalid positive integer');return Number(value);};
export function recurrencePolicy(draft:RecurrenceDraft):RecurrencePolicy {
 return normalizeRecurrencePolicy({timezone:draft.timezone,base:draft.base,cadence:draft.frequency==='dates'?{kind:'dates',dates:draft.dates.split(/[,\s]+/).filter(Boolean)}:{kind:'calendar',frequency:draft.frequency,interval:number(draft.interval),invalidDate:draft.invalidDate},end:draft.end==='never'?{kind:'never'}:draft.end==='count'?{kind:'count',count:number(draft.count)}:{kind:'date',date:draft.endDate},missed:draft.missed,rotationMembers:[...draft.rotationMembers]});
}
export function recurrenceDeadline(input:{date:string;time:string;timezone:string;exactUtc?:string}):Due {
 let due:Due;
 if(input.exactUtc)due={kind:'timed',instantUtc:input.exactUtc,timezone:input.timezone};
 else if(!input.date){if(input.time)throw Error('Date required');due={kind:'none'};}
 else if(!input.time)due={kind:'all_day',date:input.date,timezone:input.timezone};
 else {const result=parseLegacyDue(input.date+' '+input.time,input.timezone);if(result.due.kind!=='timed')throw Error('Explicit instant required');due=result.due;}
 assertDue(due);return due;
}

/** Only a still-eligible next slot needs the missing initial acceptance anchor. */
export function initialNextDeadlineRequired(series:Pick<RecurrenceSeries,'policy'|'acceptedCount'|'nextOrdinal'|'endedAt'>):boolean {return series.policy.base==='completion'&&series.acceptedCount===0&&series.endedAt===null&&series.nextOrdinal<=100000&&!(series.policy.end.kind==='count'&&series.nextOrdinal>=series.policy.end.count);}

export interface LegacyConversionDraft {date:string;time:string;exactUtc:string;noAnchor:boolean;policyAcknowledged:boolean;otherActiveAcknowledged:boolean}
/** A new edition never silently borrows the current Task's deadline or past
 * accepted history. Anchor and policy choices belong to this separate draft. */
export function legacyConversionDraft():LegacyConversionDraft {return {date:'',time:'',exactUtc:'',noAnchor:false,policyAcknowledged:false,otherActiveAcknowledged:false};}
export function legacyConversionInput(draft:LegacyConversionDraft,preview:Pick<LegacyRecurrencePreview,'fingerprint'|'otherActiveTaskIds'>,input:RecurrencePolicy):LegacyRecurrenceInput {
 if(draft.policyAcknowledged!==true||typeof draft.noAnchor!=='boolean'||typeof draft.otherActiveAcknowledged!=='boolean'||['date','time','exactUtc'].some(name=>typeof draft[name]!=='string'))throw Error('Explicit new policy choice required');
 if(preview.otherActiveTaskIds.length&&!draft.otherActiveAcknowledged)throw Error('Other open work needs acknowledgement');
 const policy=normalizeRecurrencePolicy(input);let anchor:Due;
 if(draft.noAnchor){if(policy.base!=='completion'||draft.date||draft.time||draft.exactUtc)throw Error('Conflicting anchor choice');anchor={kind:'none'};}
 else {anchor=recurrenceDeadline({date:draft.date,time:draft.time,exactUtc:draft.exactUtc,timezone:policy.timezone});if(anchor.kind==='none')throw Error('Explicit anchor choice required');}
 return {fingerprint:preview.fingerprint,policy:structuredClone(policy),anchor,acknowledgeOtherActive:draft.otherActiveAcknowledged};
}
