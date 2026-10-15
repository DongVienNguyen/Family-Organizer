import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {AppActor,AppCommand,TaskPatch,QueryClock} from '../../src/features/productivity/contracts.js';
import {matchesFilter} from '../../src/features/productivity/filters.js';
import {integer,keys,object,text} from '../../src/features/productivity/validation.js';
import {localDateAt,timezoneFormatter,utcInstant} from '../../src/features/productivity/dates.js';
import {UserRole} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {assertContext,updateTaskWithinTransaction} from './tasks.js';
import {projectTaskRecord} from './query.js';
import {resolveBoardReference} from './boardViewSchema.js';
import {groupMovePatch,projectTaskGroups,type GroupMoveIntent} from './grouping.js';
import type {SavedTaskView} from './views.js';
export interface GroupMovePreviewInput {viewId:string;taskId:string;intent:GroupMoveIntent;timezone?:string}
export interface GroupMoveApplyInput {viewId:string;taskId:string;previewId:string;expectedViewRevision:number;expectedBoardRevision:number}
interface Plan {actor:AppActor;viewId:string;viewRevision:number;boardId:string;boardRevision:number;taskId:string;taskRevision:number;kind:'priority'|'assignee'|'due';taskDigest:string;viewDigest:string;patch:TaskPatch;clock:QueryClock;day:string}
interface Ref {actor:AppActor;expiresAt:number;retireAt:number;bytes:number;plan?:Plan}
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'grouped-board-move');},hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),ttl=15*60000;
const syntax=(work:()=>void)=>{try{work();}catch(error){if(error instanceof AppStoreError)throw error;fail(400,'Dữ liệu đổi nhóm không hợp lệ.');}};
/** Selected field changes compose the existing canonical writer inside one I01
 * transaction; they never assign lifecycle, rank, approval or reward fields. */
