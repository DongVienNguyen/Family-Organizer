import {randomUUID} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {Task} from '../../src/types.js';
import {TaskStatus} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {decodeSeries,decodeSeriesException} from './seriesRecord.js';
import {decodeSeriesOccurrence} from './occurrenceRecord.js';
import {createRecurrenceSlotPlanner} from './recurrenceSlots.js';
import {transitionRotation} from './recurrencePolicy.js';
import {loadTask,savePilotTask} from './store.js';
import {allowRecurringTaskMedia} from '../mediaPolicy.js';
const fail=(message:string):never=>{throw new AppStoreError(message,422,'recurrence-acceptance');};
export function isDurableOccurrenceTask(tx:AppWriteTx,taskId:string):boolean {
 return tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version===11&&!!(tx.get('SELECT id FROM productivity_series WHERE task_id=?',taskId)||tx.get('SELECT task_id FROM productivity_series_occurrences WHERE task_id=?',taskId));
}
/** Trusted synchronous completion writer only: no client accepted timestamp,
 * independent transaction, clock, reward ledger or delivery side effect. Caller
 * flushes the accepted legacy Task first, within its existing I01 transaction. */
export function acceptRecurringOccurrence(tx:AppWriteTx,task:Task,actorId:string,acceptedAt:string):boolean {
 if(tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version!==11)return false;
 const ownRow=tx.get('SELECT * FROM productivity_series_occurrences WHERE task_id=?',task.id),own=ownRow?decodeSeriesOccurrence(ownRow):undefined;
 const row=own?tx.get('SELECT * FROM productivity_series WHERE id=?',own.seriesId):tx.get('SELECT * FROM productivity_series WHERE task_id=?',task.id);if(!row)return false;
 const series=decodeSeries(row);if(own?.state==='accepted')return true;
 const source=loadTask(tx,task.id);if(!source||source.lifecycle!=='completed'||source.pendingApproval||task.status!==TaskStatus.COMPLETED)fail('Kỳ lặp chưa được chấp nhận.');
 if(source.due.kind!=='none'&&source.due.timezone!==series.policy.timezone)fail('Mốc hạn chót và múi giờ lịch lặp không khớp.');
 if(utcInstant(acceptedAt)<utcInstant(series.updatedAt))fail('Đồng hồ lịch lặp đã lùi.');
 if(series.revision===Number.MAX_SAFE_INTEGER||series.acceptedCount===100000)fail('Lịch lặp đã đạt giới hạn.');
 const ordinal=own?.ordinal??0;
 if(!own&&series.nextOrdinal!==1||own&&own.ordinal!==series.nextOrdinal-1)fail('Kỳ lặp hiện hành không khớp.');
 if(own)tx.run("UPDATE productivity_series_occurrences SET state='accepted',accepted_at=?,accepted_revision=? WHERE series_id=? AND ordinal=?",acceptedAt,source.revision,series.id,ordinal);
 else tx.run('INSERT INTO productivity_series_occurrences VALUES(?,?,?,?,?,?,?,?,?)',series.id,0,task.id,'accepted',JSON.stringify(series.policy),JSON.stringify(source.due),series.createdAt,acceptedAt,source.revision);
 const rotation=transitionRotation({members:series.policy.rotationMembers,cursor:series.rotationCursor,transition:'accepted'});
 const plan=createRecurrenceSlotPlanner({policy:series.policy,anchor:series.anchor,acceptedCompletedAt:acceptedAt});
 const exceptions=new Map(tx.all('SELECT * FROM productivity_series_exceptions WHERE series_id=? AND ordinal>=?',series.id,series.nextOrdinal).map(row=>{const e=decodeSeriesException(row);return [e.ordinal,e]as const;}));
 let nextOrdinal=series.nextOrdinal,endedAt=series.endedAt;
 if(endedAt===null){
  for(;nextOrdinal<=100000;nextOrdinal++){
   if(series.policy.end.kind==='count'&&nextOrdinal>=series.policy.end.count){endedAt=acceptedAt;break;}
   const exception=exceptions.get(nextOrdinal);if(exception?.kind==='skip')continue;
   const slot=plan(nextOrdinal);if(slot.kind==='end'){endedAt=acceptedAt;break;}
   if(slot.kind==='awaiting-acceptance')fail('Thiếu thời điểm chấp nhận kỳ lặp.');
   if(!exception&&slot.kind==='skipped')continue;
   if(!exception&&slot.kind==='time-resolution-required')fail('Cần chọn thời điểm rõ ràng cho giờ DST.');
   const due=exception?.kind==='due'?structuredClone(exception.due):slot.kind==='due'?slot.due:undefined;if(!due)fail('Kỳ lặp chưa có hạn chót rõ ràng.');
   if(series.policy.end.kind==='date'&&due.kind!=='none'){
    // The planner applies the nominal bound; the effective exception must also
    // stay within the inclusive local end date.
    const effective=due.kind==='all_day'?due.date:planDate(due.instantUtc,due.timezone);if(effective>series.policy.end.date)continue;
   }
   const assigneeId=rotation.assigneeId??source.assigneeId;
   if(assigneeId&&!tx.legacy.users.some(user=>user.id===assigneeId&&!user.isDeleted))fail('Cần cập nhật thành viên luân phiên.');
   const id=randomUUID(),legacy:Task={...structuredClone(task),id,status:TaskStatus.TODO,dueDate:due.kind==='none'?'':due.kind==='all_day'?due.date:due.instantUtc,assigneeId,recurrenceType:'none',rotationMemberIds:[],sourceRecurringTaskId:series.taskId,completedById:null,completedAt:null,pendingApproval:false,submittedById:null,submittedAt:null,rejectionReason:null,proofImage:null,proofNote:null,comments:[],history:[{id:randomUUID(),userId:actorId,username:tx.legacy.users.find(user=>user.id===actorId)?.username??actorId,action:'Tạo kỳ lặp được chấp nhận',createdAt:acceptedAt}],createdAt:acceptedAt,updatedAt:acceptedAt};
   const rank=Math.min(0,...tx.all('SELECT rank FROM productivity_tasks').map(row=>row.rank))-1024;if(!Number.isSafeInteger(rank))fail('Thứ tự công việc đã đạt giới hạn.');
   const actor=tx.legacy.users.find(user=>user.id===actorId);if(!actor)fail('Không tìm thấy người thực hiện.');allowRecurringTaskMedia(tx,task,legacy,{userId:actorId,role:actor.role},series.id);
   savePilotTask(tx,{...source,id,lifecycle:'todo',due,scheduledStart:null,scheduledEnd:null,assigneeId,pendingApproval:false,blocked:false,blockedReason:null,revision:1,deletedAt:null,rank,legacy});
   tx.run('INSERT INTO productivity_series_occurrences VALUES(?,?,?,?,?,?,?,?,?)',series.id,nextOrdinal,id,'open',JSON.stringify(series.policy),JSON.stringify(due),acceptedAt,null,null);nextOrdinal++;break;
  }
  if(nextOrdinal>100000)endedAt=acceptedAt;
 }
 tx.run('UPDATE productivity_series SET revision=revision+1,next_ordinal=?,accepted_count=accepted_count+1,rotation_cursor=?,ended_at=?,updated_at=? WHERE id=?',nextOrdinal,rotation.cursor,endedAt,acceptedAt,series.id);
 return true;
}
import {localDateAt} from '../../src/features/productivity/dates.js';
const planDate=(instant:string,timezone:string)=>localDateAt(utcInstant(instant),timezone);
