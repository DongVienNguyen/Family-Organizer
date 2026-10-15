import {createHash} from 'node:crypto';
import {assertTaskRecord,type TaskRecord,type QueryClock,type Priority,type Due,type TaskPatch} from '../../src/features/productivity/contracts.js';
import {resolveDue,timezoneFormatter,utcInstant,assertDue} from '../../src/features/productivity/dates.js';
import {choice,keys,object,text,strings} from '../../src/features/productivity/validation.js';
/** Pure references for an already-authorized selection; not a query or an ACL boundary.
 * Group kinds are ephemeral and do not widen persisted TaskGroup/schema versions. */
export type BoardGroupKind='priority'|'assignee'|'due'|'tag';
export interface GroupCardReference {taskId:string;projectionId:string;group:{kind:BoardGroupKind;value:string|null}}
export type GroupMoveIntent=
 |{kind:'priority';value:Priority}
 |{kind:'assignee';value:string|null}
 |{kind:'due';value:Due}
 |{kind:'tag';source:string|null|{all:true};target:string|null;choice?:'add'|'replace'};
export const groupProjectionLimits=Object.freeze({rows:5000,references:20000,bytes:16*1024*1024});
function reference(taskId:string,kind:BoardGroupKind,value:string|null):GroupCardReference {
 return {taskId,projectionId:createHash('sha256').update(JSON.stringify([taskId,kind,value])).digest('hex'),group:{kind,value}};
}
export function projectTaskGroups(rows:readonly TaskRecord[],kind:BoardGroupKind,clock:QueryClock):{cards:GroupCardReference[];totalUnique:number} {
 choice(kind,['priority','assignee','due','tag']);timezoneFormatter(clock.timezone);utcInstant(clock.nowUtc);
 if(!Array.isArray(rows)||rows.length>groupProjectionLimits.rows)throw new Error('Group input budget exceeded');
 const cards:GroupCardReference[]=[],seen=new Map<string,string>();let bytes=0;
 for(const row of rows){
  assertTaskRecord(row);const encoded=JSON.stringify(row),facts=createHash('sha256').update(encoded).digest('hex'),previous=seen.get(row.id);
  if(previous!==undefined){if(previous!==facts)throw new Error('Conflicting canonical task facts');continue;}
  bytes+=Buffer.byteLength(encoded);if(bytes>groupProjectionLimits.bytes)throw new Error('Group input byte budget exceeded');seen.set(row.id,facts);
  const values:(string|null)[]=kind==='tag'?(row.tagIds.length?[...new Set(row.tagIds)]:[null]):[kind==='priority'?row.priority:kind==='assignee'?row.assigneeId:resolveDue(row.due,clock).localDate];
  if(cards.length+values.length>groupProjectionLimits.references)throw new Error('Group projection budget exceeded');
  for(const value of values)cards.push(reference(row.id,kind,value));
 }
 return {cards,totalUnique:seen.size};
}
export function uniqueGroupTaskIds(cards:readonly GroupCardReference[]):string[]{
 if(!Array.isArray(cards)||cards.length>2*groupProjectionLimits.references)throw new Error('Group selection budget exceeded');
 const ids=new Set<string>();for(const card of cards){text(card.taskId,256);ids.add(card.taskId);}return [...ids];
}
/** Returns one selected field only. Caller must perform fresh ACL/catalog/revision,
 * preview, transaction and canonical WIP validation before applying it. */
export function groupMovePatch(task:TaskRecord,intent:GroupMoveIntent):TaskPatch {
 assertTaskRecord(task);const input=object(intent);
 switch(input.kind){
  case 'priority':keys(input,['kind','value']);choice(input.value,['high','medium','low','none']);return {priority:input.value};
  case 'assignee':keys(input,['kind','value']);if(input.value!==null)text(input.value,256);return {assigneeId:input.value as string|null};
  case 'due':keys(input,['kind','value']);assertDue(input.value);return {due:structuredClone(input.value)};
  case 'tag':{
   keys(input,['kind','source','target','choice']);if(input.target!==null)text(input.target,256);
   const existing=[...new Set(task.tagIds)],target=input.target as string|null;
   if(input.source!==null&&typeof input.source==='object'){
    const source=object(input.source);keys(source,['all']);if(source.all!==true)throw new Error('Invalid all-tags projection');
    choice(input.choice,['add','replace']);if(input.choice==='add'&&target===null)throw new Error('Adding requires a target tag');
    const tagIds=input.choice==='replace'?(target===null?[]:[target]):[...new Set([...existing,target!])];strings(tagIds);return {tagIds};
   }
   if(input.choice!==undefined)throw new Error('Tag choice only applies to all-tags');
   if(input.source===null){if(existing.length)throw new Error('Stale untagged projection');return {tagIds:target===null?[]:[target]};}
   text(input.source,256);if(!existing.includes(input.source))throw new Error('Stale source tag');
   return {tagIds:[...new Set(existing.flatMap(tag=>tag===input.source?(target===null?[]:[target]):[tag]))]};
  }
  default:throw new Error('Group is not writable');
 }
}
