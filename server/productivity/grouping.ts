export {groupMovePatch,type GroupMoveIntent} from '../../src/features/productivity/groupMove.js';
import {createHash} from 'node:crypto';
import {assertTaskRecord,type TaskRecord,type QueryClock} from '../../src/features/productivity/contracts.js';
import {resolveDue,timezoneFormatter,utcInstant} from '../../src/features/productivity/dates.js';
import {choice,text} from '../../src/features/productivity/validation.js';
/** Pure references for an already-authorized selection; not a query or an ACL boundary.
 * Group kinds are ephemeral and do not widen persisted TaskGroup/schema versions. */
export type BoardGroupKind='priority'|'assignee'|'due'|'tag';
export interface GroupCardReference {taskId:string;projectionId:string;group:{kind:BoardGroupKind;value:string|null}}
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
