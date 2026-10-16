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
import {createCompletionCommands,type TaskCompletionProof}from'./completion.js';
export interface WorkflowPreviewInput{viewId:string;taskId:string;targetColumnId:string;timezone?:string}
export interface WorkflowApplyInput extends Omit<WorkflowPreviewInput,'timezone'>{previewId:string;expectedViewRevision:number;expectedBoardRevision:number}
interface Plan{actor:AppActor;viewId:string;viewRevision:number;boardId:string;boardRevision:number;taskId:string;taskRevision:number;targetColumnId:string;clock:QueryClock;day:string}
interface Ref{actor:AppActor;expiresAt:number;retireAt:number;bytes:number;plan?:Plan}
const ttl=15*60000,fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'workflow-move');};
/** Complete intent uses the existing P10 owner inside one I01 transaction.
 * It never writes a guessed completed state or a derived Review destination. */
export function createWorkflowMoves(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;views:{getView(actor:AppActor,id:string):SavedTaskView};legacy:Parameters<typeof createCompletionCommands>[0]['legacy'];now?:()=>number;previewLimit?:number;previewBytes?:number;afterWrite?:()=>void}){
 const now=ports.now??Date.now,refs=new Map<string,Ref>(),limit=ports.previewLimit??128,budget=ports.previewBytes??16*1024*1024,events=new WeakMap<object,string[]>();integer(limit,1,128);integer(budget,1,16*1024*1024);
 const syntax=(fn:()=>void)=>{try{fn();}catch{fail(400,'Dữ liệu hoàn thành trong bảng không hợp lệ.');}};
 const scope=(actor:AppActor,input:WorkflowPreviewInput,r:TaskReader=ports.reader)=>{assertContext({actor,expectedRevision:0,requestId:'board:workflow:scope'},r);const saved=ports.views.getView(actor,input.viewId),config=saved.config;if(config.kind!=='kanban'||config.mode!=='workflow'||config.group!=='none'||config.boardId===undefined)throw new AppStoreError('Cần bảng trạng thái chuẩn.',422,'workflow-move');const board=resolveBoardReference(r,actor,config.boardId,'workflow'),before=createTaskAccess(r).assertTaskCommand(actor,input.taskId,'update');if(before.listId!==board.list_id)fail(404,'Không tìm thấy công việc trong bảng.');const target=r.get('SELECT * FROM productivity_board_columns WHERE board_id=?AND id=?AND archived_at IS NULL',board.id,input.targetColumnId);if(!target)fail(404,'Không tìm thấy cột đích.');if(target.column_key!=='done')fail(422,'Cột chờ duyệt được suy ra từ kết quả hoàn thành.');return {saved,board,before,revision:r.get('SELECT revision FROM productivity_boards WHERE id=?',board.id).revision};};
 const available=(v:ReturnType<typeof scope>,clock:QueryClock)=>{if(!matchesFilter(projectTaskRecord(v.before),v.saved.filter,clock))fail(404,'Không tìm thấy công việc trong góc nhìn.');if(v.before.deletedAt!==null||v.before.pendingApproval||['completed','wont_do'].includes(v.before.lifecycle))fail(422,'Công việc không đang chờ hoàn thành.');};
 const prune=()=>{for(const [id,r]of refs)if(r.retireAt<=now())refs.delete(id);else if(r.expiresAt<=now()){delete r.plan;r.bytes=0;}};
 return {
  spawnedForEvents(result:object){return [...(events.get(result)??[])];},
  preview(actor:AppActor,input:WorkflowPreviewInput){
   syntax(()=>{keys(object(input),['viewId','taskId','targetColumnId','timezone']);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}for(const id of [input.viewId,input.taskId,input.targetColumnId])text(id,256);});const v=scope(actor,input),clock:QueryClock={nowUtc:new Date(now()).toISOString(),timezone:input.timezone??'Asia/Saigon'};available(v,clock);prune();if(refs.size>=limit)fail(429,'Bộ nhớ xem trước bảng đã đầy.');
   const plan:Plan={actor:structuredClone(actor),viewId:v.saved.id,viewRevision:v.saved.revision,boardId:v.board.id,boardRevision:v.revision,taskId:v.before.id,taskRevision:v.before.revision,targetColumnId:input.targetColumnId,clock,day:localDateAt(utcInstant(clock.nowUtc),clock.timezone)},bytes=Buffer.byteLength(JSON.stringify(plan));if(bytes+[...refs.values()].reduce((n,r)=>n+r.bytes,0)>budget)fail(429,'Bộ nhớ xem trước bảng đã đầy.');const id=randomUUID(),expiresAt=now()+ttl;refs.set(id,{actor:structuredClone(actor),expiresAt,retireAt:expiresAt+ttl,bytes,plan});const {actor:_actor,day:_day,...publicPlan}=plan;return structuredClone({...publicPlan,id,operation:'complete' as const,before:projectTaskRecord(v.before),expiresAt:new Date(expiresAt).toISOString()});
  },
  apply(ctx:AppCommand,input:WorkflowApplyInput,proof:TaskCompletionProof={}){
   syntax(()=>{keys(object(input),['viewId','taskId','targetColumnId','previewId','expectedViewRevision','expectedBoardRevision']);for(const id of [input.viewId,input.taskId,input.targetColumnId,input.previewId])text(id,256);integer(input.expectedViewRevision,1);integer(input.expectedBoardRevision,1);keys(object(proof),['proofImage','proofNote']);for(const [key,value]of Object.entries(proof))if(value!==null)text(value,key==='proofNote'?8000:6*1024*1024,false);});
   scope(ctx.actor,input);const committed=ports.write({actorId:ctx.actor.userId,command:'productivity:board:workflow:complete',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({expectedRevision:ctx.expectedRevision,input,proof})).digest('hex')},tx=>{
    const v=scope(ctx.actor,input,tx);prune();const ref=refs.get(input.previewId);if(!ref||ref.actor.userId!==ctx.actor.userId||ref.actor.role!==ctx.actor.role)fail(404,'Không tìm thấy bản xem trước bảng.');if(ref.expiresAt<=now()||!ref.plan)fail(409,'Bản xem trước bảng đã hết hạn.');const p=ref.plan;if(p.viewId!==input.viewId||p.taskId!==input.taskId||p.targetColumnId!==input.targetColumnId)fail(404,'Không tìm thấy bản xem trước bảng.');
    const clock:QueryClock={...p.clock,nowUtc:new Date(now()).toISOString()};if(p.viewRevision!==v.saved.revision||p.viewRevision!==input.expectedViewRevision||p.boardRevision!==v.revision||p.boardRevision!==input.expectedBoardRevision||p.taskRevision!==v.before.revision||p.taskRevision!==ctx.expectedRevision||localDateAt(utcInstant(clock.nowUtc),clock.timezone)!==p.day)fail(409,'Bảng hoặc công việc đã thay đổi; xem trước lại.');available(v,clock);
    // This private adapter reuses the already-owned synchronous handle; it does
    // not open a second public transaction or create a second command receipt.
    const owner=createCompletionCommands({reader:tx,legacy:ports.legacy,write:(_metadata,work)=>work(tx)}),completion=owner.requestCompletion(ctx,v.before.id,proof),position=tx.get('SELECT c.id,c.column_key FROM productivity_board_positions p JOIN productivity_board_columns c ON c.board_id=p.board_id AND c.id=p.column_id WHERE p.board_id=?AND p.task_id=?',v.board.id,v.before.id);if(!position||position.column_key!==completion.actualColumn)fail(409,'Vị trí bảng không khớp kết quả hoàn thành.');ports.afterWrite?.();return {...completion,spawnedTaskIds:owner.spawnedForEvents(completion),viewId:v.saved.id,boardId:v.board.id,boardRevision:tx.get('SELECT revision FROM productivity_boards WHERE id=?',v.board.id).revision,columnId:position.id};
   });
   const result={...committed,spawnedTaskIds:committed.spawnedTaskIds.filter(id=>createTaskAccess(ports.reader).getTask(ctx.actor,id)!==null)};events.set(result,[...committed.spawnedTaskIds]);return result;
  },
 };
}