export function createGroupedBoardMoves(ports:{reader:TaskReader;views:{getView(actor:AppActor,id:string):SavedTaskView};write:typeof withAppWriteTransaction;now?:()=>number;previewLimit?:number;previewBytes?:number;afterWrite?:()=>void}){
 const reader=ports.reader,now=ports.now??Date.now,refs=new Map<string,Ref>(),limit=ports.previewLimit??128,byteLimit=ports.previewBytes??16*1024*1024;integer(limit,1,128);integer(byteLimit,1,16*1024*1024);
 const scope=(actor:AppActor,input:{viewId:string;taskId:string},r:TaskReader=reader)=>{
  assertContext({actor,expectedRevision:0,requestId:'group:scope'},r);const view=ports.views.getView(actor,input.viewId),config=view.config;
  if(config.kind!=='kanban'||config.boardId===undefined||!['priority','assignee','due'].includes(config.group))return fail(422,'Góc nhìn chưa hỗ trợ đổi nhóm.');
  const board=resolveBoardReference(r,actor,config.boardId,config.mode),before=createTaskAccess(r).assertTaskCommand(actor,input.taskId,'update');if(before.listId!==board.list_id)fail(404,'Không tìm thấy công việc trong bảng.');
  return {view,board,before,kind:config.group as Plan['kind'],boardRevision:r.get('SELECT revision FROM productivity_boards WHERE id=?',board.id).revision};
 };
 const prune=()=>{const at=now();for(const [id,ref]of refs){if(ref.retireAt<=at)refs.delete(id);else if(ref.expiresAt<=at){delete ref.plan;ref.bytes=0;}}};
 return {
  preview(actor:AppActor,input:GroupMovePreviewInput){
   syntax(()=>{keys(object(input),['viewId','taskId','intent','timezone']);text(input.viewId,256);text(input.taskId,256);object(input.intent);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}});
   const v=scope(actor,input),before=projectTaskRecord(v.before),clock:QueryClock={nowUtc:new Date(now()).toISOString(),timezone:input.timezone??'Asia/Saigon'};
   if(!matchesFilter(before,{...v.view.filter,listIds:v.view.filter.listIds===undefined?[v.board.list_id]:v.view.filter.listIds.filter(id=>id===v.board.list_id)},clock))fail(404,'Không tìm thấy công việc trong góc nhìn.');
   if(before.deletedAt!==null||['completed','wont_do'].includes(before.lifecycle))fail(422,'Không đổi nhóm công việc đã kết thúc.');if(input.intent.kind!==v.kind)fail(422,'Chỉ thay đổi thuộc tính đang nhóm.');
   let patch:TaskPatch;try{patch=groupMovePatch(before,input.intent);}catch{fail(422,'Giá trị nhóm đích không hợp lệ.');}
   if(patch!.assigneeId!==undefined&&patch!.assigneeId!==before.assigneeId){if(actor.role===UserRole.CHILD&&before.rewardPoints>0)fail(403,'Không được đổi người nhận công việc có thưởng.');const raw=patch!.assigneeId===null?null:reader.get('SELECT data FROM users WHERE id=?',patch!.assigneeId);if(patch!.assigneeId!==null&&(!raw||JSON.parse(raw.data).isDeleted||!Object.values(UserRole).includes(JSON.parse(raw.data).role)))fail(422,'Người được giao không hợp lệ.');}
   prune();if(refs.size>=limit)fail(429,'Bộ nhớ xem trước nhóm đã đầy.');
   const plan:Plan={actor:structuredClone(actor),viewId:v.view.id,viewRevision:v.view.revision,boardId:v.board.id,boardRevision:v.boardRevision,taskId:before.id,taskRevision:before.revision,kind:v.kind,taskDigest:hash(before),viewDigest:hash(v.view),patch:patch!,clock,day:localDateAt(utcInstant(clock.nowUtc),clock.timezone)},bytes=Buffer.byteLength(JSON.stringify(plan));
   if(bytes+[...refs.values()].reduce((sum,r)=>sum+r.bytes,0)>byteLimit)fail(429,'Bộ nhớ xem trước nhóm đã đầy.');
   const id=randomUUID(),expiresAt=now()+ttl;refs.set(id,{actor:structuredClone(actor),expiresAt,retireAt:expiresAt+ttl,bytes,plan});
   return structuredClone({id,viewId:plan.viewId,viewRevision:plan.viewRevision,boardId:plan.boardId,boardRevision:plan.boardRevision,taskId:plan.taskId,taskRevision:plan.taskRevision,before,after:{...before,...plan.patch},clock,expiresAt:new Date(expiresAt).toISOString()});
  },
  apply(ctx:AppCommand,input:GroupMoveApplyInput){
   syntax(()=>{keys(object(input),['viewId','taskId','previewId','expectedViewRevision','expectedBoardRevision']);for(const id of [input.viewId,input.taskId,input.previewId])text(id,256);integer(input.expectedViewRevision,1);integer(input.expectedBoardRevision,1);});scope(ctx.actor,input);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:grouped-board:move',requestId:ctx.requestId,payloadHash:hash({expectedRevision:ctx.expectedRevision,input})},tx=>{
    const v=scope(ctx.actor,input,tx);prune();const ref=refs.get(input.previewId);if(!ref||ref.actor.userId!==ctx.actor.userId||ref.actor.role!==ctx.actor.role)fail(404,'Không tìm thấy bản xem trước nhóm.');if(!ref.plan||ref.expiresAt<=now())fail(409,'Bản xem trước nhóm đã hết hạn.');const plan=ref.plan!,current=now(),clock={nowUtc:new Date(current).toISOString(),timezone:plan.clock.timezone};
    if(plan.viewId!==input.viewId||plan.taskId!==input.taskId||plan.boardId!==v.board.id)fail(404,'Bản xem trước không thuộc công việc này.');
    if(hash(projectTaskRecord(v.before))!==plan.taskDigest||hash(v.view)!==plan.viewDigest||plan.kind!==v.kind||v.view.revision!==plan.viewRevision||input.expectedViewRevision!==plan.viewRevision||v.boardRevision!==plan.boardRevision||input.expectedBoardRevision!==plan.boardRevision||v.before.revision!==plan.taskRevision||ctx.expectedRevision!==plan.taskRevision||current<utcInstant(plan.clock.nowUtc)||localDateAt(current,clock.timezone)!==plan.day||!matchesFilter(projectTaskRecord(v.before),v.view.filter,clock))fail(409,'Góc nhìn hoặc công việc đã thay đổi; xem trước lại.');
    const changed=Object.entries(plan.patch).some(([key,value])=>!isDeepStrictEqual(v.before[key as keyof typeof v.before],value)),row=changed?updateTaskWithinTransaction(tx,ctx,v.before.id,plan.patch):v.before,task=projectTaskRecord(row),actualGroup=projectTaskGroups([task],v.kind,clock).cards[0].group;
    const visible=createTaskAccess(tx).getTask(ctx.actor,task.id)!==null;ports.afterWrite?.();return {viewId:v.view.id,boardId:v.board.id,boardRevision:tx.get('SELECT revision FROM productivity_boards WHERE id=?',v.board.id).revision,task,taskChanged:changed,actualGroup,filteredOut:!visible||!matchesFilter(task,v.view.filter,clock)};
   });
  },
 };
}
