/** @license SPDX-License-Identifier: Apache-2.0 */
import {UserRole,type FamilyOrganizerDB,type Notification} from '../src/types.js';
import {AppStoreError} from './appErrors.js';
import {isAdult,canViewLegacyTask,canViewLegacyPlan,canViewLegacyNote,canViewLegacyDocument,canViewLegacyPatient,canViewLegacyNotification,type LegacyActor} from './legacyVisibility.js';
export function legacyReader(db:FamilyOrganizerDB,userId:string):LegacyActor {
 const user=db.users.find(row=>row.id===userId&&!row.isDeleted&&Object.values(UserRole).includes(row.role));
 if(!user)throw new AppStoreError('Bạn không có quyền truy cập dữ liệu này.',403);
 return {userId:user.id,role:user.role};
}
function sourceVisible(db:FamilyOrganizerDB,actor:LegacyActor,ref:Notification['sourceRef']):boolean {
 if(!ref||typeof ref!=='object'||Array.isArray(ref))return false;
 if(ref.domain==='message'||ref.domain==='family')return true;
 if(ref.domain==='finance')return isAdult(actor);
 if(typeof ref.id!=='string'||!ref.id)return false;
 switch(ref.domain){
  case 'patient':return canViewLegacyPatient(ref.id,actor);
  case 'task':return db.tasks.some(row=>row.id===ref.id&&canViewLegacyTask(row,actor));
  case 'plan':return db.plans.some(row=>row.id===ref.id&&canViewLegacyPlan(row,actor));
  case 'note':return db.notes.some(row=>row.id===ref.id&&canViewLegacyNote(row,actor));
  case 'document':return db.documents.some(row=>row.id===ref.id&&canViewLegacyDocument(row,actor));
  default:return false;
 }
}
export function projectNotification(db:FamilyOrganizerDB,actor:LegacyActor,notification:Notification):Notification|undefined {
 if(!canViewLegacyNotification(notification,actor))return;
 if(notification.type==='finance'&&!isAdult(actor))return;
 if(notification.sourceRef){
  if(!sourceVisible(db,actor,notification.sourceRef))return;
  return {...notification};
 }
 // Historical recipient information alone cannot establish the source ACL.
 if(notification.type==='medication'&&!isAdult(actor)&&notification.userId!==actor.userId)return;
 const unproven=notification.type==='system'&&!isAdult(actor)||['task','plan','note'].includes(notification.type)&&!(notification.type==='task'?isAdult(actor):actor.role===UserRole.ADMIN);
 if(unproven){const {sourceRef,...safe}=notification;return {...safe,title:'Thông báo',content:'Nội dung lịch sử được ẩn vì không xác minh được quyền xem nguồn.'};}
 return {...notification};
}
export function projectNotifications(db:FamilyOrganizerDB,actor:LegacyActor):Notification[] {
 return db.notifications.flatMap(notification=>{const visible=projectNotification(db,actor,notification);return visible?[visible]:[];});
}
export function projectRewards(db:FamilyOrganizerDB,actor:LegacyActor) {
 return db.rewardLedger.map(entry=>{
  if(isAdult(actor)||entry.taskId&&db.tasks.some(task=>task.id===entry.taskId&&canViewLegacyTask(task,actor))||!entry.taskId&&entry.userId===actor.userId)return {...entry};
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
