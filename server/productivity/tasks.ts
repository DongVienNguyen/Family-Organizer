import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,AppCommand,TaskPatch,Due,Priority} from '../../src/features/productivity/contracts.js';
import {assertTaskRecord} from '../../src/features/productivity/contracts.js';
import {object,keys,text,integer} from '../../src/features/productivity/validation.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {TaskPriority,TaskStatus,UserRole,type User} from '../../src/types.js';
import {savePilotTask,type StoredTask} from './store.js';
import {createTaskAccess,listPermission,type TaskReader} from './access.js';
export interface CreateTaskInput {listId:string;title:string;body?:string;due?:Due;priority?:Priority;assigneeId?:string|null;isShared?:boolean;tagIds?:string[]}
const createFields=['listId','title','body','due','priority','assigneeId','isShared','tagIds'];
const patchFields=['title','body','priority','due','scheduledStart','scheduledEnd','assigneeId','blocked','blockedReason','tagIds'];
function payload(value:unknown,allowed:string[]):void {
 try{const record=object(value);if(![Object.prototype,null].includes(Object.getPrototypeOf(record)))throw Error();keys(record,allowed);if(Object.values(record).some(v=>v===undefined))throw Error();}
 catch{throw new AppStoreError('Trường công việc không hợp lệ.',400,'task-payload');}
}
function validate(task:StoredTask):void {try{assertTaskRecord(task);}catch{throw new AppStoreError('Giá trị công việc không hợp lệ.',422,'task-validation');}}
function currentUser(reader:TaskReader,actor:AppActor):User {
 const raw=reader.get('SELECT data FROM users WHERE id=?',actor.userId);
 const user:User|undefined=raw?JSON.parse(raw.data):undefined;
 if(!user||user.isDeleted||user.role!==actor.role||!Object.values(UserRole).includes(user.role))throw new AppStoreError('Người dùng không được phép.',403,'task-actor');
 return user;
}
export function assertContext(ctx:AppCommand,reader:TaskReader):User {
 try{text(ctx.requestId,256);integer(ctx.expectedRevision);text(ctx.actor.userId,256);}catch{throw new AppStoreError('Lệnh công việc không hợp lệ.',400,'task-command');}
 if(reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value!=='1')throw new AppStoreError('Kho công việc chưa được kích hoạt.',409,'task-storage-inactive');
 return currentUser(reader,ctx.actor);
}
function assertAssignee(tx:AppWriteTx,id:string|null):void {
 if(id!==null&&!tx.legacy.users.some(user=>user.id===id&&!user.isDeleted&&Object.values(UserRole).includes(user.role)))throw new AppStoreError('Người được giao không hợp lệ.',422,'task-assignee');
}
function assertCreateList(reader:TaskReader,actor:AppActor,listId:string):void {
 const list=reader.get('SELECT owner_id,is_shared FROM productivity_lists WHERE id=?',listId),permission=listPermission(reader,actor,listId);
 if(!list||!list.is_shared&&list.owner_id!==actor.userId&&permission===undefined&&actor.role!==UserRole.ADMIN)throw new AppStoreError('Không tìm thấy danh sách.',404,'task-list');
 if(actor.role===UserRole.ADMIN||actor.role===UserRole.CHILD&&(list.is_shared||list.owner_id===actor.userId)||actor.role===UserRole.MEMBER&&(permission==='write'||permission==='manage'))return;
 throw new AppStoreError('Bạn không có quyền tạo công việc.',403,'task-forbidden');
}
/** Explicit trusted ports keep module imports free of connections/lifecycle work.
 * Fresh ACL preflight precedes gateway cache lookup; repeats cannot bypass a
 * revoked grant/actor. Checks repeat inside the single owned write transaction.
 */
export function createTaskCommands(ports:{write:typeof withAppWriteTransaction;reader:TaskReader}){
 const run=<T>(ctx:AppCommand,command:string,input:unknown,fn:(tx:AppWriteTx)=>T)=>ports.write({actorId:ctx.actor.userId,command:'productivity:task:'+command,requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify(input)).digest('hex')},fn);
 return {
  createTask(ctx:AppCommand,input:CreateTaskInput):StoredTask {
   payload(input,createFields);try{text(input.listId,256);}catch{throw new AppStoreError('Danh sách không hợp lệ.',422,'task-list');}assertContext(ctx,ports.reader);assertCreateList(ports.reader,ctx.actor,input.listId);
   if(ctx.expectedRevision!==0)throw new AppStoreError('Phiên bản tạo mới phải bằng 0.',409,'edit-conflict');
   return run(ctx,'create',input,tx=>{
    const user=assertContext(ctx,tx);assertCreateList(tx,ctx.actor,input.listId);const now=new Date().toISOString(),id=randomUUID();
    const row:StoredTask={id,listId:input.listId,sectionId:null,parentId:null,title:input.title,body:input.body??'',lifecycle:'todo',priority:input.priority??'none',due:input.due??{kind:'none'},scheduledStart:null,scheduledEnd:null,creatorId:user.id,assigneeId:input.assigneeId??null,isShared:input.isShared??false,tagIds:input.tagIds??[],blocked:false,blockedReason:null,pendingApproval:false,rewardPoints:0,revision:1,deletedAt:null,rank:1024,legacy:{id,title:input.title,description:input.body??'',status:TaskStatus.TODO,priority:TaskPriority.LOW,dueDate:'',creatorId:user.id,assigneeId:input.assigneeId??null,isShared:input.isShared??false,tags:input.tagIds??[],rewardPoints:0,pendingApproval:false,comments:[],history:[{id:randomUUID(),userId:user.id,username:user.username,action:'Tạo công việc',createdAt:now}],createdAt:now,updatedAt:now}};
    validate(row);assertAssignee(tx,row.assigneeId);
    const maximum=tx.get('SELECT max(rank) AS rank FROM productivity_tasks WHERE list_id=?',row.listId)?.rank??0;row.rank=maximum+1024;
    if(!Number.isSafeInteger(row.rank))throw new AppStoreError('Thứ tự công việc vượt giới hạn.',422);
    savePilotTask(tx,row);return row;
   });
  },
  updateTask(ctx:AppCommand,id:string,patch:TaskPatch):StoredTask {
   payload(patch,patchFields);assertContext(ctx,ports.reader);createTaskAccess(ports.reader).assertTaskCommand(ctx.actor,id,'update');
   return run(ctx,'update',{id,expectedRevision:ctx.expectedRevision,patch},tx=>{
    const user=assertContext(ctx,tx),before=createTaskAccess(tx).assertTaskCommand(ctx.actor,id,'update');
    if(before.revision!==ctx.expectedRevision)throw new AppStoreError('Công việc vừa được thay đổi.',409,'edit-conflict');
    const row:StoredTask={...before,...structuredClone(patch),revision:before.revision+1,legacy:structuredClone(before.legacy)};
    validate(row);if(row.assigneeId!==before.assigneeId){assertAssignee(tx,row.assigneeId);if(ctx.actor.role===UserRole.CHILD&&before.rewardPoints>0)throw new AppStoreError('Không được đổi người nhận công việc có thưởng.',403,'task-assignee');}
    const now=new Date().toISOString();row.legacy.updatedAt=now;row.legacy.history.push({id:randomUUID(),userId:user.id,username:user.username,action:'Cập nhật công việc: '+Object.keys(patch).join(', '),createdAt:now});
    savePilotTask(tx,row);return row;
   });
  },
 };
}
