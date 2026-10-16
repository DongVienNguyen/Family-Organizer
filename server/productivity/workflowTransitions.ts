import {createHash,randomUUID}from'node:crypto';
import type {AppActor,AppCommand,QueryClock}from'../../src/features/productivity/contracts.js';
import {matchesFilter}from'../../src/features/productivity/filters.js';
import {utcInstant,localDateAt,timezoneFormatter}from'../../src/features/productivity/dates.js';
import {object,keys,text,integer}from'../../src/features/productivity/validation.js';
import {AppStoreError}from'../appErrors.js';
import type {withAppWriteTransaction}from'../appStore.js';
import {createTaskAccess,type TaskReader}from'./access.js';
import {assertContext}from'./tasks.js';
import {resolveBoardReference}from'./boardViewSchema.js';
import {projectTaskRecord}from'./query.js';
import type {SavedTaskView}from'./views.js';
import {savePilotTask}from'./store.js';
import {workflowColumn}from'./board.js';
import {TaskStatus}from'../../src/types.js';
export interface WorkflowTransitionPreviewInput{viewId:string;taskId:string;targetColumnId:string;timezone?:string}
export interface WorkflowTransitionApplyInput extends Omit<WorkflowTransitionPreviewInput,'timezone'>{previewId:string;expectedViewRevision:number;expectedBoardRevision:number}
interface Plan{actor:AppActor;viewId:string;viewRevision:number;boardId:string;boardRevision:number;taskId:string;taskRevision:number;targetColumnId:string;clock:QueryClock;day:string}
interface Ref{actor:AppActor;expiresAt:number;retireAt:number;bytes:number;plan?:Plan}
const activeTargets=['todo','doing','waiting']as const;
const ttl=15*60000,fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'workflow-transition');};
/** Active workflow transitions are an independent semantic command.
 * Review/Done, reward grants and reopen remain exclusively P10-owned. */
