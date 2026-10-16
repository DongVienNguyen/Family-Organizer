import {selectRecurrenceSuccessor} from './recurrenceSuccessor.js';
import type {Due} from '../../src/features/productivity/contracts.js';
import {randomUUID} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import {TaskStatus,type Task} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import {utcInstant,localDateAt} from '../../src/features/productivity/dates.js';
import {decodeSeriesException,type RecurrenceSeries} from './seriesRecord.js';
import {createRecurrenceSlotPlanner} from './recurrenceSlots.js';
import {savePilotTask,type StoredTask} from './store.js';
import {allowRecurringTaskMedia} from '../mediaPolicy.js';
const fail=(message:string):never=>{throw new AppStoreError(message,422,'recurrence-materialize');};
const planDate=(instant:string,timezone:string)=>localDateAt(utcInstant(instant),timezone);
/** Same-transaction event owner only. No wall clock or reward writer; skipped
 * cycles use the latest actual acceptance, never the time of a skip command. */
export function materializeSeriesSuccessor(tx:AppWriteTx,input:{series:RecurrenceSeries;source:StoredTask;task:Task;actorId:string;createdAt:string;acceptedCompletedAt?:string;calendarOrigin:number;assigneeId:string|null}):{nextOrdinal:number;endedAt:string|null}{
 const {series,source,task,actorId,createdAt,acceptedCompletedAt,calendarOrigin}=input;
 let nextOrdinal=series.nextOrdinal,endedAt=series.endedAt,due:Due|undefined;
 if(endedAt!==null)return {nextOrdinal,endedAt};
 const overrides=tx.all('SELECT * FROM productivity_series_exceptions WHERE series_id=? AND ordinal>=?',series.id,series.nextOrdinal).map(decodeSeriesException);
 if(tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version===12){
  const selected=selectRecurrenceSuccessor({policy:series.policy,anchor:series.anchor,nextOrdinal,exceptions:overrides,...acceptedCompletedAt?{acceptedCompletedAt}:{},calendarOrigin,resolvedAt:createdAt});
  if(selected.kind==='end')return {nextOrdinal:selected.nextOrdinal,endedAt:createdAt};nextOrdinal=selected.ordinal;due=selected.due;
 }else {
  // Frozen11 keeps its accepted cadence behavior; explicit12 opts into the
  // configured missed-cycle policy without rewriting existing owned facts.
  const plan=createRecurrenceSlotPlanner({policy:series.policy,anchor:series.anchor,...acceptedCompletedAt?{acceptedCompletedAt}:{}}),exceptions=new Map(overrides.map(e=>[e.ordinal,e]));
  for(;nextOrdinal<=100000;nextOrdinal++){
   if(series.policy.end.kind==='count'&&nextOrdinal>=series.policy.end.count){endedAt=createdAt;break;}
   const exception=exceptions.get(nextOrdinal);if(exception?.kind==='skip')continue;
   const slot=plan(nextOrdinal,series.policy.base==='completion'?nextOrdinal-calendarOrigin+1:1);if(slot.kind==='end'){endedAt=createdAt;break;}
   if(slot.kind==='awaiting-acceptance'&&!exception)fail('Thiếu thời điểm chấp nhận kỳ lặp.');
   if(!exception&&slot.kind==='skipped')continue;
   if(!exception&&slot.kind==='time-resolution-required')fail('Cần chọn thời điểm rõ ràng cho giờ DST.');
   due=exception?.kind==='due'?structuredClone(exception.due):slot.kind==='due'?slot.due:undefined;if(!due)fail('Kỳ lặp chưa có hạn chót rõ ràng.');
   if(series.policy.end.kind==='date'&&due.kind!=='none'){
    const effective=due.kind==='all_day'?due.date:planDate(due.instantUtc,due.timezone);if(effective>series.policy.end.date){due=undefined;continue;}
   }
   break;
  }
  if(nextOrdinal>100000)endedAt=createdAt;
  if(endedAt!==null||!due)return {nextOrdinal,endedAt};
 }
   const assigneeId=input.assigneeId;
   if(assigneeId&&!tx.legacy.users.some(user=>user.id===assigneeId&&!user.isDeleted))fail('Cần cập nhật thành viên luân phiên.');
   const id=randomUUID(),legacy:Task={...structuredClone(task),id,status:TaskStatus.TODO,dueDate:due.kind==='none'?'':due.kind==='all_day'?due.date:due.instantUtc,assigneeId,recurrenceType:'none',rotationMemberIds:[],sourceRecurringTaskId:series.taskId,completedById:null,completedAt:null,pendingApproval:false,submittedById:null,submittedAt:null,rejectionReason:null,proofImage:null,proofNote:null,comments:[],history:[{id:randomUUID(),userId:actorId,username:tx.legacy.users.find(user=>user.id===actorId)?.username??actorId,action:'Tạo kỳ lặp tiếp theo',createdAt:createdAt}],createdAt:createdAt,updatedAt:createdAt};
   const rank=Math.min(0,...tx.all('SELECT rank FROM productivity_tasks').map(row=>row.rank))-1024;if(!Number.isSafeInteger(rank))fail('Thứ tự công việc đã đạt giới hạn.');
   const actor=tx.legacy.users.find(user=>user.id===actorId);if(!actor)fail('Không tìm thấy người thực hiện.');allowRecurringTaskMedia(tx,task,legacy,{userId:actorId,role:actor.role},series.id);
   savePilotTask(tx,{...source,id,lifecycle:'todo',due,scheduledStart:null,scheduledEnd:null,assigneeId,pendingApproval:false,blocked:false,blockedReason:null,revision:1,deletedAt:null,rank,legacy});
   tx.run('INSERT INTO productivity_series_occurrences VALUES(?,?,?,?,?,?,?,?,?)',series.id,nextOrdinal,id,'open',JSON.stringify(series.policy),JSON.stringify(due),createdAt,null,null);nextOrdinal++;
 return {nextOrdinal,endedAt};
}
