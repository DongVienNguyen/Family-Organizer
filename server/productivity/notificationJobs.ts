import {UserRole} from '../../src/types.js';
import {createTaskAccess} from './access.js';
import {createHash} from 'node:crypto';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import type {AppJobs} from '../appJobs.js';
import type {AppJobInput,AppJobLease} from '../jobStore.js';
import {getAppCommandContext,withAppCommandContext} from '../commandContext.js';
import {AppStoreError} from '../appErrors.js';
import {integer,text,object,keys} from '../../src/features/productivity/validation.js';
import {utcInstant,localDateAt} from '../../src/features/productivity/dates.js';
import {defaultTaskNotificationPreferences,normalizeTaskNotificationPreferences,nextTaskDelivery} from '../../src/features/productivity/notificationPolicy.js';
import type {TaskReader} from './access.js';
import type {createTaskNotifications} from './notifications.js';
import {loadTask} from './store.js';
export interface TaskNoticeWork {id:string;payload:{epoch:string;tick:number;afterTaskId:string|null}}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function epoch(reader:TaskReader):{id:string;at:string|null}{if(!reader.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_restore_commits'"))return {id:'initial',at:null};const row=reader.get('SELECT id,committed_at FROM app_restore_commits ORDER BY rowid DESC LIMIT 1');return row?{id:row.id,at:row.committed_at}:{id:'initial',at:null};}
/** Bounded synchronous batches join I01. Recurring/continuation leases and
 * outbound effects are all owned by the existing AppJobs registry/store. */
export function createTaskNotificationJobs(ports:{enqueue:(tx:AppWriteTx,input:AppJobInput)=>string;reader:TaskReader;write:typeof withAppWriteTransaction;notifications:ReturnType<typeof createTaskNotifications>;recordReminder:(taskId:string,claimId:string,recipientId:string,createdAt:string)=>string;dispatchNotice:(notificationId:string,recipientId:string,digestId?:string,createdAt?:string)=>string|null;now?:()=>number}){
 const clock=ports.now??Date.now,reader=ports.reader;
 const run=(job:TaskNoticeWork,signal:AbortSignal,events:{notificationChanged?(id:string):void}={})=>{
  const p=object(job.payload);keys(p,['epoch','tick','afterTaskId']);text(p.epoch,256);integer(p.tick);if(p.afterTaskId!==null)text(p.afterTaskId,256);if(!ports.notifications.enabled()||signal.aborted||p.epoch!==epoch(reader).id)return {processed:0,stale:true};
  // Preserve the registry's lease assertion while selecting the internal worker
  // actor. Recipient roles are always read live, never accepted from a payload.
  return withAppCommandContext({...getAppCommandContext(),actorId:'system:task-notifications',requestId:job.id},()=>ports.write({actorId:'system:task-notifications',command:'productivity:notification:scan',requestId:job.id,payloadHash:hash(p)},tx=>{
   if(signal.aborted||p.epoch!==epoch(tx).id)throw new AppStoreError('Lượt nhắc thuộc phiên khôi phục cũ.',409);
   const now=clock(),stamp=new Date(now).toISOString();
   // Shared restore policy has already consumed old outbound references inside
   // replacement COMMIT; do not infer provenance from possibly skewed clocks.
   const tasks=tx.all('SELECT DISTINCT task_id FROM productivity_task_reminder_rules'+(p.afterTaskId===null?'':' WHERE task_id>?')+' ORDER BY task_id LIMIT 11',...(p.afterTaskId===null?[]:[p.afterTaskId]));
   for(const row of tasks.slice(0,10)){const task=loadTask(tx,row.task_id);if(task)ports.notifications.reconcileTask(tx,task);}
   const released=ports.notifications.releaseDue(tx,50,ports.recordReminder),deliveries=tx.all("SELECT * FROM productivity_task_notice_deliveries WHERE state='pending' AND(available_at IS NULL OR available_at<=?) ORDER BY available_at,notification_id,recipient_id LIMIT 50",stamp),recipients=new Set(released.recipientIds);
   for(const row of deliveries){
    const rawUser=tx.get('SELECT data FROM users WHERE id=?',row.recipient_id),user=rawUser?JSON.parse(rawUser.data):null;
    if(!user||user.isDeleted||!Object.values(UserRole).includes(user.role)||!createTaskAccess(tx).getTask({userId:user.id,role:user.role},row.task_id)){tx.run("UPDATE productivity_task_notice_deliveries SET state='suppressed',updated_at=? WHERE notification_id=? AND recipient_id=?",stamp,row.notification_id,row.recipient_id);continue;}
    const stored=tx.get('SELECT settings_json FROM productivity_task_notification_preferences WHERE user_id=?',row.recipient_id),prefs=stored?normalizeTaskNotificationPreferences(JSON.parse(stored.settings_json)):defaultTaskNotificationPreferences,scheduled=nextTaskDelivery(row.eligible_at,prefs),quietRelease=nextTaskDelivery(stamp,{...prefs,mode:'immediate'});
    if(scheduled===null||quietRelease===null){tx.run("UPDATE productivity_task_notice_deliveries SET state='suppressed',available_at=NULL,updated_at=? WHERE notification_id=? AND recipient_id=?",stamp,row.notification_id,row.recipient_id);continue;}
    const available=utcInstant(scheduled)>utcInstant(quietRelease)?scheduled:quietRelease;if(utcInstant(available)>now){tx.run('UPDATE productivity_task_notice_deliveries SET available_at=?,updated_at=? WHERE notification_id=? AND recipient_id=?',available,stamp,row.notification_id,row.recipient_id);continue;}
    const digest=prefs.mode==='daily'?'task_digest_'+hash([row.recipient_id,localDateAt(now,prefs.timezone)]):undefined;
    tx.run("UPDATE productivity_task_notice_deliveries SET state='queued',digest_key=?,available_at=?,updated_at=? WHERE notification_id=? AND recipient_id=?",digest??null,available,stamp,row.notification_id,row.recipient_id);
    const result=ports.dispatchNotice(row.notification_id,row.recipient_id,digest,stamp);if(result===null)tx.run("UPDATE productivity_task_notice_deliveries SET state='suppressed',digest_key=NULL WHERE notification_id=? AND recipient_id=?",row.notification_id,row.recipient_id);else recipients.add(row.recipient_id);
   }
   if(tasks.length>10)ports.enqueue(tx,{namespace:'productivity',type:'task-notification-scan',kind:'command',key:p.epoch+':'+p.tick+':'+tasks[9].task_id,payload:{epoch:p.epoch,tick:p.tick,afterTaskId:tasks[9].task_id}});
   for(const id of recipients)if(events.notificationChanged)tx.afterCommit(()=>events.notificationChanged!(id));
   return {processed:released.processed+deliveries.length,stale:false};
  }));
 };
 return {enabled:ports.notifications.enabled,epoch:()=>epoch(reader).id,run};
}
export function registerTaskNotificationJobs(jobs:AppJobs,engine:ReturnType<typeof createTaskNotificationJobs>,events:{notificationChanged?(id:string):void}={}):void {
 if(!jobs.durableEnabled)return;
 const requireLease=(job:AppJobLease|undefined)=>{if(!job)throw Error('Durable task notification lease required');return job;};
 jobs.registerAppJob('productivity','task-notification-scan',(signal,job)=>{engine.run(requireLease(job)as TaskNoticeWork,signal,events);});
 jobs.registerAppJob('productivity','task-notification-tick',(signal,job)=>{const lease=requireLease(job),separator=lease.key.lastIndexOf(':'),tick=Number(lease.key.slice(separator+1));if(separator<1||!Number.isSafeInteger(tick)||tick<0)throw Error('Invalid task notification tick identity');engine.run({id:lease.id,payload:{epoch:lease.key.slice(0,separator),tick,afterTaskId:null}},signal,events);},{everyMs:60000,initialMs:1000,kind:'command',occurrenceKey:now=>engine.enabled()?engine.epoch()+':'+Math.floor(now.getTime()/60000):undefined});
}
