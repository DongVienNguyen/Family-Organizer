import {createHmac} from 'node:crypto';
/** @license SPDX-License-Identifier: Apache-2.0 */
import {UserRole,type FamilyOrganizerDB,type Notification} from '../src/types.js';
import {AppStoreError} from './appErrors.js';
import {walletNotificationSource,type WalletOccurrenceNotificationSource} from '../src/features/wallet/notificationContract.js';
import {isAdult,canViewLegacyTask,canViewLegacyPlan,canViewLegacyNote,canViewLegacyDocument,canViewLegacyPatient,canViewLegacyNotification,canonicalTaskPolicyActive,type LegacyActor} from './legacyVisibility.js';
export function legacyReader(db:FamilyOrganizerDB,userId:string):LegacyActor {
 const user=db.users.find(row=>row.id===userId&&!row.isDeleted&&Object.values(UserRole).includes(row.role));
 if(!user)throw new AppStoreError('Bạn không có quyền truy cập dữ liệu này.',403);
 return {userId:user.id,role:user.role};
}
export type WalletNotificationAccess=(actor:LegacyActor,source:WalletOccurrenceNotificationSource,notification:Notification)=>boolean;
function sourceVisible(db:FamilyOrganizerDB,actor:LegacyActor,ref:Notification['sourceRef'],walletAccess?:WalletNotificationAccess,notification?:Notification):boolean {
 if(!ref||typeof ref!=='object'||Array.isArray(ref))return false;
 if(ref.domain==='message'||ref.domain==='family')return true;
 if(ref.domain==='finance')return isAdult(actor);
 if(ref.domain==='wallet-occurrence'){
  if(!isAdult(actor)||!walletAccess||!notification)return false;
  try{return walletAccess(actor,walletNotificationSource(ref),notification)===true;}catch{return false;}
 }
 if(typeof ref.id!=='string'||!ref.id)return false;
 switch(ref.domain){
  case 'medication':return db.medications.some(row=>row.id===ref.id&&canViewLegacyPatient(row.patientId,actor));
  case 'vaccination':return db.vaccinations.some(row=>row.id===ref.id&&canViewLegacyPatient(row.childId,actor));
  case 'task':return db.tasks.some(row=>row.id===ref.id&&canViewLegacyTask(row,actor));
  case 'plan':return db.plans.some(row=>row.id===ref.id&&canViewLegacyPlan(row,actor));
  case 'note':return db.notes.some(row=>row.id===ref.id&&canViewLegacyNote(row,actor));
  case 'document':return db.documents.some(row=>row.id===ref.id&&canViewLegacyDocument(row,actor));
  default:return false;
 }
}
export function projectNotification(db:FamilyOrganizerDB,actor:LegacyActor,notification:Notification,privacyKey?:string,walletAccess?:WalletNotificationAccess):Notification|undefined {
 if(!canViewLegacyNotification(notification,actor))return;
 if(notification.type==='finance'&&!isAdult(actor))return;
 if(notification.sourceRef){
  if(!sourceVisible(db,actor,notification.sourceRef,walletAccess,notification))return;
  return {...notification};
 }
 // Historical recipient information alone cannot establish the source ACL.
 if(notification.type==='medication'&&!isAdult(actor)&&notification.userId!==actor.userId)return;
 const knownType=['system','task','plan','note','finance','medication'].includes(notification.type);
 const unproven=!knownType||notification.type==='system'||notification.type==='medication'&&!isAdult(actor)||['task','plan','note'].includes(notification.type)&&!(notification.type==='task'?isAdult(actor)&&(!canonicalTaskPolicyActive()||actor.role===UserRole.ADMIN):actor.role===UserRole.ADMIN);
 if(unproven){
  if(!privacyKey)return;
  const id='legacy-notice-'+createHmac('sha256',privacyKey).update('legacy-notification-id-v1\0'+actor.userId+'\0'+notification.id).digest('hex');
  // Only these historical fields are known safe; source-bearing extensions stay private.
  return {id,userId:notification.userId,type:knownType?notification.type:'system',isRead:notification.isRead,createdAt:notification.createdAt,title:'Thông báo',content:'Nội dung lịch sử được ẩn vì không xác minh được quyền xem nguồn.'};
 }
 return {...notification};
}
export function projectNotifications(db:FamilyOrganizerDB,actor:LegacyActor,privacyKey?:string,walletAccess?:WalletNotificationAccess):Notification[] {
 return db.notifications.flatMap(notification=>{const visible=projectNotification(db,actor,notification,privacyKey,walletAccess);return visible?[visible]:[];});
}
export function projectRewards(db:FamilyOrganizerDB,actor:LegacyActor,privacyKey?:string) {
 return db.rewardLedger.map(entry=>{
  if(isAdult(actor)&&(!canonicalTaskPolicyActive()||actor.role===UserRole.ADMIN)||entry.taskId&&db.tasks.some(task=>task.id===entry.taskId&&canViewLegacyTask(task,actor))||!entry.taskId&&entry.userId===actor.userId)return {...entry};
  if(canonicalTaskPolicyActive()){
   const id=privacyKey?'private-reward-'+createHmac('sha256',privacyKey).update('private-reward-id-v1\\0'+actor.userId+'\\0'+entry.id).digest('hex'):'private-reward';
   // Public family balances remain, while source IDs/extensions stay private.
   return {id,userId:entry.userId,points:entry.points,reason:'Điểm thưởng',createdById:entry.createdById,createdAt:entry.createdAt};
  }
  const {taskId,...safe}=entry;
  return {...safe,reason:'Điểm thưởng'};
 });
}
export function projectActivityLogs(db:FamilyOrganizerDB,actor:LegacyActor) {
 if(actor.role!==UserRole.ADMIN)throw new AppStoreError('Bạn không có quyền xem nhật ký.',403);
 return db.activityLogs.map(log=>{
  const hidden=log.sourceRef?!sourceVisible(db,actor,log.sourceRef):log.action==='Giấy tờ';
  if(!hidden)return {...log};
  const {sourceRef,...safe}=log;
  return {...safe,details:'Nội dung được ẩn vì không xác minh được quyền xem nguồn.'};
 });
}
