import type {AppWriteTx} from '../appStore.js';
import type {TaskRecord} from '../../src/features/productivity/contracts.js';
import type {Task} from '../../src/types.js';
import {TaskStatus,TaskPriority} from '../../src/types.js';
import {assertTaskRecord} from '../../src/features/productivity/contracts.js';
import {parseLegacyDue,utcInstant} from '../../src/features/productivity/dates.js';
import {taskColumns} from './schema.js';
export interface StoredTask extends TaskRecord {legacy:Task;rank:number}
export function loadTask(tx:AppWriteTx,id:string):StoredTask|null {
 const r=tx.get('SELECT * FROM productivity_tasks WHERE id=?',id);if(!r)return null;
 const due=r.due_kind==='none'?{kind:'none' as const}:r.due_kind==='all_day'?{kind:'all_day' as const,date:r.due_date,timezone:r.due_timezone}:{kind:'timed' as const,instantUtc:r.due_instant,timezone:r.due_timezone};
 const task:StoredTask={id:r.id,listId:r.list_id,sectionId:r.section_id,parentId:r.parent_id,title:r.title,body:r.body,lifecycle:r.lifecycle,priority:r.priority,due,scheduledStart:r.scheduled_start,scheduledEnd:r.scheduled_end,creatorId:r.creator_id,assigneeId:r.assignee_id,isShared:!!r.is_shared,tagIds:tx.all('SELECT tag_id FROM productivity_task_tags WHERE task_id=? ORDER BY tag_id',id).map(x=>x.tag_id),blocked:!!r.blocked,blockedReason:r.blocked_reason,pendingApproval:!!r.pending_approval,rewardPoints:r.reward_points,revision:r.revision,deletedAt:r.deleted_at,rank:r.rank,legacy:JSON.parse(r.legacy_json)};
 assertTaskRecord(task);if(task.legacy.id!==task.id||!Number.isSafeInteger(task.rank))throw new Error('Invalid pilot task provenance');return task;
}
/** Pilot-only repository. Production legacy writer cutover belongs to P02-b. */
export function savePilotTask(tx:AppWriteTx,task:StoredTask):void {
 assertTaskRecord(task);if(task.legacy.id!==task.id||!Number.isSafeInteger(task.rank))throw new Error('Invalid pilot task provenance');
 const values=[task.id,task.listId,task.sectionId,task.parentId,task.title,task.body,task.lifecycle,task.priority,task.due.kind,task.due.kind==='all_day'?task.due.date:null,task.due.kind==='timed'?task.due.instantUtc:null,task.due.kind==='none'?null:task.due.timezone,task.scheduledStart,task.scheduledEnd,task.creatorId,task.assigneeId,Number(task.isShared),Number(task.blocked),task.blockedReason,Number(task.pendingApproval),task.rewardPoints,task.revision,task.deletedAt,task.rank,JSON.stringify(task.legacy)];
 tx.run(`INSERT INTO productivity_tasks (${taskColumns.join(',')}) VALUES (${taskColumns.map(()=>'?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${taskColumns.slice(1).map(c=>c+'=excluded.'+c).join(',')}`, ...values);
 tx.run('DELETE FROM productivity_task_tags WHERE task_id=?',task.id);
 for(const tag of [...new Set(task.tagIds)]){tx.run('INSERT OR IGNORE INTO productivity_tags(id,name) VALUES(?,?)',tag,tag);tx.run('INSERT INTO productivity_task_tags(task_id,tag_id) VALUES(?,?)',task.id,tag);}
}
function legacyDueString(task:StoredTask):string {
 const original=parseLegacyDue(task.legacy.dueDate,'Asia/Saigon').due;
 if(JSON.stringify(original)===JSON.stringify(task.due))return task.legacy.dueDate;
 if(task.due.kind==='none')return '';
 if(task.due.kind==='all_day')return task.due.date;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:task.due.timezone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utcInstant(task.due.instantUtc)));
 const p=(key:string)=>parts.find(x=>x.type===key)!.value;return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}`;
}
export function toLegacyTask(task:StoredTask):Task {
 const status=task.lifecycle==='in_progress'?TaskStatus.IN_PROGRESS:task.lifecycle==='completed'?TaskStatus.COMPLETED:TaskStatus.TODO;
 if(task.lifecycle==='wont_do')throw new Error('Legacy runtime cannot represent wont_do before cutover');
 if(task.priority==='none')throw new Error('Legacy runtime cannot represent priority none before cutover');
 const priority=task.priority==='high'?TaskPriority.HIGH:task.priority==='medium'?TaskPriority.MEDIUM:TaskPriority.LOW;
 return {...structuredClone(task.legacy),id:task.id,title:task.title,description:task.body,status,priority,dueDate:legacyDueString(task),creatorId:task.creatorId,assigneeId:task.assigneeId,isShared:task.isShared,tags:[...task.tagIds],pendingApproval:task.pendingApproval,rewardPoints:task.rewardPoints};
}
