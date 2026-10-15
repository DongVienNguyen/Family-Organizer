import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {AppActor,AppCommand,Quadrant,TaskPatch,TaskRecord,QueryClock} from '../../src/features/productivity/contracts.js';
import {assertTaskRecord} from '../../src/features/productivity/contracts.js';
import {classifyMatrix,proposeMatrixMove,type MatrixConfig,type MatrixProjection} from '../../src/features/productivity/matrix.js';
import {matchesFilter} from '../../src/features/productivity/filters.js';
import {timezoneFormatter,utcInstant,localDateAt} from '../../src/features/productivity/dates.js';
import {object,keys,text,integer,choice,boolean} from '../../src/features/productivity/validation.js';
import {createTaskAccess,taskScope,type TaskReader} from './access.js';
import {assertContext,updateTaskWithinTransaction} from './tasks.js';
import {createTaskViews,type SavedTaskView} from './views.js';
import {assertTagSelection} from './tagPolicy.js';
import {projectTaskRecord} from './query.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {UserRole} from '../../src/types.js';
export interface MatrixPreviewInput {viewId:string;taskId:string;target:Quadrant;mode:'attributes'|'view_pin';timezone?:string;choice?:TaskPatch;pinExpiresAt?:string|null}
export interface MatrixApplyInput {viewId:string;taskId:string;previewId:string;expectedViewRevision:number;confirmedDue:boolean;mode:'attributes'|'view_pin'}
export interface MatrixPin {quadrant:Quadrant;viewRevision:number;revision:number;expiresAt:string|null}
export interface MatrixPlan {id:string;viewId:string;taskId:string;taskRevision:number;viewRevision:number;clock:QueryClock;expiresAt:string;target:Quadrant;mode:'attributes'|'view_pin';patch:TaskPatch;needsChoice:boolean;warnings:string[];before:TaskRecord;after:TaskRecord}
export interface MatrixResult {viewId:string;target:Quadrant;mode:'attributes'|'view_pin';task:TaskRecord;taskChanged:boolean;pin:MatrixPin|null;pinRevision:number;delta:Record<string,{before:unknown;after:unknown}>;pinDelta:{before:MatrixPin|null;after:MatrixPin|null}}
interface StoredPlan {actor:AppActor;viewId:string;taskId:string;taskRevision:number;viewRevision:number;clock:QueryClock;day:string;target:Quadrant;mode:'attributes'|'view_pin';patch:TaskPatch;requiresCustomChoice:boolean;dueChange:boolean;pinRevision:number;pinExpiresAt:string|null}
interface PreviewRef {actor:AppActor;expiresAt:number;retireAt:number;bytes:number;plan?:StoredPlan}
export const matrixPreviewLimits=Object.freeze({references:256,bytes:16*1024*1024,ttlMs:5*60000,expiredIdentityMs:5*60000});
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'matrix-command');};
const nextPinRevision=(before:number)=>{if(before>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản ghim đã đạt giới hạn.');return before+1;};
const stale=()=>fail(409,'Bản xem trước đã thay đổi hoặc hết hạn; vui lòng xem lại.');
const input=<T>(work:()=>T):T=>{try{return work();}catch(error){if(error instanceof AppStoreError)throw error;return fail(400,'Dữ liệu Matrix không hợp lệ.');}};
export function validateMatrixApplyInput(value:unknown):asserts value is MatrixApplyInput {input(()=>{const packet=object(value);keys(packet,['viewId','taskId','previewId','expectedViewRevision','confirmedDue','mode']);for(const field of ['viewId','taskId','previewId'])text(packet[field],256);integer(packet.expectedViewRevision,1);boolean(packet.confirmedDue);choice(packet.mode,['attributes','view_pin']);});}
export function createMatrixCommands(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;now?:()=>number;previewLimit?:number;afterWrite?:()=>void}){
 const now=ports.now??Date.now,limit=ports.previewLimit??matrixPreviewLimits.references,previews=new Map<string,PreviewRef>();integer(limit,1,matrixPreviewLimits.references);
 const clock=(timezone='Asia/Saigon'):QueryClock=>input(()=>{text(timezone,100);timezoneFormatter(timezone);return {nowUtc:new Date(now()).toISOString(),timezone};});
 const context=(actor:AppActor,reader:TaskReader=ports.reader)=>{assertContext({actor,expectedRevision:0,requestId:'matrix:read'},reader);if(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version!==6)fail(409,'Cần migration Matrix trước khi dùng.');};
 const writable=(actor:AppActor,reader:TaskReader=ports.reader)=>{context(actor,reader);if(actor.role===UserRole.GUEST)fail(403,'Khách chỉ có quyền xem Matrix.');};
 const view=(actor:AppActor,id:string,reader:TaskReader=ports.reader):SavedTaskView&{config:MatrixConfig}=>{context(actor,reader);input(()=>text(id,256));const value=createTaskViews({reader,write:ports.write}).getView(actor,id);if(value.kind!=='matrix'||value.config.kind!=='matrix')fail(422,'Góc nhìn này không phải Matrix.');return value as SavedTaskView&{config:MatrixConfig};};
 const readTask=(actor:AppActor,id:string,reader:TaskReader=ports.reader):TaskRecord=>{input(()=>text(id,256));const row=createTaskAccess(reader).getTask(actor,id);if(!row)fail(404,'Không tìm thấy công việc.');return projectTaskRecord(row);};
 const pin=(reader:TaskReader,viewId:string,taskId:string):MatrixPin|null=>{const row=reader.get('SELECT quadrant,view_revision,revision,expires_at FROM productivity_matrix_overrides WHERE view_id=? AND task_id=?',viewId,taskId);if(!row)return null;choice(row.quadrant,['q1','q2','q3','q4']);integer(row.view_revision,1);integer(row.revision,1);if(row.expires_at!==null)utcInstant(row.expires_at);return {quadrant:row.quadrant,viewRevision:row.view_revision,revision:row.revision,expiresAt:row.expires_at};};
 const prune=()=>{const instant=now();for(const[id,ref]of previews){if(ref.retireAt<=instant)previews.delete(id);else if(ref.expiresAt<=instant){ref.plan=undefined;ref.bytes=0;}}};
 const delta=(before:TaskRecord,patch:TaskPatch)=>Object.fromEntries(Object.entries(patch).filter(([field,value])=>!isDeepStrictEqual(before[field as keyof TaskRecord],value)).map(([field,value])=>[field,{before:before[field as keyof TaskRecord],after:value}]));
 const command=<T>(ctx:AppCommand,name:string,payload:unknown,work:(tx:AppWriteTx)=>T)=>ports.write({actorId:ctx.actor.userId,command:'productivity:matrix:'+name,requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({expectedRevision:ctx.expectedRevision,payload})).digest('hex')},work);
 return {
  project(actor:AppActor,viewId:string,timezone='Asia/Saigon'):MatrixProjection&{viewId:string;viewRevision:number;clock:QueryClock;pins:Record<string,MatrixPin>;ignoredPins:Record<string,string>}{
   const saved=view(actor,viewId),captured=clock(timezone),rows=createTaskAccess(ports.reader).listTasks(actor).map(projectTaskRecord).filter(task=>matchesFilter(task,saved.filter,captured)),projection=classifyMatrix(rows,saved.config,captured),visible=new Map([...Object.values(projection.quadrants).flat(),...projection.unmatched].map(row=>[row.id,row])),pins:Record<string,MatrixPin>=Object.create(null),ignoredPins:Record<string,string>=Object.create(null),scope=taskScope(actor);
   for(const row of ports.reader.all('SELECT o.task_id FROM productivity_matrix_overrides o JOIN productivity_tasks t ON t.id=o.task_id WHERE o.view_id=? AND ('+scope.sql+') ORDER BY o.task_id',viewId,...scope.args)){
    const task=visible.get(row.task_id);if(!task)continue;const override=pin(ports.reader,viewId,task.id)!;
    if(override.viewRevision!==saved.revision){ignoredPins[task.id]='stale-config';continue;}
    if(override.expiresAt!==null&&utcInstant(override.expiresAt)<=utcInstant(captured.nowUtc)){ignoredPins[task.id]='expired';continue;}
    for(const q of ['q1','q2','q3','q4']as const)projection.quadrants[q]=projection.quadrants[q].filter(row=>row.id!==task.id);projection.unmatched=projection.unmatched.filter(row=>row.id!==task.id);projection.quadrants[override.quadrant].push(task);pins[task.id]=override;
   }
   return {...projection,viewId,viewRevision:saved.revision,clock:captured,pins,ignoredPins};
  },
  preview(actor:AppActor,packet:MatrixPreviewInput):MatrixPlan {
   writable(actor);input(()=>{const value=object(packet);keys(value,['viewId','taskId','target','mode','timezone','choice','pinExpiresAt']);choice(packet.target,['q1','q2','q3','q4']);choice(packet.mode,['attributes','view_pin']);});
   const saved=view(actor,packet.viewId),before=readTask(actor,packet.taskId),captured=clock(packet.timezone);if(!matchesFilter(before,saved.filter,captured))fail(404,'Không tìm thấy công việc trong góc nhìn.');
   if(packet.mode==='attributes')createTaskAccess(ports.reader).assertTaskCommand(actor,packet.taskId,'update');
   if(before.lifecycle==='completed'||before.lifecycle==='wont_do')fail(422,'Không di chuyển công việc đã kết thúc.');
   const proposed=proposeMatrixMove(before,saved.config,captured,packet.target,packet.mode);let patch=proposed.patch,requiresCustomChoice=saved.config.preset==='custom'&&packet.mode==='attributes'&&packet.choice===undefined;
   if(packet.choice!==undefined){if(packet.mode!=='attributes')fail(400,'Ghim không nhận thay đổi thuộc tính.');input(()=>keys(object(packet.choice),['priority','due','assigneeId','tagIds']));patch=structuredClone(packet.choice);}
   if(patch.tagIds!==undefined)assertTagSelection(ports.reader,actor,patch.tagIds);
   if(patch.assigneeId!==undefined&&patch.assigneeId!==before.assigneeId){if(actor.role===UserRole.CHILD&&before.rewardPoints>0)fail(403,'Không được đổi người nhận công việc có thưởng.');if(patch.assigneeId!==null){const user=ports.reader.get('SELECT data FROM users WHERE id=?',patch.assigneeId);if(!user||JSON.parse(user.data).isDeleted)fail(422,'Người được giao không hợp lệ.');}}
   const after={...before,...structuredClone(patch)};input(()=>assertTaskRecord(after));
   if(packet.mode==='attributes'&&!requiresCustomChoice&&classifyMatrix([after],saved.config,captured).matches[before.id]?.[0]!==packet.target)fail(422,'Thuộc tính được chọn không đưa công việc vào ô đích.');
   const pinExpiresAt=packet.pinExpiresAt??null;if(pinExpiresAt!==null){input(()=>utcInstant(pinExpiresAt));if(packet.mode!=='view_pin'||utcInstant(pinExpiresAt)<=utcInstant(captured.nowUtc))fail(422,'Thời hạn ghim không hợp lệ.');}
   const changes=delta(before,patch),dueChange=Object.hasOwn(changes,'due'),warnings=[...proposed.warnings.filter(warning=>warning!=='deadline-change'&&warning!=='custom-rule-choice'),...(requiresCustomChoice?['custom-rule-choice']:[]),...(dueChange?['deadline-change']:[])],stored:StoredPlan={actor:structuredClone(actor),viewId:saved.id,taskId:before.id,taskRevision:before.revision,viewRevision:saved.revision,clock:captured,day:localDateAt(utcInstant(captured.nowUtc),captured.timezone),target:packet.target,mode:packet.mode,patch:structuredClone(patch),requiresCustomChoice,dueChange,pinRevision:pin(ports.reader,saved.id,before.id)?.revision??0,pinExpiresAt};
   prune();const bytes=Buffer.byteLength(JSON.stringify(stored));if(previews.size>=limit||[...previews.values()].reduce((sum,ref)=>sum+ref.bytes,0)+bytes>matrixPreviewLimits.bytes)fail(429,'Bộ nhớ xem trước Matrix đã đầy; thử lại sau.');
   const id=randomUUID(),expiresAt=now()+matrixPreviewLimits.ttlMs;previews.set(id,{actor:structuredClone(actor),expiresAt,retireAt:expiresAt+matrixPreviewLimits.expiredIdentityMs,bytes,plan:stored});
   return structuredClone({id,viewId:saved.id,taskId:before.id,taskRevision:before.revision,viewRevision:saved.revision,clock:captured,expiresAt:new Date(expiresAt).toISOString(),target:packet.target,mode:packet.mode,patch,needsChoice:requiresCustomChoice||dueChange,warnings,before,after});
  },
  apply(ctx:AppCommand,packet:MatrixApplyInput):MatrixResult {
   validateMatrixApplyInput(packet);
   writable(ctx.actor);view(ctx.actor,packet.viewId);readTask(ctx.actor,packet.taskId);if(packet.mode==='attributes')createTaskAccess(ports.reader).assertTaskCommand(ctx.actor,packet.taskId,'update');
   // Cache lookup remains inside I01. Fresh ACL above also guards a successful retry
   // after process-local previews disappear; a new request still needs a live token.
   return command(ctx,'apply',packet,tx=>{
    writable(ctx.actor,tx);const saved=view(ctx.actor,packet.viewId,tx),before=readTask(ctx.actor,packet.taskId,tx),ref=previews.get(packet.previewId);
    if(!ref||ref.actor.userId!==ctx.actor.userId||ref.actor.role!==ctx.actor.role)fail(404,'Không tìm thấy bản xem trước.');if(ref.expiresAt<=now()||!ref.plan)stale();const plan=ref.plan;
    if(plan.viewId!==packet.viewId||plan.taskId!==packet.taskId||plan.mode!==packet.mode)fail(404,'Không tìm thấy bản xem trước.');
    const captured=clock(plan.clock.timezone);if(plan.day!==localDateAt(utcInstant(captured.nowUtc),captured.timezone)||saved.revision!==plan.viewRevision||packet.expectedViewRevision!==plan.viewRevision||before.revision!==plan.taskRevision||ctx.expectedRevision!==plan.taskRevision||(pin(tx,saved.id,before.id)?.revision??0)!==plan.pinRevision)stale();
    if(!matchesFilter(before,saved.filter,captured))stale();if(plan.requiresCustomChoice||plan.dueChange&&!packet.confirmedDue)fail(422,'Cần chọn rõ thay đổi trước khi áp dụng.');
    if(plan.pinExpiresAt!==null&&utcInstant(plan.pinExpiresAt)<=utcInstant(captured.nowUtc))stale();
    const prior=pin(tx,saved.id,before.id);let next=prior,task=before;const changes=delta(before,plan.patch);
    if(plan.mode==='view_pin'){
     next={quadrant:plan.target,viewRevision:saved.revision,revision:nextPinRevision(prior?.revision??0),expiresAt:plan.pinExpiresAt};tx.run('INSERT INTO productivity_matrix_overrides VALUES(?,?,?,?,?,?) ON CONFLICT(view_id,task_id) DO UPDATE SET quadrant=excluded.quadrant,view_revision=excluded.view_revision,revision=excluded.revision,expires_at=excluded.expires_at',saved.id,before.id,next.quadrant,next.viewRevision,next.revision,next.expiresAt);
    }else{
     createTaskAccess(tx).assertTaskCommand(ctx.actor,before.id,'update');if(classifyMatrix([{...before,...plan.patch}],saved.config,captured).matches[before.id]?.[0]!==plan.target)fail(422,'Thuộc tính không còn phù hợp với ô đích.');
     if(Object.keys(changes).length)task=projectTaskRecord(updateTaskWithinTransaction(tx,ctx,before.id,plan.patch));
     if(prior){next={...prior,viewRevision:saved.revision,revision:nextPinRevision(prior.revision),expiresAt:captured.nowUtc};tx.run('UPDATE productivity_matrix_overrides SET view_revision=?,revision=?,expires_at=? WHERE view_id=? AND task_id=?',next.viewRevision,next.revision,next.expiresAt,saved.id,before.id);}
    }
    ports.afterWrite?.();const active=next!==null&&next.viewRevision===saved.revision&&(next.expiresAt===null||utcInstant(next.expiresAt)>utcInstant(captured.nowUtc));
    return {viewId:saved.id,target:plan.target,mode:plan.mode,task,taskChanged:task.revision!==before.revision,pin:active?next:null,pinRevision:next?.revision??0,delta:changes,pinDelta:{before:prior,after:next}};
   });
  },
  resetPin(ctx:AppCommand,packet:{viewId:string;taskId:string;expectedPinRevision:number}):{viewId:string;taskId:string;pin:null;pinRevision:number;pinDelta:{before:MatrixPin|null;after:MatrixPin|null}}{
   input(()=>{keys(object(packet),['viewId','taskId','expectedPinRevision']);integer(packet.expectedPinRevision);});writable(ctx.actor);view(ctx.actor,packet.viewId);readTask(ctx.actor,packet.taskId);
   return command(ctx,'reset-pin',packet,tx=>{writable(ctx.actor,tx);const saved=view(ctx.actor,packet.viewId,tx);readTask(ctx.actor,packet.taskId,tx);const prior=pin(tx,saved.id,packet.taskId);if((prior?.revision??0)!==packet.expectedPinRevision)stale();const retired=prior?{...prior,viewRevision:saved.revision,revision:nextPinRevision(prior.revision),expiresAt:clock().nowUtc}:null;if(retired)tx.run('UPDATE productivity_matrix_overrides SET view_revision=?,revision=?,expires_at=? WHERE view_id=? AND task_id=?',retired.viewRevision,retired.revision,retired.expiresAt,saved.id,packet.taskId);ports.afterWrite?.();return {viewId:saved.id,taskId:packet.taskId,pin:null,pinRevision:retired?.revision??0,pinDelta:{before:prior,after:retired}};});
  },
 };
}
