import {isDeepStrictEqual} from 'node:util';
import type {Due} from '../../src/features/productivity/contracts.js';
import {assertDue,utcInstant} from '../../src/features/productivity/dates.js';
import {integer,text,choice,keys,object} from '../../src/features/productivity/validation.js';
import {normalizeRecurrencePolicy,type RecurrencePolicy} from './recurrencePolicy.js';
export interface SeriesOccurrence {seriesId:string;ordinal:number;taskId:string;state:'open'|'accepted';policy:RecurrencePolicy;due:Due;createdAt:string;acceptedAt:string|null;acceptedRevision:number|null}
/** Only the new owned table uses this contract. Historical opaque occurrence
 * rows retain their original identity and payload without reinterpretation. */
export function decodeSeriesOccurrence(row:Record<string,unknown>):SeriesOccurrence {
 try{
  keys(object(row),['series_id','ordinal','task_id','state','policy_json','due_json','created_at','accepted_at','accepted_revision']);
  text(row.series_id,256);text(row.task_id,256);integer(row.ordinal,0,100000);choice(row.state,['open','accepted']);
  const raw=JSON.parse(row.policy_json as string),policy=normalizeRecurrencePolicy(raw);if(!isDeepStrictEqual(raw,policy))throw Error('Noncanonical policy');
  const due=JSON.parse(row.due_json as string);assertDue(due);if(due.kind!=='none'&&due.timezone!==policy.timezone)throw Error('Timezone');
  const created=utcInstant(row.created_at as string);
  if(row.state==='open'){if(row.ordinal===0||row.accepted_at!==null||row.accepted_revision!==null)throw Error('Open acceptance');}
  else{integer(row.accepted_revision,1);if(utcInstant(row.accepted_at as string)<created)throw Error('Acceptance before creation');}
  return {seriesId:row.series_id as string,ordinal:row.ordinal as number,taskId:row.task_id as string,state:row.state,policy,due:structuredClone(due),createdAt:row.created_at as string,acceptedAt:row.accepted_at as string|null,acceptedRevision:row.accepted_revision as number|null};
 }catch{throw Error('Invalid owned recurrence occurrence');}
}

export function validateOwnedOccurrenceRows(input:{occurrences:Record<string,unknown>[];series:import('./seriesRecord.js').RecurrenceSeries[];tasks:ReadonlyMap<string,{revision:number}>}):void {
 try{
  const owners=new Map(input.series.map(series=>[series.id,series])),seenTasks=new Set<string>(),seenSlots=new Set<string>(),counts=new Map<string,{accepted:number;open:number;root:boolean}>();
  for(const row of input.occurrences){
   const value=decodeSeriesOccurrence(row),series=owners.get(value.seriesId),task=input.tasks.get(value.taskId),key=JSON.stringify([value.seriesId,value.ordinal]);
   if(!series||!task||seenTasks.has(value.taskId)||seenSlots.has(key)||value.ordinal>=series.nextOrdinal||value.ordinal===0&&value.taskId!==series.taskId||value.ordinal!==0&&value.taskId===series.taskId)throw Error('Owner');
   if(value.acceptedRevision!==null&&value.acceptedRevision>task.revision||utcInstant(value.createdAt)>utcInstant(series.updatedAt)||value.acceptedAt!==null&&utcInstant(value.acceptedAt)>utcInstant(series.updatedAt))throw Error('History');
   if(value.policy.end.kind==='count'&&value.ordinal>=value.policy.end.count||value.ordinal>0&&value.policy.cadence.kind==='dates'&&value.ordinal>value.policy.cadence.dates.length)throw Error('Policy bounds');
   seenTasks.add(value.taskId);seenSlots.add(key);const count=counts.get(value.seriesId)??{accepted:0,open:0,root:false};count[value.state]++;count.root||=value.ordinal===0;counts.set(value.seriesId,count);
  }
  for(const series of input.series){const count=counts.get(series.id)??{accepted:0,open:0,root:false};if(count.accepted!==series.acceptedCount||count.open>1||(count.accepted||count.open)&&!count.root)throw Error('Count');}
 }catch{throw Error('Invalid owned recurrence coherence');}
}
