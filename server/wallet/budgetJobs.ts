import {createHash} from 'node:crypto';
import {setImmediate as yieldImmediate} from 'node:timers/promises';
import type {Actor} from '../../src/features/wallet/contracts.js';
import type {Notification} from '../../src/types.js';
import {UserRole} from '../../src/types.js';
import {object,keys,text,integer} from '../../src/features/productivity/validation.js';
import {effectiveDateAt,resolvePeriod} from '../../src/features/wallet/dates.js';
import type {AppJobs} from '../appJobs.js';
import type {AppJobLease} from '../jobStore.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {getAppCommandContext,withAppCommandContext} from '../commandContext.js';
import {AppStoreError} from '../appErrors.js';
import type {WalletReader} from './access.js';
import {openWalletStore} from './store.js';
import type {createWalletBudgets} from './budgets.js';
import {walletJobEpoch} from './jobIdentity.js';
import {walletBudgetAlertId,type WalletBudgetWork} from './budgetJobIdentity.js';
type Job=Pick<AppJobLease,'id'|'payload'>;
type Events={notificationChanged?:(ownerId:string)=>void};
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const stale=(e:unknown)=>e instanceof AppStoreError&&[403,404,409,422].includes(e.status);
function actor(reader:WalletReader,id:string):Actor|null {const legacy=reader.legacy,stored=legacy?null:reader.get('SELECT data FROM users WHERE id=?',id),user=legacy?legacy.users.find(v=>v.id===id):stored?JSON.parse(stored.data):null;return user&&!user.isDeleted&&[UserRole.ADMIN,UserRole.MEMBER].includes(user.role)?{userId:id,role:user.role}:null;}
const asActor=<T>(subject:Actor,id:string,fn:()=>T)=>withAppCommandContext({...getAppCommandContext(),actorId:subject.userId,requestId:id},fn);
/** Reference-only work uses the existing durable registry, restore epoch and
 * lease-fenced I01 writer. A scan enqueues bounded work rather than running many
 * report calculations inside one lease. Delivery uses the shared inbox/outbox. */
export function createWalletBudgetJobs(options:{reader:WalletReader;write:typeof withAppWriteTransaction;budgets:ReturnType<typeof createWalletBudgets>;enqueue:(work:WalletBudgetWork)=>string;recordAlert:(notification:Notification)=>string;enabled:()=>boolean;now?:()=>number}){
 const reader=options.reader,clock=options.now??Date.now,store=openWalletStore({write:options.write}),valid=(epoch:string)=>options.enabled()&&walletJobEpoch(reader).id===epoch;
 const result={enabled:options.enabled,epoch:()=>walletJobEpoch(reader).id,
  runOne(job:Job,signal:AbortSignal){const p=object(job.payload);keys(p,['budgetId','revision','epoch']);text(p.budgetId,256);integer(p.revision,1);text(p.epoch,256);if(signal.aborted||!valid(p.epoch))return;const row=reader.get('SELECT owner_id FROM wallet_budgets WHERE id=?',p.budgetId),subject=row&&actor(reader,row.owner_id);if(!subject)return;
   try{return asActor(subject,job.id,()=>{const budget=options.budgets.getBudget(subject,p.budgetId as string),today=effectiveDateAt(new Date(clock()).toISOString(),budget.timezone),restore=walletJobEpoch(reader);if(restore.committedAt!==null&&today<=effectiveDateAt(restore.committedAt,budget.timezone))return;const period=resolvePeriod({kind:'month',anchorDate:today},budget.timezone);return options.budgets.claimAlerts({actor:subject,idempotencyKey:job.id+'-claim',expectedRevision:p.revision as number},budget.id,period,p.epoch as string);});}catch(e){if(!stale(e))throw e;}
  },
  runAlert(job:Job,signal:AbortSignal,events:Events={}){const p=object(job.payload);keys(p,['claimId','epoch']);text(p.claimId,256);text(p.epoch,256);if(signal.aborted||!valid(p.epoch))return;const row=reader.get('SELECT recipient_id FROM wallet_budget_alert_claims WHERE id=?',p.claimId),subject=row&&actor(reader,row.recipient_id);if(!subject)return;
   try{return asActor(subject,job.id,()=>store.transaction({actorId:subject.userId,command:'wallet:budget-work:notice',requestId:job.id+'-notice',payloadHash:hash(p)},tx=>{if(signal.aborted||!valid(p.epoch as string))throw new AppStoreError('Công việc thuộc trạng thái khôi phục cũ.',409,'wallet-budget-stale-job');if(!options.budgets.canDeliverAlert(subject,p.claimId as string))return {delivered:false};const claim=options.budgets.getAlert(subject,p.claimId as string),id=walletBudgetAlertId(claim.id,subject.userId),at=new Date(clock()).toISOString();options.recordAlert({id,userId:subject.userId,title:'Ngân sách Wallet',content:'Một ngân sách đã chạm ngưỡng '+claim.threshold+'% trong kỳ '+claim.period.fromDate+'. Mở ngân sách để xem số thực tế và phần dự kiến.',type:'finance',isRead:false,createdAt:at,sourceRef:{domain:'wallet-budget',id:claim.id}});if(events.notificationChanged)tx.afterCommit(()=>events.notificationChanged!(subject.userId));return {delivered:true,notificationId:id};}));}catch(e){if(!stale(e))throw e;}
  },
  async runScan(job:Job,signal:AbortSignal){if(signal.aborted||!options.enabled())return;const epoch=walletJobEpoch(reader).id,cursor=reader.get("SELECT value FROM app_meta WHERE key='wallet_budget_scan_cursor'")?.value??'';let rows=reader.all('SELECT id,revision FROM wallet_budgets WHERE archived_at IS NULL AND id>? ORDER BY id LIMIT 100',cursor);if(!rows.length&&cursor)rows=reader.all('SELECT id,revision FROM wallet_budgets WHERE archived_at IS NULL ORDER BY id LIMIT 100');
   options.write({actorId:'system:wallet-budgets',command:'wallet:budget-work:scan-cursor',requestId:job.id,payloadHash:hash({epoch,rows})},tx=>{if(signal.aborted||walletJobEpoch({get:tx.get,all:tx.all}).id!==epoch)throw new AppStoreError('Công việc thuộc trạng thái khôi phục cũ.',409);for(const row of rows)options.enqueue({type:'budget-scan',key:epoch+':'+row.id+':'+row.revision+':'+job.id,payload:{budgetId:row.id,revision:row.revision,epoch}});tx.run("INSERT OR REPLACE INTO app_meta VALUES('wallet_budget_scan_cursor',?)",rows.at(-1)?.id??'');return {queued:rows.length};});await yieldImmediate();
  },
 };return result;
}
export function registerWalletBudgetJobs(jobs:AppJobs,engine:ReturnType<typeof createWalletBudgetJobs>,events:Events={}){
 if(!jobs.durableEnabled)return;const lease=(job:AppJobLease|undefined)=>{if(!job)throw Error('Durable Wallet budget lease required');return job;};
 jobs.registerAppJob('wallet','budget-scan',(signal,job)=>{engine.runOne(lease(job),signal);});
 jobs.registerAppJob('wallet','budget-alert',(signal,job)=>{engine.runAlert(lease(job),signal,events);});
 jobs.registerAppJob('wallet','budget-scan-all',(signal,job)=>engine.runScan(lease(job),signal),{everyMs:60000,initialMs:1000,kind:'command',occurrenceKey:now=>engine.enabled()?engine.epoch()+':'+Math.floor(now.getTime()/60000):undefined});
}
