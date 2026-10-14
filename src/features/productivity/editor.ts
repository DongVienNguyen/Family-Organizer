import {assertTaskRecord,type TaskRecord,type TaskPatch} from './contracts.js';
import {object,keys} from './validation.js';
const editable=['title','body','priority','due','scheduledStart','scheduledEnd','assigneeId','blocked','blockedReason','tagIds'] as const;
export interface TaskDraft {taskId:string;baseRevision:number;source:TaskRecord;values:TaskPatch;tagEditor?:{originalText:string;text:string}}
export function createTaskDraft(task:TaskRecord):TaskDraft {
 assertTaskRecord(task);const source=structuredClone(task);
 return {taskId:task.id,baseRevision:task.revision,source,values:Object.fromEntries(editable.map(field=>[field,structuredClone(task[field])]))};
}
export function editTaskDraft(draft:TaskDraft,patch:TaskPatch):TaskDraft {
 const raw=object(patch);keys(raw,[...editable]);const values={...draft.values,...structuredClone(patch)};
 return {...draft,values};
}
function comparable(value:unknown):string {
 const ordered=(v:any):any=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(key=>[key,ordered(v[key])])):v;
 return JSON.stringify(ordered(value));
}
/** Compare captured originals, not a newer remote record, so conflict retry cannot clobber others. */
export function changedTaskFields(task:TaskRecord,draft:TaskDraft):TaskPatch {
 if(task.id!==draft.taskId)throw Error('Task identity mismatch');
 assertTaskRecord({...draft.source,...draft.values});
 return Object.fromEntries(editable.filter(field=>comparable(draft.values[field])!==comparable(draft.source[field])).map(field=>[field,structuredClone(draft.values[field])]));
}
export function newTaskDefaults():TaskPatch {
 return {title:'',body:'',priority:'none',due:{kind:'none'},scheduledStart:null,scheduledEnd:null,assigneeId:null,tagIds:[],blocked:false,blockedReason:null};
}
