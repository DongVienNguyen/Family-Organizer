import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,AppCommand} from '../../src/features/productivity/contracts.js';
import type {TrackingRef,TrackingReminderDto,TrackingReminderInput} from '../../src/features/productivity/trackingReminderContract.js';
import {trackingRef,trackingReminderInput} from '../../src/features/productivity/trackingReminderContract.js';
import {calendarDate,localDateAt,localDayStart} from '../../src/features/productivity/dates.js';
import {habitScheduledOn,habitWeekStart} from '../../src/features/productivity/habitPolicy.js';
import {countdownDays} from '../../src/features/productivity/countdownPolicy.js';
import {defaultTaskNotificationPreferences,normalizeTaskNotificationPreferences,nextTaskDelivery} from '../../src/features/productivity/notificationPolicy.js';
import {object,keys,text,integer} from '../../src/features/productivity/validation.js';
import {UserRole} from '../../src/types.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import type {AppJobInput} from '../jobStore.js';
import {getAppCommandContext,withAppCommandContext} from '../commandContext.js';
import {AppStoreError} from '../appErrors.js';
import type {TaskReader} from './access.js';
import {habitContext,habitFail,habitValidation,visibleHabitRow} from './habitAccess.js';
import {createHabits} from './habits.js';import {createCountdowns} from './countdowns.js';import {productivityVersionsFrom} from './knownVersions.js';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),shift=(date:string,days:number)=>new Date(calendarDate(date)+days*86400000).toISOString().slice(0,10);
function epoch(reader:TaskReader):string {return reader.get("SELECT 1 FROM sqlite_master WHERE type='table'AND name='app_restore_commits'")?(reader.get('SELECT id FROM app_restore_commits ORDER BY rowid DESC LIMIT 1')?.id??'initial'):'initial';}
export interface TrackingScanWork {id:string;payload:{epoch:string;tick:number;afterRuleId:string|null;scanDone:boolean}}
export function createTrackingReminders(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;now?:()=>number;enqueue?:(tx:AppWriteTx,input:AppJobInput)=>string;recordNotice?:(claimId:string,ownerId:string,digestId:string|undefined,createdAt:string)=>string}){
 const now=ports.now??Date.now,reader=ports.reader,enabled=()=>productivityVersionsFrom(21).includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version)&&reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value==='1';
 const authorize=(actor:AppActor,r=reader,write=false)=>{if(!enabled())habitFail(409,'Nhắc thói quen/ngày quan trọng chưa được kích hoạt.');habitContext(r,{actor,requestId:'tracking-reminders:read',expectedRevision:0},write);};
 const reference=(row:any):TrackingRef=>row.habit_id!==null?{kind:'habit',id:row.habit_id}:{kind:'countdown',id:row.countdown_id};
 const ruleFor=(ownerId:string,ref:TrackingRef,r=reader)=>r.get('SELECT * FROM productivity_tracking_reminders WHERE owner_id=?AND '+(ref.kind==='habit'?'habit_id':'countdown_id')+'=?',ownerId,ref.id);
 const dto=(actor:AppActor,ref:TrackingRef,r=reader):TrackingReminderDto=>{authorize(actor,r);const source=visibleHabitRow(r,actor,ref.id,ref.kind),row=ruleFor(actor.userId,ref,r);return {id:row?.id??null,source:ref,ownerId:actor.userId,revision:row?.revision??0,enabled:!!row?.enabled,minute:row?.minute_of_day??480,reviewRequired:!!row?.review_required,sourceRevision:source.revision};};
 const preferences=(ownerId:string,r:TaskReader)=>{const row=r.get('SELECT settings_json FROM productivity_task_notification_preferences WHERE user_id=?',ownerId);return row?normalizeTaskNotificationPreferences(JSON.parse(row.settings_json)):defaultTaskNotificationPreferences;};
 const liveActor=(ownerId:string,r:TaskReader):AppActor|null=>{const raw=r.get('SELECT data FROM users WHERE id=?',ownerId),user=raw?JSON.parse(raw.data):null;return user&&!user.isDeleted&&Object.values(UserRole).includes(user.role)&&user.role!==UserRole.GUEST?{userId:ownerId,role:user.role}:null;};
 /** Claims use one original local date, never replaying every missed day after
  * downtime. Quiet/daily policy may release that claim the following day. */
 const fact=(rule:any,actor:AppActor,r:TaskReader,at:number,dateOverride?:string)=>{
  try{
   const ref=reference(rule),source=visibleHabitRow(r,actor,ref.id,ref.kind);if(source.archived_at!==null)return null;
   let timezone:string,date:string;
   if(ref.kind==='habit'){
    const habits=createHabits({reader:r,write:ports.write,now:()=>at}),habit=habits.getHabit(actor,ref.id);timezone=habit.policy.timezone;date=dateOverride??localDateAt(at,timezone);
    if(date<habit.startDate||date>localDateAt(at,timezone))return null;
    const daily=habits.habitStats(actor,ref.id,{fromDate:date,toDateExclusive:shift(date,1)}),day=daily.days[0];
    if(!day?.scheduled||day.skipped||day.met)return null;
    // The definition for the requested date, not a newly edited numeric goal,
    // decides whether a raw partial check-in still needs its own reminder.
    const definition=r.get('SELECT policy_json FROM productivity_habit_definitions WHERE habit_id=?AND effective_date<=? ORDER BY effective_date DESC,revision DESC LIMIT 1',ref.id,date),policy=JSON.parse(definition.policy_json);
    if(!habitScheduledOn(policy.frequency,date))return null;
    timezone=policy.timezone;
    if(policy.frequency.kind==='weekly'){const start=habitWeekStart(date),week=habits.habitStats(actor,ref.id,{fromDate:start,toDateExclusive:shift(start,7)});if(week.required>0&&week.achieved>=week.required)return null;}
   }else{
    const value=createCountdowns({reader:r,write:ports.write,now:()=>at}).getCountdown(actor,ref.id);timezone=value.policy.timezone;date=dateOverride??localDateAt(at,timezone);
    const occurrence=countdownDays(value.policy,{nowUtc:new Date(localDayStart(date,timezone)).toISOString()}),occurrenceDate=value.policy.annual?occurrence.nextAnnualDate:value.policy.date;if(occurrenceDate!==date)return null;
   }
   const today=localDateAt(at,timezone);if(date>today||today>=shift(date,2))return null;
   const eligibleAt=nextTaskDelivery(new Date(localDayStart(date,timezone)).toISOString(),{...defaultTaskNotificationPreferences,timezone,mode:'daily',digestMinute:rule.minute_of_day});if(eligibleAt===null||Date.parse(eligibleAt)>at)return null;
   return {date,timezone,eligibleAt,sourceRevision:source.revision as number};
  }catch(error){if(error instanceof AppStoreError&&[401,403,404].includes(error.status))return null;throw error;}
 };
 return {
  enabled,epoch:()=>epoch(reader),
  getReminder(actor:AppActor,raw:TrackingRef){const ref=habitValidation(()=>trackingRef(raw));return dto(actor,ref);},
  saveReminder(ctx:AppCommand,raw:TrackingRef,input:TrackingReminderInput){authorize(ctx.actor,reader,true);const ref=habitValidation(()=>trackingRef(raw)),value=habitValidation(()=>trackingReminderInput(input));visibleHabitRow(reader,ctx.actor,ref.id,ref.kind);
   ports.write({actorId:ctx.actor.userId,command:'productivity:tracking-reminder:save',requestId:ctx.requestId,payloadHash:hash({revision:ctx.expectedRevision,ref,value})},tx=>{authorize(ctx.actor,tx,true);const source=visibleHabitRow(tx,ctx.actor,ref.id,ref.kind),before=ruleFor(ctx.actor.userId,ref,tx);if(source.revision!==value.sourceRevision||ctx.expectedRevision!==(before?.revision??0))habitFail(409,'Mục theo dõi hoặc nhắc nhở đã thay đổi; hãy tải lại.');if(value.enabled&&source.archived_at!==null)habitFail(409,'Mục đã lưu trữ không nhận nhắc nhở mới.');if(before?.revision>=Number.MAX_SAFE_INTEGER-1)habitFail(409,'Nhắc nhở đã đạt giới hạn phiên bản.');const id=before?.id??randomUUID(),stamp=new Date(Math.max(now(),before?Date.parse(before.updated_at):0)).toISOString();if(before)tx.run('UPDATE productivity_tracking_reminders SET enabled=?,minute_of_day=?,revision=revision+1,review_required=0,updated_at=? WHERE id=?',Number(value.enabled),value.minute,stamp,id);else tx.run('INSERT INTO productivity_tracking_reminders VALUES(?,?,?,?,?,?,?,?,?,?)',id,ctx.actor.userId,ref.kind==='habit'?ref.id:null,ref.kind==='countdown'?ref.id:null,Number(value.enabled),value.minute,1,0,stamp,stamp);tx.run("UPDATE productivity_tracking_deliveries SET state='suppressed',available_at=NULL,updated_at=CASE WHEN updated_at>?THEN updated_at ELSE ? END WHERE reminder_id=?AND state='pending'",stamp,stamp,id);return {id};});return dto(ctx.actor,ref);
  },
  run(job:TrackingScanWork,signal:AbortSignal,events:{notificationChanged?(id:string):void}={}){
   const p=object(job.payload);keys(p,['epoch','tick','afterRuleId','scanDone']);text(p.epoch,256);integer(p.tick);if(p.afterRuleId!==null)text(p.afterRuleId,256);if(typeof p.scanDone!=='boolean')throw Error('Invalid tracking scan cursor');if(!enabled()||signal.aborted||p.epoch!==epoch(reader))return {processed:0,stale:true};
   return withAppCommandContext({...getAppCommandContext(),actorId:'system:tracking-reminders',requestId:job.id},()=>ports.write({actorId:'system:tracking-reminders',command:'productivity:tracking-reminders:scan',requestId:job.id,payloadHash:hash(p)},tx=>{
    signal.throwIfAborted();if(p.epoch!==epoch(tx))throw new AppStoreError('Lượt nhắc thuộc phiên khôi phục cũ.',409);const at=now(),stamp=new Date(at).toISOString(),rules=p.scanDone?[]:tx.all('SELECT * FROM productivity_tracking_reminders WHERE enabled=1'+(p.afterRuleId===null?'':' AND id>?')+' ORDER BY id LIMIT 11',...(p.afterRuleId===null?[]:[p.afterRuleId]));
    for(const rule of rules.slice(0,10)){signal.throwIfAborted();const actor=liveActor(rule.owner_id,tx);if(!actor||at<Date.parse(rule.updated_at))continue;const value=fact(rule,actor,tx,at);if(!value)continue;const id='tracking_claim_'+hash([rule.id,value.date]),prefs=preferences(rule.owner_id,tx),available=nextTaskDelivery(value.eligibleAt,prefs);tx.run('INSERT OR IGNORE INTO productivity_tracking_deliveries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,rule.id,rule.owner_id,value.date,value.timezone,value.sourceRevision,rule.revision,value.eligibleAt,available,available?'pending':'suppressed',null,null,stamp,stamp);}
    const due=tx.all("SELECT * FROM productivity_tracking_deliveries WHERE state='pending'AND available_at<=? ORDER BY available_at,id LIMIT 51",stamp),recipients=new Set<string>();
    for(const row of due.slice(0,50)){signal.throwIfAborted();const rule=tx.get('SELECT * FROM productivity_tracking_reminders WHERE id=?',row.reminder_id),actor=liveActor(row.owner_id,tx),value=rule&&rule.enabled&&rule.revision===row.rule_revision&&actor?fact(rule,actor,tx,at,row.local_date):null;
     if(!value||value.sourceRevision!==row.source_revision||value.timezone!==row.timezone||value.eligibleAt!==row.eligible_at){tx.run("UPDATE productivity_tracking_deliveries SET state='suppressed',available_at=NULL,updated_at=CASE WHEN updated_at>?THEN updated_at ELSE ? END WHERE id=?",stamp,stamp,row.id);continue;}
     if(at<Date.parse(row.updated_at)){tx.run('UPDATE productivity_tracking_deliveries SET available_at=? WHERE id=?',row.updated_at,row.id);continue;}
     const prefs=preferences(row.owner_id,tx),scheduled=nextTaskDelivery(row.eligible_at,prefs),quiet=nextTaskDelivery(stamp,{...prefs,mode:'immediate'});if(scheduled===null||quiet===null){tx.run("UPDATE productivity_tracking_deliveries SET state='suppressed',available_at=NULL,updated_at=? WHERE id=?",stamp,row.id);continue;}
     const available=Date.parse(scheduled)>Date.parse(quiet)?scheduled:quiet;if(Date.parse(available)>at){tx.run('UPDATE productivity_tracking_deliveries SET available_at=?,updated_at=? WHERE id=?',available,stamp,row.id);continue;}
     if(!ports.recordNotice)habitFail(503,'Bộ gửi nhắc theo dõi chưa sẵn sàng.');const digest=prefs.mode==='daily'?'tracking_digest_'+hash([row.owner_id,localDateAt(at,prefs.timezone)]):undefined;tx.run('UPDATE productivity_tracking_deliveries SET available_at=?,updated_at=? WHERE id=?',available,stamp,row.id);const notificationId=ports.recordNotice!(row.id,row.owner_id,digest,stamp);text(notificationId,256);tx.run("UPDATE productivity_tracking_deliveries SET state='delivered',notification_id=?,digest_id=?,updated_at=? WHERE id=?",notificationId,digest??null,stamp,row.id);recipients.add(row.owner_id);
    }
    if((rules.length>10||due.length>50)&&ports.enqueue){const afterRuleId=rules.length?rules[Math.min(9,rules.length-1)].id:p.afterRuleId,payload={epoch:p.epoch,tick:p.tick,afterRuleId,scanDone:p.scanDone||rules.length<=10};ports.enqueue(tx,{namespace:'productivity',type:'tracking-reminder-scan',kind:'command',key:'scan:'+hash([job.id,payload]),payload});}
    for(const id of recipients)if(events.notificationChanged)tx.afterCommit(()=>events.notificationChanged!(id));return {processed:Math.min(10,rules.length)+Math.min(50,due.length),stale:false};
   }));
  },
 };
}
