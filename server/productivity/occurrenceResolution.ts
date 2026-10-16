import type {RecurrenceSeries} from './seriesRecord.js';
import {decodeSeriesOccurrence} from './occurrenceRecord.js';
import {decodeOccurrenceSkip} from './occurrenceSkipRecord.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
export interface ResolutionInput {series:RecurrenceSeries[];occurrences:Record<string,unknown>[];skips:Record<string,unknown>[];tasks:ReadonlyMap<string,{revision:number;lifecycle:string}>;userIds:ReadonlySet<string>}
/** Version12 resolves a frozen physical open fact through an explicit skip
 * decision, preserving accepted facts and their grant/rotation count. */
export function validateOccurrenceResolutions(input:ResolutionInput):void {
 try{
  const owners=new Map(input.series.map(series=>[series.id,series])),slots=new Map<string,ReturnType<typeof decodeSeriesOccurrence>>(),decisions=new Map<string,ReturnType<typeof decodeOccurrenceSkip>>(),ownedTasks=new Set<string>(),skippedTasks=new Set<string>(),populated=new Set<string>(),rootOwners=new Map(input.series.map(series=>[series.taskId,series.id])),counts=new Map<string,{accepted:number;open:number;root:boolean}>(),key=(seriesId:string,ordinal:number)=>JSON.stringify([seriesId,ordinal]);
  if(owners.size!==input.series.length||rootOwners.size!==input.series.length)throw Error('Duplicate series');
  for(const row of input.occurrences){const value=decodeSeriesOccurrence(row),owner=owners.get(value.seriesId),task=input.tasks.get(value.taskId),slot=key(value.seriesId,value.ordinal);if(!owner||!task||slots.has(slot)||ownedTasks.has(value.taskId)||rootOwners.has(value.taskId)&&rootOwners.get(value.taskId)!==value.seriesId||value.ordinal>=owner.nextOrdinal||value.ordinal===0&&value.taskId!==owner.taskId||value.ordinal>0&&value.taskId===owner.taskId)throw Error('Ownership');
   if(value.acceptedRevision!==null&&value.acceptedRevision>task.revision||utcInstant(value.createdAt)>utcInstant(owner.updatedAt)||value.acceptedAt!==null&&utcInstant(value.acceptedAt)>utcInstant(owner.updatedAt))throw Error('History');
   if(value.policy.end.kind==='count'&&value.ordinal>=value.policy.end.count||value.ordinal>0&&value.policy.cadence.kind==='dates'&&value.ordinal>value.policy.cadence.dates.length)throw Error('Policy');
   slots.set(slot,value);ownedTasks.add(value.taskId);populated.add(value.seriesId);
  }
  for(const row of input.skips){const value=decodeOccurrenceSkip(row),owner=owners.get(value.seriesId),task=input.tasks.get(value.taskId),slot=key(value.seriesId,value.ordinal),owned=slots.get(slot);if(!owner||!task||!input.userIds.has(value.skippedById)||decisions.has(slot)||skippedTasks.has(value.taskId)||value.ordinal>=owner.nextOrdinal||task.lifecycle!=='wont_do'||value.taskRevision>task.revision)throw Error('Decision');
   if(value.ordinal===0?(value.taskId!==owner.taskId||owned!==undefined):(!owned||owned.state!=='open'||owned.taskId!==value.taskId))throw Error('Resolved ownership');
   if(utcInstant(value.skippedAt)<utcInstant(owned?.createdAt??owner.createdAt)||utcInstant(value.skippedAt)>utcInstant(owner.updatedAt))throw Error('Decision time');
   decisions.set(slot,value);skippedTasks.add(value.taskId);populated.add(value.seriesId);
  }
  for(const value of slots.values()){
   const owner=owners.get(value.seriesId)!,resolved=decisions.has(key(value.seriesId,value.ordinal)),task=input.tasks.get(value.taskId)!,count=counts.get(value.seriesId)??{accepted:0,open:0,root:false};
   if(value.state==='accepted'){if(resolved)throw Error('Accepted skip');count.accepted++;count.root||=value.ordinal===0;}
   else if(!resolved){if(value.ordinal!==owner.nextOrdinal-1||!['todo','in_progress'].includes(task.lifecycle))throw Error('Current occurrence');count.open++;}
   counts.set(value.seriesId,count);
  }
  for(const owner of input.series){const count=counts.get(owner.id)??{accepted:0,open:0,root:false};count.root||=decisions.has(key(owner.id,0));if(count.accepted!==owner.acceptedCount||count.open>1||populated.has(owner.id)&&(!count.root||count.open!==(owner.endedAt===null?1:0)))throw Error('Count/root');}
 }catch{throw Error('Invalid occurrence resolution');}
}
