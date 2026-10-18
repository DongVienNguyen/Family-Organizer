import {createHash} from 'node:crypto';
import {setImmediate as yieldImmediate} from 'node:timers/promises';
import type {Actor,CommandContext} from '../../src/features/wallet/contracts.js';
import type {Notification} from '../../src/types.js';
import {UserRole} from '../../src/types.js';
import {object,keys,text,integer} from '../../src/features/productivity/validation.js';
import {calendarDate} from '../../src/features/productivity/dates.js';
import {effectiveDateAt} from '../../src/features/wallet/dates.js';
import type {AppJobs} from '../appJobs.js';
import type {AppJobLease} from '../jobStore.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {getAppCommandContext,withAppCommandContext} from '../commandContext.js';
import {AppStoreError} from '../appErrors.js';
import type {WalletReader} from './access.js';
import {openWalletStore} from './store.js';
import {normalizeScheduleDraft} from '../../src/features/wallet/scheduleContracts.js';
import {walletReminderId} from './reminderIdentity.js';
import {walletJobEpoch,type WalletScheduleWork} from './jobIdentity.js';
import type {createWalletSchedules} from './schedules.js';

type Job=Pick<AppJobLease,'id'|'payload'>;
type Events={recordChanged?:(id:string)=>void;scheduleChanged?:(ownerId:string)=>void;notificationChanged?:(ownerId:string)=>void};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stale=(e:unknown)=>e instanceof AppStoreError&&[403,404,409,422].includes(e.status);
const nextDay=(date:string,days:number)=>new Date(calendarDate(date)+days*86400000).toISOString().slice(0,10);
function actor(reader:WalletReader,id:string):Actor|null {
 const legacy=reader.legacy,raw=legacy?null:reader.get('SELECT data FROM users WHERE id=?',id),user=legacy?legacy.users.find(v=>v.id===id):raw?JSON.parse(raw.data):undefined;
 return user&&!user.isDeleted&&[UserRole.ADMIN,UserRole.MEMBER].includes(user.role)?{userId:id,role:user.role}:null;
}
/** Select the current subject from owned rows, retaining the shared job lease
 * fence. No actor/role is accepted from a durable payload or an HTTP body. */