export function createWorkflowTransitions(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;views:{getView(actor:AppActor,id:string):SavedTaskView};now?:()=>number;previewLimit?:number;previewBytes?:number;afterWrite?:()=>void}){
 const now=ports.now??Date.now,refs=new Map<string,Ref>(),limit=ports.previewLimit??128,budget=ports.previewBytes??16*1024*1024;integer(limit,1,128);integer(budget,1,16*1024*1024);
 const syntax=(fn:()=>void)=>{try{fn();}catch{fail(400,'Dữ liệu chuyển trạng thái trong bảng không hợp lệ.');}};
 const scope=(actor:AppActor,input:WorkflowTransitionPreviewInput,r:TaskReader=ports.reader)=>{assertContext({actor,expectedRevision:0,requestId:'board:workflow:scope'},r);const saved=ports.views.getView(actor,input.viewId),config=saved.config;if(config.kind!=='kanban'||config.mode!=='workflow'||config.group!=='none'||config.boardId===undefined)throw new AppStoreError('Cần bảng trạng thái chuẩn.',422,'workflow-transition');const board=resolveBoardReference(r,actor,config.boardId,'workflow'),before=createTaskAccess(r).assertTaskCommand(actor,input.taskId,'update');if(before.listId!==board.list_id)fail(404,'Không tìm thấy công việc trong bảng.');const target=r.get('SELECT * FROM productivity_board_columns WHERE board_id=?AND id=?AND archived_at IS NULL',board.id,input.targetColumnId);if(!target)fail(404,'Không tìm thấy cột đích.');if(!activeTargets.includes(target.column_key))fail(422,'Trạng thái hoàn thành hoặc duyệt cần lệnh chuyên biệt.');return {saved,board,before,target,revision:r.get('SELECT revision FROM productivity_boards WHERE id=?',board.id).revision};};
 const available=(v:ReturnType<typeof scope>,clock:QueryClock)=>{if(!matchesFilter(projectTaskRecord(v.before),v.saved.filter,clock))fail(404,'Không tìm thấy công việc trong góc nhìn.');if(v.before.deletedAt!==null||v.before.pendingApproval||['completed','wont_do'].includes(v.before.lifecycle))fail(422,'Chỉ chuyển trạng thái công việc đang hoạt động.');if(workflowColumn(v.before)===v.target.column_key)fail(422,'Công việc đã ở trạng thái đích.');if(v.before.revision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản công việc đã đạt giới hạn.');};
 const prune=()=>{for(const [id,r]of refs)if(r.retireAt<=now())refs.delete(id);else if(r.expiresAt<=now()){delete r.plan;r.bytes=0;}};
 const after=(v:ReturnType<typeof scope>)=>({...v.before,lifecycle:v.target.column_key==='todo'?'todo' as const:v.target.column_key==='doing'?'in_progress' as const:v.before.lifecycle,blocked:v.target.column_key==='waiting',blockedReason:v.target.column_key==='waiting'?v.before.blockedReason:null});
 return {
  preview(actor:AppActor,input:WorkflowTransitionPreviewInput){
   syntax(()=>{keys(object(input),['viewId','taskId','targetColumnId','timezone']);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}for(const id of [input.viewId,input.taskId,input.targetColumnId])text(id,256);});const v=scope(actor,input),clock:QueryClock={nowUtc:new Date(now()).toISOString(),timezone:input.timezone??'Asia/Saigon'};available(v,clock);prune();if(refs.size>=limit)fail(429,'Bộ nhớ xem trước bảng đã đầy.');
   const plan:Plan={actor:structuredClone(actor),viewId:v.saved.id,viewRevision:v.saved.revision,boardId:v.board.id,boardRevision:v.revision,taskId:v.before.id,taskRevision:v.before.revision,targetColumnId:input.targetColumnId,clock,day:localDateAt(utcInstant(clock.nowUtc),clock.timezone)},bytes=Buffer.byteLength(JSON.stringify(plan));if(bytes+[...refs.values()].reduce((n,r)=>n+r.bytes,0)>budget)fail(429,'Bộ nhớ xem trước bảng đã đầy.');const id=randomUUID(),expiresAt=now()+ttl;refs.set(id,{actor:structuredClone(actor),expiresAt,retireAt:expiresAt+ttl,bytes,plan});const {actor:_actor,day:_day,...publicPlan}=plan;return structuredClone({...publicPlan,id,operation:'transition' as const,before:projectTaskRecord(v.before),after:projectTaskRecord(after(v)),expiresAt:new Date(expiresAt).toISOString()});
  },
  apply(ctx:AppCommand,input:WorkflowTransitionApplyInput){
   syntax(()=>{keys(object(input),['viewId','taskId','targetColumnId','previewId','expectedViewRevision','expectedBoardRevision']);for(const id of [input.viewId,input.taskId,input.targetColumnId,input.previewId])text(id,256);integer(input.expectedViewRevision,1);integer(input.expectedBoardRevision,1);});
   scope(ctx.actor,input);const committed=ports.write({actorId:ctx.actor.userId,command:'productivity:board:workflow:transition',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({expectedRevision:ctx.expectedRevision,input})).digest('hex')},tx=>{
    const v=scope(ctx.actor,input,tx);prune();const ref=refs.get(input.previewId);if(!ref||ref.actor.userId!==ctx.actor.userId||ref.actor.role!==ctx.actor.role)fail(404,'Không tìm thấy bản xem trước bảng.');if(ref.expiresAt<=now()||!ref.plan)fail(409,'Bản xem trước bảng đã hết hạn.');const p=ref.plan;if(p.viewId!==input.viewId||p.taskId!==input.taskId||p.targetColumnId!==input.targetColumnId)fail(404,'Không tìm thấy bản xem trước bảng.');
    const clock:QueryClock={...p.clock,nowUtc:new Date(now()).toISOString()};if(p.viewRevision!==v.saved.revision||p.viewRevision!==input.expectedViewRevision||p.boardRevision!==v.revision||p.boardRevision!==input.expectedBoardRevision||p.taskRevision!==v.before.revision||p.taskRevision!==ctx.expectedRevision||localDateAt(utcInstant(clock.nowUtc),clock.timezone)!==p.day)fail(409,'Bảng hoặc công việc đã thay đổi; xem trước lại.');available(v,clock);
    const task=after(v),user=assertContext(ctx,tx),changedAt=new Date(now()).toISOString();task.revision++;task.legacy=structuredClone(task.legacy);task.legacy.status=task.lifecycle==='in_progress'?TaskStatus.IN_PROGRESS:TaskStatus.TODO;task.legacy.updatedAt=changedAt;task.legacy.history.push({id:randomUUID(),userId:user.id,username:user.username,action:'Chuyển trạng thái công việc: '+v.target.column_key,createdAt:changedAt});
    // The canonical store enforces every board's full-scope WIP and updates all
    // Task projections under this same I01 transaction, including rollback.
    savePilotTask(tx,task,ctx.actor);const position=tx.get('SELECT c.id,c.column_key FROM productivity_board_positions p JOIN productivity_board_columns c ON c.board_id=p.board_id AND c.id=p.column_id WHERE p.board_id=?AND p.task_id=?',v.board.id,task.id);if(!position||position.column_key!==v.target.column_key)fail(409,'Vị trí bảng không khớp trạng thái công việc.');ports.afterWrite?.();return {task:projectTaskRecord(task),actualColumn:position.column_key as 'todo'|'doing'|'waiting',viewId:v.saved.id,boardId:v.board.id,boardRevision:tx.get('SELECT revision FROM productivity_boards WHERE id=?',v.board.id).revision,columnId:position.id};
   });
   return committed;
  },
 };
}
