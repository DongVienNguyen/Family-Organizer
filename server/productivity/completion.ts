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
export interface CompletionResult {task:TaskRecord;actualColumn:WorkflowColumn;approvalNeeded:boolean;spawnedTaskIds:string[];policy:'legacy-v1'}
type LegacyCompletion=Pick<typeof FamilyDB,'saveTask'|'approveTaskCompletion'|'rejectTaskCompletion'>;
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'task-completion');};
/** Semantic command owner reuses the single legacy policy/reward/recurrence writer.
 * No database is opened by import and no new policy is activated here. */
export function createCompletionCommands(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;legacy:LegacyCompletion;afterWrite?:()=>void}){
 const authority=(reader:TaskReader,ctx:AppCommand,id:string,adult:boolean)=>{const user=assertContext(ctx,reader);try{text(id,256);}catch{fail(400,'Mã công việc không hợp lệ.');}if(adult&&![UserRole.ADMIN,UserRole.MEMBER].includes(user.role))fail(403,'Cần người lớn duyệt công việc.');return {user,task:createTaskAccess(reader).assertTaskCommand(ctx.actor,id,'update')};};
 const run=(ctx:AppCommand,name:string,id:string,input:unknown,adult:boolean,change:(tx:AppWriteTx,before:StoredTask,username:string)=>void):CompletionResult=>{
  authority(ports.reader,ctx,id,adult);
  return ports.write({actorId:ctx.actor.userId,command:'productivity:completion:'+name,requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({id,expectedRevision:ctx.expectedRevision,input})).digest('hex')},tx=>{
   const {user,task:before}=authority(tx,ctx,id,adult);if(before.revision!==ctx.expectedRevision)fail(409,'Công việc vừa thay đổi.');const ids=new Set(tx.legacy.tasks.map(t=>t.id));change(tx,before,user.username);const task=loadTask(tx,id);if(!task)fail(404,'Không tìm thấy công việc.');ports.afterWrite?.();return {task:projectTaskRecord(task!),actualColumn:workflowColumn(task!),approvalNeeded:task!.pendingApproval,spawnedTaskIds:tx.legacy.tasks.filter(t=>!ids.has(t.id)).map(t=>t.id),policy:'legacy-v1'};
  });
 };
 const mutable=(before:StoredTask)=>{if(before.revision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản công việc đã đạt giới hạn.');};
 return {
  requestCompletion(ctx:AppCommand,id:string,proof:TaskCompletionProof={}):CompletionResult {
   try{keys(object(proof),['proofImage','proofNote']);for(const [key,value]of Object.entries(proof)){if(value!==null)text(value,key==='proofNote'?8000:6*1024*1024,false);}}catch{fail(400,'Bằng chứng hoàn thành không hợp lệ.');}
   return run(ctx,'request',id,proof,false,(_tx,before,username)=>{if(before.lifecycle==='completed'){if(Object.keys(proof).length)fail(422,'Công việc đã hoàn thành.');return;}if(before.lifecycle==='wont_do')fail(422,'Công việc đã ngừng thực hiện.');mutable(before);ports.legacy.saveTask({id,status:TaskStatus.COMPLETED,...proof},ctx.actor.userId,username);});
  },
  approveCompletion(ctx:AppCommand,id:string):CompletionResult {
   return run(ctx,'approve',id,null,true,(_tx,before,username)=>{if(before.lifecycle==='completed'&&!before.pendingApproval)return;if(!before.pendingApproval)fail(422,'Công việc không đang chờ duyệt.');mutable(before);ports.legacy.approveTaskCompletion(id,ctx.actor.userId,username);});
  },
  rejectCompletion(ctx:AppCommand,id:string,reason:string):CompletionResult {
   try{text(reason,8000);}catch{fail(422,'Cần lý do trả lại công việc.');}
   return run(ctx,'reject',id,{reason},true,(_tx,before,username)=>{if(!before.pendingApproval)fail(422,'Công việc không đang chờ duyệt.');mutable(before);ports.legacy.rejectTaskCompletion(id,ctx.actor.userId,username,reason);});
  },
 };
}
