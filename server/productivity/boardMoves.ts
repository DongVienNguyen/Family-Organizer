import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,AppCommand,TaskRecord,QueryClock} from '../../src/features/productivity/contracts.js';
import {matchesFilter} from '../../src/features/productivity/filters.js';
import {localDateAt,timezoneFormatter,utcInstant} from '../../src/features/productivity/dates.js';
import {object,keys,text,integer,choice} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
import {assertTaskListMove,moveTaskToListWithinTransaction} from './structure.js';
import {projectTaskRecord} from './query.js';
import {resolveBoardReference} from './boardViewSchema.js';
import {workflowColumn} from './board.js';
import {planBoardRank} from './rank.js';
import {withBoardWipOverride,type BoardWipAudit} from './boardWipOverride.js';
import type {SavedTaskView} from './views.js';
export interface BoardMovePreviewInput {viewId:string;taskId:string;targetColumnId:string;beforeTaskId:string|null;overrideReason?:string;timezone?:string}
export interface BoardMoveApplyInput {viewId:string;taskId:string;previewId:string;targetColumnId:string;operation:'section'|'rank';expectedViewRevision:number;expectedBoardRevision:number}
interface Plan {actor:AppActor;viewId:string;viewRevision:number;boardId:string;boardRevision:number;taskId:string;taskRevision:number;columnId:string;beforeTaskId:string|null;sectionId:string|null;taskChanged:boolean;overrideReason?:string;clock:QueryClock;day:string;laneDigest:string;rank:ReturnType<typeof planBoardRank>}
interface Ref {actor:AppActor;expiresAt:number;retireAt:number;bytes:number;plan?:Plan}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'board-move');};
const workflowSql="CASE WHEN t.deleted_at IS NOT NULL THEN 'trash' WHEN t.lifecycle='wont_do' THEN 'wont_do' WHEN t.pending_approval=1 THEN 'review' WHEN t.lifecycle='completed' THEN 'done' WHEN t.blocked=1 THEN 'waiting' WHEN t.lifecycle='in_progress' THEN 'doing' ELSE 'todo' END";
const ttl=15*60000;
const syntax=(work:()=>void)=>{try{work();}catch(error){if(error instanceof AppStoreError)throw error;fail(400,'Dữ liệu di chuyển bảng không hợp lệ.');}};
export function createBoardMoves(ports:{reader:TaskReader;views:{getView(actor:AppActor,id:string):SavedTaskView};write:typeof withAppWriteTransaction;now?:()=>number;previewLimit?:number;previewBytes?:number;afterWrite?:()=>void}){
 const reader=ports.reader,now=ports.now??Date.now,refs=new Map<string,Ref>(),limit=ports.previewLimit??128,byteLimit=ports.previewBytes??16*1024*1024;integer(limit,1,128);integer(byteLimit,1,16*1024*1024);
 const owned=(actor:AppActor,id:string,r:TaskReader=reader)=>{
  assertContext({actor,expectedRevision:0,requestId:'board:move'},r);const saved=ports.views.getView(actor,id),config=saved.config;
  if(config.kind!=='kanban'||config.boardId===undefined)throw new AppStoreError('Góc nhìn chưa liên kết bảng chuẩn.',422,'board-move');
  const board=resolveBoardReference(r,actor,config.boardId,config.mode);if(config.group!=='none'||config.sort!=='rank')fail(422,'Chỉ đổi thứ tự khi bảng dùng thứ tự tùy chỉnh.');
  const revision=r.get('SELECT revision FROM productivity_boards WHERE id=?',board.id).revision;return {saved,board,config,revision};
 };
 const task=(actor:AppActor,id:string,r:TaskReader=reader)=>{syntax(()=>text(id,256));return createTaskAccess(r).assertTaskCommand(actor,id,'update');};
 const column=(r:TaskReader,boardId:string,columnId:string)=>{syntax(()=>text(columnId,256));const c=r.get("SELECT c.* FROM productivity_board_columns c LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='section' AND m.entity_id=c.section_id WHERE c.board_id=? AND c.id=? AND c.archived_at IS NULL AND m.archived_at IS NULL",boardId,columnId);if(!c)fail(404,'Không tìm thấy cột đích.');return c;};
 const lane=(r:TaskReader,board:{id:string;list_id:string;mode:'sections'|'workflow'},c:any)=>{
  const predicate=board.mode==='sections'?'t.section_id IS ?':workflowSql+'=?';
  const rows=r.all('SELECT t.id AS taskId,COALESCE(p.rank,t.rank)AS rank FROM productivity_tasks t LEFT JOIN productivity_board_positions p ON p.task_id=t.id AND p.board_id=? WHERE t.list_id=? AND t.deleted_at IS NULL AND '+predicate+' ORDER BY COALESCE(p.rank,t.rank),t.id LIMIT 100001',board.id,board.list_id,board.mode==='sections'?c.section_id:c.column_key);if(rows.length>100000)fail(422,'Cột vượt giới hạn thứ tự.');return rows;
 };
 const wip=(r:TaskReader,board:{list_id:string;mode:'sections'|'workflow'},c:any,before:TaskRecord,taskChanged:boolean)=>{
  if(!taskChanged||before.parentId!==null||c.wip_policy==='off')return {blocked:false,warning:false};
  const predicate=board.mode==='sections'?'section_id IS ?':workflowSql.replaceAll('t.','')+'=?';
  const n=r.get("SELECT count(*)AS n FROM productivity_tasks WHERE list_id=? AND id!=? AND parent_id IS NULL AND deleted_at IS NULL AND lifecycle NOT IN('completed','wont_do') AND "+predicate,board.list_id,before.id,board.mode==='sections'?c.section_id:c.column_key).n;
  return {blocked:c.wip_policy==='hard'&&n>=c.wip_limit,warning:n>=c.wip_limit};
 };
 const preflight=(actor:AppActor,input:{viewId:string;taskId:string;targetColumnId?:string;operation?:'section'|'rank'},r:TaskReader=reader)=>{const v=owned(actor,input.viewId,r),before=task(actor,input.taskId,r);if(before.listId!==v.board.list_id)fail(404,'Không tìm thấy công việc trong bảng.');if(input.targetColumnId!==undefined){const target=column(r,v.board.id,input.targetColumnId);if(input.operation==='section')assertTaskListMove(r,{actor,requestId:'board:section:scope',expectedRevision:before.revision},before.id,before.listId,target.section_id);}return {...v,before};};
 const prune=()=>{for(const [id,ref]of refs){if(ref.retireAt<=now())refs.delete(id);else if(ref.expiresAt<=now()){delete ref.plan;ref.bytes=0;}}};
 return {
  preview(actor:AppActor,input:BoardMovePreviewInput){
   syntax(()=>{keys(object(input),['viewId','taskId','targetColumnId','beforeTaskId','overrideReason','timezone']);text(input.viewId,256);text(input.taskId,256);text(input.targetColumnId,256);if(input.beforeTaskId!==null)text(input.beforeTaskId,256);if(input.overrideReason!==undefined)text(input.overrideReason,500);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}});
   const v=preflight(actor,input),before=projectTaskRecord(v.before),c=column(reader,v.board.id,input.targetColumnId),clock:QueryClock={nowUtc:new Date(now()).toISOString(),timezone:input.timezone??'Asia/Saigon'};
   if(!matchesFilter(before,v.saved.filter,clock))fail(404,'Không tìm thấy công việc trong góc nhìn.');if(before.deletedAt!==null||['completed','wont_do'].includes(before.lifecycle))fail(422,'Không di chuyển công việc đã kết thúc.');
   if(v.board.mode==='workflow'&&workflowColumn(before)!==c.column_key)fail(422,'Chuyển trạng thái cần lệnh hoàn thành công việc.');
   const changed=v.board.mode==='sections'&&before.sectionId!==c.section_id;
   if(changed)assertTaskListMove(reader,{actor,expectedRevision:before.revision,requestId:'board:preview'},before.id,before.listId,c.section_id);
   if(input.beforeTaskId!==null){const anchor=createTaskAccess(reader).getTask(actor,input.beforeTaskId);if(!anchor||anchor.listId!==before.listId||!matchesFilter(projectTaskRecord(anchor),v.saved.filter,clock)||(v.board.mode==='sections'?anchor.sectionId!==c.section_id:workflowColumn(anchor)!==c.column_key))fail(404,'Không tìm thấy vị trí đích trong góc nhìn.');}
   const decision=wip(reader,v.board,c,before,changed);if(input.overrideReason!==undefined&&(actor.role!=='admin'||!decision.blocked))fail(actor.role==='admin'?422:403,'Chỉ vượt WIP khi quản trị viên xác nhận lý do cần thiết.');if(decision.blocked&&input.overrideReason===undefined)fail(422,'Cột đích đã đạt giới hạn công việc.');
   const positions=lane(reader,v.board,c);let rank:ReturnType<typeof planBoardRank>;try{if(positions.some(p=>p.rank<0)){const normalized=planBoardRank({positions:positions.map((p,i)=>({taskId:p.taskId,rank:(i+1)*1024})),taskId:before.id,beforeTaskId:input.beforeTaskId}),rebalance=normalized.orderedTaskIds.map((taskId,i)=>({taskId,rank:(i+1)*1024}));rank={...normalized,rebalance,rank:rebalance.find(p=>p.taskId===before.id)!.rank};}else rank=planBoardRank({positions,taskId:before.id,beforeTaskId:input.beforeTaskId});}catch{fail(422,'Vị trí thứ tự không hợp lệ.');}
   prune();if(refs.size>=limit)fail(429,'Bộ nhớ xem trước bảng đã đầy; thử lại sau.');
   const plan:Plan={actor:structuredClone(actor),viewId:v.saved.id,viewRevision:v.saved.revision,boardId:v.board.id,boardRevision:v.revision,taskId:before.id,taskRevision:before.revision,columnId:c.id,beforeTaskId:input.beforeTaskId,sectionId:c.section_id,taskChanged:changed,overrideReason:input.overrideReason,clock,day:localDateAt(utcInstant(clock.nowUtc),clock.timezone),laneDigest:hash(positions),rank:rank!},id=randomUUID(),expiresAt=now()+ttl;
   const bytes=Buffer.byteLength(JSON.stringify(plan));if(bytes+[...refs.values()].reduce((sum,ref)=>sum+ref.bytes,0)>byteLimit)fail(429,'Bộ nhớ xem trước bảng đã đầy; thử lại sau.');
   refs.set(id,{actor:structuredClone(actor),expiresAt,retireAt:expiresAt+ttl,bytes,plan});
   return structuredClone({id,operation:changed?'section' as const:'rank' as const,viewId:v.saved.id,viewRevision:v.saved.revision,boardId:v.board.id,boardRevision:v.revision,taskId:before.id,taskRevision:before.revision,targetColumnId:c.id,beforeTaskId:input.beforeTaskId,clock,expiresAt:new Date(expiresAt).toISOString(),before,after:{...before,sectionId:changed?c.section_id:before.sectionId},warning:decision.warning?'wip':null,overrideReason:input.overrideReason??null});
  },
  apply(ctx:AppCommand,input:BoardMoveApplyInput){
   syntax(()=>{keys(object(input),['viewId','taskId','previewId','targetColumnId','operation','expectedViewRevision','expectedBoardRevision']);for(const id of [input.viewId,input.taskId,input.previewId,input.targetColumnId])text(id,256);choice(input.operation,['section','rank']);integer(input.expectedViewRevision,1);integer(input.expectedBoardRevision,1);});
   preflight(ctx.actor,input);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:board:move',requestId:ctx.requestId,payloadHash:hash({expectedRevision:ctx.expectedRevision,input})},tx=>{
    const v=preflight(ctx.actor,input,tx);prune();const ref=refs.get(input.previewId);if(!ref||ref.actor.userId!==ctx.actor.userId||ref.actor.role!==ctx.actor.role)fail(404,'Không tìm thấy bản xem trước bảng.');if(ref.expiresAt<=now()||!ref.plan)fail(409,'Bản xem trước bảng đã hết hạn.');const plan=ref.plan;
    if(plan.taskId!==input.taskId||plan.viewId!==input.viewId||plan.columnId!==input.targetColumnId||(plan.taskChanged?'section':'rank')!==input.operation)fail(404,'Không tìm thấy bản xem trước bảng.');
    const captured:QueryClock={nowUtc:new Date(now()).toISOString(),timezone:plan.clock.timezone};if(v.saved.revision!==plan.viewRevision||input.expectedViewRevision!==plan.viewRevision||v.revision!==plan.boardRevision||input.expectedBoardRevision!==plan.boardRevision||v.before.revision!==plan.taskRevision||ctx.expectedRevision!==plan.taskRevision||localDateAt(utcInstant(captured.nowUtc),captured.timezone)!==plan.day||!matchesFilter(projectTaskRecord(v.before),v.saved.filter,captured))fail(409,'Bảng hoặc công việc đã thay đổi; xem trước lại.');
    const c=column(tx,v.board.id,plan.columnId);if(hash(lane(tx,v.board,c))!==plan.laneDigest)fail(409,'Thứ tự cột đã thay đổi; xem trước lại.');
    if(plan.beforeTaskId!==null){const anchor=createTaskAccess(tx).getTask(ctx.actor,plan.beforeTaskId);if(!anchor||!matchesFilter(projectTaskRecord(anchor),v.saved.filter,captured))fail(404,'Không tìm thấy vị trí đích.');}
    let saved=v.before;const move=(audit?:Readonly<BoardWipAudit>)=>{saved=moveTaskToListWithinTransaction(tx,ctx,v.before.id,v.before.listId,plan.sectionId,audit);};
    if(plan.taskChanged){if(plan.overrideReason!==undefined)withBoardWipOverride(tx,ctx.actor,{taskId:v.before.id,boardId:v.board.id,columnId:c.id,reason:plan.overrideReason},move);else move();}
    const position=tx.get('SELECT rank FROM productivity_board_positions WHERE board_id=? AND task_id=?',v.board.id,v.before.id),rankChanged=position?.rank!==plan.rank.rank||plan.rank.rebalance.length>0;
    const setRank=(taskId:string,rank:number)=>tx.run('INSERT INTO productivity_board_positions VALUES(?,?,?,?,?) ON CONFLICT(board_id,task_id) DO UPDATE SET column_id=excluded.column_id,rank=excluded.rank',v.board.id,taskId,v.board.list_id,c.id,rank);
    for(const item of plan.rank.rebalance)if(item.taskId!==v.before.id)setRank(item.taskId,item.rank);setRank(v.before.id,plan.rank.rank);
    if(!plan.taskChanged&&rankChanged){if(v.revision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản bảng đã đạt giới hạn.');tx.run('UPDATE productivity_boards SET revision=revision+1 WHERE id=?',v.board.id);}
    ports.afterWrite?.();return {viewId:v.saved.id,boardId:v.board.id,boardRevision:tx.get('SELECT revision FROM productivity_boards WHERE id=?',v.board.id).revision,columnId:c.id,task:projectTaskRecord(saved),taskChanged:plan.taskChanged,rank:plan.rank.rank,overrideReason:plan.overrideReason??null};
   });
  },
 };
}
