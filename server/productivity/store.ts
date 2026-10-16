import {prepareBoardTaskWrite} from './boardInvariant.js';
import {writeSearchDocument} from './viewSchema.js';
import {hasTagOwnership,assertTagSelection} from './tagPolicy.js';
import type {AppActor} from '../../src/features/productivity/contracts.js';
import type {AppWriteTx} from '../appStore.js';
import type {TaskRecord} from '../../src/features/productivity/contracts.js';
import type {Task} from '../../src/types.js';
import {TaskStatus,TaskPriority} from '../../src/types.js';
import {assertTaskRecord} from '../../src/features/productivity/contracts.js';
import {parseLegacyDue} from '../../src/features/productivity/dates.js';
import {taskColumns} from './schema.js';
import {assertLegacyTask} from './legacy.js';
import {assertTaskStructure} from './structureInvariant.js';
export interface StoredTask extends TaskRecord {legacy:Task;rank:number}
let writeHooks:{before(tx:AppWriteTx):void;after(tx:AppWriteTx):void}|undefined;
/** Trusted bootstrap injects coherence ports without importing/opening storage. */
export function installTaskWriteHooks(hooks:NonNullable<typeof writeHooks>):void {
 if(writeHooks&&writeHooks!==hooks)throw new Error('Task write hooks already installed');
 writeHooks=hooks;
}
export function loadTask(tx:AppWriteTx,id:string):StoredTask|null {
 const r=tx.get('SELECT * FROM productivity_tasks WHERE id=?',id);if(!r)return null;
 return decodeTaskRow(r,tx.all('SELECT tag_id FROM productivity_task_tags WHERE task_id=? ORDER BY tag_id',id).map(x=>x.tag_id));
}
/** Batch legacy projections use two queries rather than two per task. */
export function loadTasks(tx:Pick<AppWriteTx,'get'|'all'>):StoredTask[] {
 const tags=new Map<string,string[]>();for(const row of tx.all('SELECT task_id,tag_id FROM productivity_task_tags ORDER BY task_id,tag_id')){const values=tags.get(row.task_id)??[];values.push(row.tag_id);tags.set(row.task_id,values);}
 return tx.all('SELECT * FROM productivity_tasks ORDER BY rank,id').map(row=>decodeTaskRow(row,tags.get(row.id)??[]));
}
export function decodeTaskRow(r:any,tagIds:string[]):StoredTask {
 const due=r.due_kind==='none'?{kind:'none' as const}:r.due_kind==='all_day'?{kind:'all_day' as const,date:r.due_date,timezone:r.due_timezone}:{kind:'timed' as const,instantUtc:r.due_instant,timezone:r.due_timezone};
 const task:StoredTask={id:r.id,listId:r.list_id,sectionId:r.section_id,parentId:r.parent_id,title:r.title,body:r.body,lifecycle:r.lifecycle,priority:r.priority,due,scheduledStart:r.scheduled_start,scheduledEnd:r.scheduled_end,creatorId:r.creator_id,assigneeId:r.assignee_id,isShared:!!r.is_shared,tagIds,blocked:!!r.blocked,blockedReason:r.blocked_reason,pendingApproval:!!r.pending_approval,rewardPoints:r.reward_points,revision:r.revision,deletedAt:r.deleted_at,rank:r.rank,legacy:JSON.parse(r.legacy_json)};
 assertTaskRecord(task);assertLegacyTask(task.legacy);if(task.legacy.id!==task.id||!Number.isSafeInteger(task.rank))throw new Error('Invalid pilot task provenance');return task;
}
/** Pilot-only repository. Production legacy writer cutover belongs to P02-b. */
export function savePilotTask(tx:AppWriteTx,task:StoredTask,actor?:AppActor):void {
 assertTaskRecord(task);assertLegacyTask(task.legacy);if(task.legacy.id!==task.id||!Number.isSafeInteger(task.rank))throw new Error('Invalid pilot task provenance');
 writeHooks?.before(tx);
 assertTaskStructure(tx,task);
 if(actor)assertTagSelection(tx,actor,task.tagIds);
 const finishBoardWrite=prepareBoardTaskWrite(tx,task);
 const values=[task.id,task.listId,task.sectionId,task.parentId,task.title,task.body,task.lifecycle,task.priority,task.due.kind,task.due.kind==='all_day'?task.due.date:null,task.due.kind==='timed'?task.due.instantUtc:null,task.due.kind==='none'?null:task.due.timezone,task.scheduledStart,task.scheduledEnd,task.creatorId,task.assigneeId,Number(task.isShared),Number(task.blocked),task.blockedReason,Number(task.pendingApproval),task.rewardPoints,task.revision,task.deletedAt,task.rank,JSON.stringify(task.legacy)];
 tx.run(`INSERT INTO productivity_tasks (${taskColumns.join(',')}) VALUES (${taskColumns.map(()=>'?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${taskColumns.slice(1).map(c=>c+'=excluded.'+c).join(',')}`, ...values);
 writeSearchDocument(tx,task);
 tx.run('DELETE FROM productivity_task_tags WHERE task_id=?',task.id);
 for(const tag of [...new Set(task.tagIds)]){const existed=tx.get('SELECT id FROM productivity_tags WHERE id=?',tag);tx.run('INSERT OR IGNORE INTO productivity_tags(id,name) VALUES(?,?)',tag,tag);if(!existed&&actor&&hasTagOwnership(tx))tx.run('INSERT INTO productivity_tag_owners VALUES(?,?)',tag,actor.userId);tx.run('INSERT INTO productivity_task_tags(task_id,tag_id) VALUES(?,?)',task.id,tag);}
 finishBoardWrite();
 writeHooks?.after(tx);
}
function legacyDueString(task:StoredTask):string {
 const original=parseLegacyDue(task.legacy.dueDate,'Asia/Saigon').due;
 if(JSON.stringify(original)===JSON.stringify(task.due))return task.legacy.dueDate;
 if(task.due.kind==='none')return '';
 if(task.due.kind==='all_day')return task.due.date;
 // Explicit UTC is accepted by the legacy parser and preserves seconds/ms
 // across zones. UI formatting is separate from persistence serialization.
 return task.due.instantUtc;
}
export function toLegacyTask(task:StoredTask):Task {
 const status=task.lifecycle==='wont_do'?TaskStatus.WONT_DO:task.lifecycle==='in_progress'?TaskStatus.IN_PROGRESS:task.lifecycle==='completed'?TaskStatus.COMPLETED:TaskStatus.TODO;
 const priority=task.priority==='high'?TaskPriority.HIGH:task.priority==='medium'?TaskPriority.MEDIUM:TaskPriority.LOW;
 return {...structuredClone(task.legacy),id:task.id,title:task.title,description:task.body,status,priority,dueDate:legacyDueString(task),creatorId:task.creatorId,assigneeId:task.assigneeId,isShared:task.isShared,tags:[...task.tagIds],pendingApproval:task.pendingApproval,rewardPoints:task.rewardPoints};
}
/** Match the legacy reader's documented default normalization without writes. */
export function projectLegacyTask(row:StoredTask):Task {
 const task=toLegacyTask(row);
 return {...task,completedById:task.completedById??null,completedAt:task.completedAt??null,recurrenceType:task.recurrenceType??'none',recurrenceInterval:task.recurrenceInterval??1,sourceRecurringTaskId:task.sourceRecurringTaskId??null};
}
