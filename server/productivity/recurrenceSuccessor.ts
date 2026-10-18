import {AppStoreError} from '../appErrors.js';
import {utcInstant,localDateAt} from '../../src/features/productivity/dates.js';
import {createRecurrenceSlotPlanner} from './recurrenceSlots.js';
import {integer} from '../../src/features/productivity/validation.js';
import type {Due} from '../../src/features/productivity/contracts.js';
import type {RecurrencePolicy} from './recurrencePolicy.js';
import type {SeriesException} from './seriesRecord.js';
export interface SuccessorSelection {policy:RecurrencePolicy;anchor:Due;nextOrdinal:number;exceptions:readonly SeriesException[];acceptedCompletedAt?:string;calendarOrigin:number;resolvedAt:string}
export type SelectedSuccessor={kind:'due';ordinal:number;due:Due}|{kind:'end';nextOrdinal:number};
/** One event selects at most one successor. Omitted cycles remain unaccepted;
 * no Task, claim, reward, rotation, clock or storage effects occur here. */
export function selectRecurrenceSuccessor(input:SuccessorSelection):SelectedSuccessor {
 const fail=(message:string):never=>{throw new AppStoreError(message,422,'recurrence-materialize');};
 const resolved=utcInstant(input.resolvedAt),today=localDateAt(resolved,input.policy.timezone);integer(input.nextOrdinal,1,100001);integer(input.calendarOrigin,1,100001);
 const plan=createRecurrenceSlotPlanner({policy:input.policy,anchor:input.anchor,...input.acceptedCompletedAt?{acceptedCompletedAt:input.acceptedCompletedAt}:{}}),exceptions=new Map(input.exceptions.map(e=>[e.ordinal,e]));
 let latest:Extract<SelectedSuccessor,{kind:'due'}>|undefined;
 for(let ordinal=input.nextOrdinal;ordinal<=100000;ordinal++){
  const exception=exceptions.get(ordinal),slot=plan(ordinal,input.policy.base==='completion'?ordinal-input.calendarOrigin+1:1);
  if(slot.kind==='end')return latest??{kind:'end',nextOrdinal:ordinal};
  if(exception?.kind==='skip')continue;
  if(slot.kind==='awaiting-acceptance'&&!exception)fail('Thiếu thời điểm chấp nhận kỳ lặp.');
  if(!exception&&slot.kind==='skipped')continue;
  if(!exception&&slot.kind==='time-resolution-required')fail('Cần chọn thời điểm rõ ràng cho giờ DST.');
  const due=exception?.kind==='due'?structuredClone(exception.due):slot.kind==='due'?slot.due:undefined;if(!due)fail('Kỳ lặp chưa có hạn chót rõ ràng.');
  const date=due.kind==='none'?undefined:due.kind==='all_day'?due.date:localDateAt(utcInstant(due.instantUtc),input.policy.timezone);
  if(date&&input.policy.end.kind==='date'&&date>input.policy.end.date)continue;
  const candidate={kind:'due' as const,ordinal,due},missed=due.kind==='all_day'?due.date<today:due.kind==='timed'?utcInstant(due.instantUtc)<resolved:false;
  // An explicit adult deadline choice overrides the automatic missed rule.
  if(exception?.kind==='due')return candidate;
  if(input.policy.missed==='catch_up')return candidate;
  if(missed){if(input.policy.missed==='latest')latest=candidate;continue;}
  return latest??candidate;
 }
 return latest??{kind:'end',nextOrdinal:100001};
}
