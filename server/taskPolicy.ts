/** @license SPDX-License-Identifier: Apache-2.0 */
import {isDeepStrictEqual} from 'node:util';
import {UserRole,TaskStatus,TaskPriority,type FamilyOrganizerDB,type Task} from '../src/types.js';
import {AppStoreError} from './appErrors.js';
export {currentLegacyActor as taskActor} from './legacyActor.js';
import {isAdult,canViewLegacyTask,canEditLegacyTask,type LegacyActor} from './legacyVisibility.js';
import {detectedMediaType} from './mediaContent.js';
const invalid=()=>new AppStoreError('Dữ liệu công việc không hợp lệ.',400);
const forbidden=()=>new AppStoreError('Bạn không có quyền thay đổi trường công việc này.',403);
const same=isDeepStrictEqual;
const protectedFields=new Set(['creatorId','comments','history','completedById','completedAt','pendingApproval','submittedById','submittedAt','rejectionReason','sourceRecurringTaskId','createdAt','updatedAt']);
const editableFields=new Set(['id','baseUpdatedAt','title','description','status','priority','dueDate','assigneeId','isShared','tags','rewardPoints','recurrenceType','recurrenceInterval','recurrenceEndDate','rotationMemberIds','proofImage','proofNote']);
export function requireTaskAdult(actor:LegacyActor):void {if(!isAdult(actor))throw forbidden();}
export function requireTaskEdit(task:Task|undefined,actor:LegacyActor):void {
 if(!isAdult(actor)&&actor.role!==UserRole.CHILD)throw forbidden();
 if(task){if(!canViewLegacyTask(task,actor))throw new AppStoreError('Không tìm thấy công việc',404);if(!canEditLegacyTask(task,actor))throw forbidden();}
}
export function taskPayloadObject(value:unknown):asserts value is Record<string,any> {
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw invalid();
}
const text=(v:unknown,max:number,empty=true)=>typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0);
function validDate(value:unknown,time:boolean):boolean {
 if(typeof value!=='string')return false;
 const match=(time?/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/:/^(\d{4})-(\d{2})-(\d{2})$/).exec(value);
 if(!match)return false;const [year,month,day]=match.slice(1,4).map(Number),date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day&&(!match[4]||Number(match[4])<24&&Number(match[5])<60);
}
function validImage(value:unknown):boolean {
 if(value===null||value==='')return true;if(typeof value!=='string')return false;
 if(value.startsWith('/uploads/'))return value.length<=2048;
 if(/^https?:\/\//.test(value)){try{return value.length<=4096&&['http:','https:'].includes(new URL(value).protocol);}catch{return false;}}
 if(value.length>6*1024*1024)return false;
 const match=/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);if(!match)return false;
 const bytes=Buffer.from(match[2],'base64');return bytes.length>0&&bytes.length<=4*1024*1024&&bytes.toString('base64')===match[2]&&detectedMediaType(bytes)===match[1].replace('image/jpg','image/jpeg');
}
export function validateTaskPayload(input:Record<string,any>,old:Task|undefined,actor:LegacyActor,db:FamilyOrganizerDB):Partial<Task>&{baseUpdatedAt?:string} {
 requireTaskEdit(old,actor);const result:Record<string,any>={};
 const liveId=(value:unknown)=>text(value,256,false)&&db.users.some(u=>u.id===value&&!u.isDeleted&&Object.values(UserRole).includes(u.role));
 for(const [key,value] of Object.entries(input)){
  if(value===undefined)continue;
  if(protectedFields.has(key)){if(!old||!same(value,(old as any)[key]))throw forbidden();continue;}
  if(!editableFields.has(key)){if(!old||!Object.hasOwn(old,key)||!same(value,(old as any)[key]))throw invalid();continue;}
  if(key==='__proto__'||key==='constructor'||key==='prototype')throw invalid();
  let valid=true;
  switch(key){
   case 'id':valid=text(value,256,false);break;
   case 'baseUpdatedAt':valid=text(value,64);break;
   case 'title':valid=text(value,500,false);break;
   case 'description':valid=text(value,20000);break;
   case 'status':valid=Object.values(TaskStatus).includes(value)&&Boolean(old||value===TaskStatus.TODO||value===TaskStatus.IN_PROGRESS);break;
   case 'priority':valid=Object.values(TaskPriority).includes(value);break;
   case 'dueDate':valid=validDate(value,true);break;
   case 'assigneeId':if(old&&same(value,old.assigneeId))continue;valid=value===null||liveId(value);break;
   case 'isShared':valid=typeof value==='boolean';break;
   case 'tags':valid=Array.isArray(value)&&value.length<=40&&value.every(v=>text(v,128,false));break;
   case 'rewardPoints':valid=Number.isSafeInteger(value)&&value>=0&&value<=1000000;break;
   case 'recurrenceType':valid=['none','daily','weekly','monthly','yearly'].includes(value);break;
   case 'recurrenceInterval':valid=Number.isSafeInteger(value)&&value>=1&&value<=10000;break;
   case 'recurrenceEndDate':valid=value===''||validDate(value,false);break;
   case 'rotationMemberIds':if(old&&same(value,old.rotationMemberIds))continue;valid=Array.isArray(value)&&value.length<=100&&new Set(value).size===value.length&&value.every(liveId);break;
   case 'proofImage':valid=validImage(value);break;
   case 'proofNote':valid=value===null||text(value,8000);break;
  }
  if(!valid)throw invalid();
  if(actor.role===UserRole.CHILD&&key==='rewardPoints'&&value!==(old?.rewardPoints??0))throw forbidden();
  if(actor.role===UserRole.CHILD&&old&&(old.rewardPoints??0)>0&&key==='assigneeId'&&!same(value,old.assigneeId))throw forbidden();
  if(actor.role===UserRole.CHILD&&old&&old.creatorId!==actor.userId&&key==='isShared'&&!same(value,old.isShared))throw forbidden();
  result[key]=value;
 }
 return result;
}
export function validateTaskComment(value:unknown):asserts value is string {if(!text(value,8000,false))throw new AppStoreError('Bình luận phải là nội dung không rỗng, tối đa 8000 ký tự.',400);}
