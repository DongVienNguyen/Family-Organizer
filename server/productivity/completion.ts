import {withCompletionPolicy} from '../completionPolicy.js';
import {createHash} from 'node:crypto';
import type {AppCommand,TaskRecord} from '../../src/features/productivity/contracts.js';
import {keys,object,text} from '../../src/features/productivity/validation.js';
import {TaskStatus,UserRole} from '../../src/types.js';
import type {FamilyDB} from '../db.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
import {loadTask,type StoredTask} from './store.js';
import {projectTaskRecord} from './query.js';
import {workflowColumn,type WorkflowColumn} from './board.js';
export interface TaskCompletionProof {proofImage?:string|null;proofNote?:string|null}
export interface CompletionResult {task:TaskRecord;actualColumn:WorkflowColumn;approvalNeeded:boolean;spawnedTaskIds:string[];policy:'legacy-v1'|'linked-reversal-v1'}
type LegacyCompletion=Pick<typeof FamilyDB,'saveTask'|'approveTaskCompletion'|'rejectTaskCompletion'|'reopenTask'>;
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'task-completion');};
/** Semantic command owner reuses the single legacy policy/reward/recurrence writer.
 * No database is opened by import and no new policy is activated here. */
export function createCompletionCommands(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;legacy:LegacyCompletion;afterWrite?:()=>void}){
 const eventReferences=new WeakMap<CompletionResult,string[]>();
 const authority=(reader:TaskReader,ctx:AppCommand,id:string,adult:boolean)=>{const user=assertContext(ctx,reader);try{text(id,256);}catch{fail(400,'Mã công việc không hợp lệ.');}if(adult&&![UserRole.ADMIN,UserRole.MEMBER].includes(user.role))fail(403,'Cần người lớn duyệt công việc.');return {user,task:createTaskAccess(reader).assertTaskCommand(ctx.actor,id,'update')};};
 const run=(ctx:AppCommand,name:string,id:string,input:unknown,adult:boolean,change:(tx:AppWriteTx,before:StoredTask,username:string)=>void):CompletionResult=>{
  authority(ports.reader,ctx,id,adult);
  const committed=ports.write<CompletionResult>({actorId:ctx.actor.userId,command:'productivity:completion:'+name,requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({id,expectedRevision:ctx.expectedRevision,input})).digest('hex')},tx=>{
   const {user,task:before}=authority(tx,ctx,id,adult);if(before.revision!==ctx.expectedRevision)fail(409,'Công việc vừa thay đổi.');const ids=new Set(tx.legacy.tasks.map(t=>t.id));change(tx,before,user.username);const task=loadTask(tx,id);if(!task)fail(404,'Không tìm thấy công việc.');ports.afterWrite?.();return {task:projectTaskRecord(task!),actualColumn:workflowColumn(task!),approvalNeeded:task!.pendingApproval,spawnedTaskIds:tx.legacy.tasks.filter(t=>!ids.has(t.id)).map(t=>t.id),policy:'legacy-v1'};
  });
  // The command cache keeps internal IDs; each response reprojects them through
  // current ACL, including after a cache hit. Only trusted SSE dispatch gets the
  // full list via an object-bound WeakMap; it never enters serialized DTO fields.
  const result:CompletionResult={...committed,spawnedTaskIds:committed.spawnedTaskIds.filter(taskId=>createTaskAccess(ports.reader).getTask(ctx.actor,taskId)!==null)};eventReferences.set(result,[...committed.spawnedTaskIds]);return result;
 };
 const mutable=(before:StoredTask)=>{if(before.revision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản công việc đã đạt giới hạn.');};
 return {
  spawnedForEvents(result:CompletionResult):string[]{return [...(eventReferences.get(result)??[])];},
  requestCompletion(ctx:AppCommand,id:string,proof:TaskCompletionProof={}):CompletionResult {
   try{keys(object(proof),['proofImage','proofNote']);for(const [key,value]of Object.entries(proof)){if(value!==null)text(value,key==='proofNote'?8000:6*1024*1024,false);}}catch{fail(400,'Bằng chứng hoàn thành không hợp lệ.');}
   return run(ctx,'request',id,proof,false,(tx,before,username)=>{if(before.lifecycle==='completed'){if(Object.keys(proof).length)fail(422,'Công việc đã hoàn thành.');return;}if(before.lifecycle==='wont_do')fail(422,'Công việc đã ngừng thực hiện.');mutable(before);withCompletionPolicy(tx,{taskId:id,revision:before.revision,operation:'complete'},()=>ports.legacy.saveTask({id,status:TaskStatus.COMPLETED,...proof},ctx.actor.userId,username));});
  },
  approveCompletion(ctx:AppCommand,id:string):CompletionResult {
   return run(ctx,'approve',id,null,true,(tx,before,username)=>{if(before.lifecycle==='completed'&&!before.pendingApproval)return;if(!before.pendingApproval)fail(422,'Công việc không đang chờ duyệt.');mutable(before);withCompletionPolicy(tx,{taskId:id,revision:before.revision,operation:'complete'},()=>ports.legacy.approveTaskCompletion(id,ctx.actor.userId,username));});
  },
  reopenTask(ctx:AppCommand,id:string):CompletionResult {
   const result=run(ctx,'reopen',id,null,false,(_tx,before,username)=>{if(before.pendingApproval||before.lifecycle==='wont_do'||before.deletedAt!==null)fail(422,'Chỉ mở lại công việc đã hoàn thành.');if(before.lifecycle==='todo'||before.lifecycle==='in_progress')return;mutable(before);ports.legacy.reopenTask(id,ctx.actor.userId,username,before.revision);});
   const value:CompletionResult={...result,policy:'linked-reversal-v1'};eventReferences.set(value,eventReferences.get(result)??[]);return value;
  },
  rejectCompletion(ctx:AppCommand,id:string,reason:string):CompletionResult {
   try{text(reason,8000);}catch{fail(422,'Cần lý do trả lại công việc.');}
   return run(ctx,'reject',id,{reason},true,(_tx,before,username)=>{if(!before.pendingApproval)fail(422,'Công việc không đang chờ duyệt.');mutable(before);ports.legacy.rejectTaskCompletion(id,ctx.actor.userId,username,reason);});
  },
 };
}