function asActor<T>(subject:Actor,id:string,fn:()=>T):T{return withAppCommandContext({...getAppCommandContext(),actorId:subject.userId,requestId:id},fn);}
export function createWalletScheduleJobs(options:{reader:WalletReader;write:typeof withAppWriteTransaction;schedules:ReturnType<typeof createWalletSchedules>;enqueue:(work:WalletScheduleWork)=>string;recordReminder:(notification:Notification)=>string;enabled:()=>boolean;now?:()=>number;batchSize?:number}){
 const reader=options.reader,store=openWalletStore({write:options.write}),clock=options.now??Date.now,limit=options.batchSize??100;integer(limit,1,100);
 const run=<T>(ctx:CommandContext,action:string,payload:unknown,fn:Parameters<typeof store.transaction<T>>[1])=>store.transaction({actorId:ctx.actor.userId,command:'wallet:schedule-work:'+action,requestId:ctx.idempotencyKey,payloadHash:hash({revision:ctx.expectedRevision,payload})},fn);
 const contextFor=(kind:'schedule'|'occurrence',id:string,jobId:string,revision:number):CommandContext|null=>{const row=reader.get('SELECT owner_id FROM '+(kind==='schedule'?'wallet_schedule_metadata WHERE schedule_id=?':'wallet_occurrence_metadata WHERE occurrence_id=?'),id),subject=row&&actor(reader,row.owner_id);return subject?{actor:subject,idempotencyKey:jobId,expectedRevision:revision}:null;};
 const validEpoch=(epoch:string)=>options.enabled()&&walletJobEpoch(reader).id===epoch;
 const result={
  enabled:options.enabled,
  epoch:()=>walletJobEpoch(reader).id,
  prepareSchedule(ctx:CommandContext,id:string,epoch:string,events:Events={}){
   if(!validEpoch(epoch))return {created:0,queuedConfirm:0,queuedReminder:0,limited:false};
   const created=options.schedules.materializeSchedule(ctx,id,()=>events.scheduleChanged?.(ctx.actor.userId)).created;
   return run(ctx,'queue',{id,epoch},tx=>{
    if(!validEpoch(epoch))throw new AppStoreError('Công việc thuộc trạng thái khôi phục cũ.',409,'wallet-schedule-stale-job');
    const config=options.schedules.getSchedule(ctx.actor,id),metadata=tx.sql.get('SELECT * FROM wallet_schedule_metadata WHERE schedule_id=?',id);if(config.revision!==ctx.expectedRevision)throw new AppStoreError('Lịch vừa thay đổi.',409);
    if(config.paused||config.archivedAt!==null)return {created,queuedConfirm:0,queuedReminder:0,limited:false};
    const time=clock(),at=new Date(time).toISOString(),today=effectiveDateAt(at,config.draft.recurrence.timezone),recovery=walletJobEpoch(reader),restoreDate=recovery.committedAt===null?null:effectiveDateAt(recovery.committedAt,config.draft.recurrence.timezone),dates=config.draft.reminderDays.map(day=>nextDay(today,day));
    const predicate="o.schedule_id=@schedule AND m.state='pending' AND(o.due_date IN(SELECT value FROM json_each(@dates)) OR(@automatic=1 AND o.due_date<=@today AND(@restore IS NULL OR o.due_date>@restore)))",bind={schedule:id,dates:JSON.stringify(dates),automatic:Number(config.mode==='automatic'),today,restore:restoreDate},cursor=metadata.work_cursor===null?null:JSON.parse(metadata.work_cursor);
    const query=(after:boolean)=>tx.sql.all('SELECT o.id,o.due_date,m.revision FROM wallet_occurrences o JOIN wallet_occurrence_metadata m ON m.occurrence_id=o.id WHERE '+predicate+(after?' AND(o.due_date>@date OR(o.due_date=@date AND o.id>@id))':'')+' ORDER BY o.due_date,o.id LIMIT '+(limit+1),{...bind,...(after?{date:cursor.date,id:cursor.id}:{})});
    let candidates=query(!!cursor);if(!candidates.length&&cursor)candidates=query(false);const limited=candidates.length>limit;candidates=candidates.slice(0,limit);let queuedConfirm=0,queuedReminder=0;
    for(const row of candidates){let slot:ReturnType<typeof options.schedules.getOccurrence>;try{slot=options.schedules.getOccurrence(ctx.actor,row.id);}catch(e){if(stale(e))continue;throw e;}const frozen=normalizeScheduleDraft(JSON.parse(tx.sql.get('SELECT draft_json FROM wallet_occurrence_metadata WHERE occurrence_id=?',row.id).draft_json));
     if(config.mode==='automatic'&&frozen.mode==='automatic'&&slot.dueDate<=today&&(restoreDate===null||slot.dueDate>restoreDate)){
      const key=epoch+':'+slot.id+':'+slot.revision+':confirm';if(!tx.sql.get("SELECT 1 FROM app_jobs WHERE namespace='wallet' AND type='occurrence-confirm' AND unique_key=?",key)){options.enqueue({type:'occurrence-confirm',key,payload:{occurrenceId:slot.id,revision:slot.revision,epoch}});queuedConfirm++;}
     }
     for(const offsetDays of config.draft.reminderDays){if(!frozen.reminderDays.includes(offsetDays)||nextDay(slot.dueDate,-offsetDays)!==today||restoreDate!==null&&today<=restoreDate)continue;
      if(tx.sql.get('SELECT 1 FROM wallet_schedule_reminders WHERE occurrence_id=? AND offset_days=? AND recipient_id=?',slot.id,offsetDays,ctx.actor.userId))continue;
      if(tx.sql.get('SELECT count(*) AS n FROM wallet_schedule_reminders').n>=100000)throw new AppStoreError('Kho nhắc hạn đã đầy.',413,'LIMIT_EXCEEDED');
      const jobId=options.enqueue({type:'occurrence-reminder',key:epoch+':'+slot.id+':'+offsetDays+':'+ctx.actor.userId,payload:{occurrenceId:slot.id,revision:slot.revision,recipientId:ctx.actor.userId,offsetDays,epoch}});
      tx.sql.run('INSERT INTO wallet_schedule_reminders VALUES(?,?,?,?,?,?,?)',slot.id,offsetDays,ctx.actor.userId,jobId,at,metadata.revision,JSON.stringify(config.draft.reminderDays));queuedReminder++;
     }
    }
    const last=candidates.at(-1);tx.sql.run('UPDATE wallet_schedule_metadata SET work_cursor=?,catchup_limited=? WHERE schedule_id=?',last?JSON.stringify({date:last.due_date,id:last.id}):null,Number(limited||metadata.catchup_limited),id);
    return {created,queuedConfirm,queuedReminder,limited:limited||!!metadata.catchup_limited};
   });
  },
  runOne(job:Job,signal:AbortSignal,events:Events={}){const p=object(job.payload);keys(p,['scheduleId','revision','epoch']);text(p.scheduleId,256);integer(p.revision,1);text(p.epoch,256);if(signal.aborted||!validEpoch(p.epoch))return;const ctx=contextFor('schedule',p.scheduleId,job.id+'-queue',p.revision);if(!ctx)return;try{return asActor(ctx.actor,job.id,()=>result.prepareSchedule(ctx,p.scheduleId as string,p.epoch as string,events));}catch(e){if(!stale(e))throw e;}},
  async runScan(job:Job,signal:AbortSignal,events:Events={}){
   if(signal.aborted||!options.enabled())return;const epoch=walletJobEpoch(reader).id,cursor=reader.get("SELECT value FROM app_meta WHERE key='wallet_schedule_scan_cursor'")?.value??'';let rows=reader.all('SELECT schedule_id AS id,revision FROM wallet_schedule_metadata WHERE archived_at IS NULL AND schedule_id>? ORDER BY schedule_id LIMIT 100',cursor);if(!rows.length&&cursor)rows=reader.all('SELECT schedule_id AS id,revision FROM wallet_schedule_metadata WHERE archived_at IS NULL ORDER BY schedule_id LIMIT 100');
   for(const row of rows){if(signal.aborted||!validEpoch(epoch))return;result.runOne({id:job.id+'-'+row.id,payload:{scheduleId:row.id,revision:row.revision,epoch}},signal,events);await yieldImmediate();}
   if(!signal.aborted&&validEpoch(epoch))options.write({actorId:'system:wallet-schedules',command:'wallet:schedule-work:scan-cursor',requestId:job.id,payloadHash:hash(rows.map(r=>r.id))},tx=>{if(walletJobEpoch({get:tx.get,all:tx.all}).id!==epoch)throw new AppStoreError('Công việc thuộc trạng thái khôi phục cũ.',409);tx.run("INSERT OR REPLACE INTO app_meta VALUES('wallet_schedule_scan_cursor',?)",rows.at(-1)?.id??'');return {scanned:rows.length};});
  },
  runAutomatic(job:Job,signal:AbortSignal,events:Events={}){const p=object(job.payload);keys(p,['occurrenceId','revision','epoch']);text(p.occurrenceId,256);integer(p.revision,1);text(p.epoch,256);if(signal.aborted||!validEpoch(p.epoch))return;const ctx=contextFor('occurrence',p.occurrenceId,job.id+'-confirm',p.revision);if(!ctx)return;try{return asActor(ctx.actor,job.id,()=>options.schedules.confirmAutomatic(ctx,p.occurrenceId as string,p.epoch as string,events.recordChanged));}catch(e){if(!stale(e))throw e;}},
  runReminder(job:Job,signal:AbortSignal,events:Events={}){
   const p=object(job.payload);keys(p,['occurrenceId','revision','recipientId','offsetDays','epoch']);text(p.occurrenceId,256);integer(p.revision,1);text(p.recipientId,256);integer(p.offsetDays,0,366);text(p.epoch,256);if(signal.aborted||!validEpoch(p.epoch))return;const ctx=contextFor('occurrence',p.occurrenceId,job.id+'-reminder',p.revision);if(!ctx||ctx.actor.userId!==p.recipientId)return;
   try{return asActor(ctx.actor,job.id,()=>run(ctx,'reminder',p,tx=>{
    if(signal.aborted||!validEpoch(p.epoch as string))throw new AppStoreError('Công việc đã kết thúc.',409);const slot=options.schedules.getOccurrence(ctx.actor,p.occurrenceId as string),parent=options.schedules.getSchedule(ctx.actor,slot.scheduleId),time=clock(),at=new Date(time).toISOString(),today=effectiveDateAt(at,slot.timezone),claim=tx.sql.get('SELECT * FROM wallet_schedule_reminders WHERE occurrence_id=? AND offset_days=? AND recipient_id=?',slot.id,p.offsetDays,p.recipientId);
    if(!claim||claim.job_id!==job.id||slot.revision!==p.revision||slot.state!=='pending'||parent.paused||parent.archivedAt!==null||!parent.draft.reminderDays.includes(p.offsetDays as number)||nextDay(slot.dueDate,-(p.offsetDays as number))!==today)return {delivered:false};
    const id=walletReminderId(slot.id,p.offsetDays as number,p.recipientId as string);options.recordReminder({id,userId:p.recipientId as string,title:'Lịch ghi chép tài chính',content:'Một kỳ ghi chép được lên lịch cho ngày '+slot.dueDate+'. Chỉ ghi sổ theo dõi; không chuyển tiền thật.',type:'finance',isRead:false,createdAt:at,sourceRef:{domain:'wallet-occurrence',id:slot.id,offsetDays:p.offsetDays as number}});if(events.notificationChanged)tx.afterCommit(()=>events.notificationChanged!(ctx.actor.userId));return {delivered:true,notificationId:id};
   }));}catch(e){if(!stale(e))throw e;}
  },
 };
 return result;
}
export function registerWalletScheduleJobs(jobs:AppJobs,engine:ReturnType<typeof createWalletScheduleJobs>,events:Events={}){
 if(!jobs.durableEnabled)return;
 const lease=(job:AppJobLease|undefined):AppJobLease=>{if(!job)throw Error('Durable Wallet lease required');return job;};
 jobs.registerAppJob('wallet','schedule-scan',(signal,job)=>{engine.runOne(lease(job),signal,events);});
 jobs.registerAppJob('wallet','occurrence-confirm',(signal,job)=>{engine.runAutomatic(lease(job),signal,events);});
 jobs.registerAppJob('wallet','occurrence-reminder',(signal,job)=>{engine.runReminder(lease(job),signal,events);});
 jobs.registerAppJob('wallet','schedule-scan-all',(signal,job)=>engine.runScan(lease(job),signal,events),{everyMs:60000,initialMs:1000,kind:'command',occurrenceKey:now=>engine.enabled()?engine.epoch()+':'+Math.floor(now.getTime()/60000):undefined});
}
