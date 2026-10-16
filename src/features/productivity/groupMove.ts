import {assertTaskRecord,type TaskRecord,type Priority,type Due,type TaskPatch} from './contracts.js';
import {assertDue} from './dates.js';
import {object,keys,text,choice,strings} from './validation.js';
export type GroupMoveIntent=
 |{kind:'priority';value:Priority}
 |{kind:'assignee';value:string|null}
 |{kind:'due';value:Due}
 |{kind:'tag';source:string|null|{all:true};target:string|null;choice?:'add'|'replace'};
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
