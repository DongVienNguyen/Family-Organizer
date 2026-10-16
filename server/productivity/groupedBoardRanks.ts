import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,AppCommand,QueryClock,TaskRecord} from '../../src/features/productivity/contracts.js';
import {object,keys,text,integer,choice} from '../../src/features/productivity/validation.js';
import {calendarDate,timezoneFormatter,localDateAt,utcInstant} from '../../src/features/productivity/dates.js';
import {AppStoreError} from '../appErrors.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
import {projectTaskRecord} from './query.js';
import {resolveBoardReference} from './boardViewSchema.js';
import {boardReadLimits} from './boardProjection.js';
import {createGroupedBoardReader} from './groupedBoardReader.js';
import {projectTaskGroups,type GroupCardReference,type BoardGroupKind} from './grouping.js';
import {workflowColumn} from './board.js';
import {planBoardRank} from './rank.js';
import type {SavedTaskView} from './views.js';
type Group=GroupCardReference['group'];
export interface GroupRankPreviewInput {viewId:string;taskId:string;group:Group;beforeTaskId:string|null;timezone?:string}
export interface GroupRankApplyInput {viewId:string;taskId:string;previewId:string;expectedViewRevision:number;expectedBoardRevision:number}
interface Plan {actor:AppActor;viewId:string;viewRevision:number;viewDigest:string;boardId:string;boardRevision:number;taskId:string;taskRevision:number;taskDigest:string;group:Group;laneDigest:string;clock:QueryClock;day:string;rank:ReturnType<typeof planBoardRank>}
interface Ref {actor:AppActor;expiresAt:number;retireAt:number;bytes:number;plan?:Plan}
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'group-rank');},hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),ttl=15*60000;
const syntax=(fn:()=>void)=>{try{fn();}catch(error){if(error instanceof AppStoreError)throw error;fail(400,'Dữ liệu thứ tự nhóm không hợp lệ.');}};
function groupValue(input:unknown):Group {const value=object(input);keys(value,['kind','value']);choice(value.kind,['priority','assignee','due','tag']);if(value.kind==='priority')choice(value.value,['high','medium','low','none']);else if(value.value!==null){text(value.value,256);if(value.kind==='due')calendarDate(value.value);}return {kind:value.kind,value:value.value as string|null};}
/** Shared per-board ordering across projections. Only metadata positions change;
 * a field-group change remains the existing independent semantic command. */
export function createGroupedBoardRanks(ports:{reader:TaskReader;views:{getView(actor:AppActor,id:string):SavedTaskView};write:typeof withAppWriteTransaction;now?:()=>number;previewLimit?:number;previewBytes?:number;maxRows?:number;maxBytes?:number;afterWrite?:()=>void}){
 const reader=ports.reader,now=ports.now??Date.now,refs=new Map<string,Ref>(),limit=ports.previewLimit??128,bytesLimit=ports.previewBytes??16*1024*1024,maxRows=ports.maxRows??boardReadLimits.rows,maxBytes=ports.maxBytes??boardReadLimits.bytes;
 integer(limit,1,128);integer(bytesLimit,1,16*1024*1024);integer(maxRows,1,boardReadLimits.rows);integer(maxBytes,1,boardReadLimits.bytes);
 const clock=(timezone='Asia/Saigon'):QueryClock=>{timezoneFormatter(timezone);return {nowUtc:new Date(now()).toISOString(),timezone};};
 const scope=(actor:AppActor,input:{viewId:string;taskId:string},at:QueryClock,r:TaskReader=reader,requireVisible=true)=>{
  assertContext({actor,requestId:'group:rank',expectedRevision:0},r);const view=ports.views.getView(actor,input.viewId),config=view.config;
  if(config.kind!=='kanban'||!config.boardId||!['priority','assignee','due','tag'].includes(config.group)||config.sort!=='rank')return fail(422,'Chỉ đổi thứ tự nhóm khi dùng thứ tự tùy chỉnh.');
  const board=resolveBoardReference(r,actor,config.boardId,config.mode);
  const admitted=createGroupedBoardReader({reader:r}).read(actor,view,board,config.group as BoardGroupKind,at,{maxRows,maxBytes}),authorized=createTaskAccess(r).assertTaskCommand(actor,input.taskId,'update');
  if(authorized.listId!==board.list_id)fail(404,'Không tìm thấy công việc trong bảng.');const task=admitted.tasksById.get(input.taskId)??(requireVisible?undefined:projectTaskRecord(authorized));if(!task)return fail(404,'Không tìm thấy công việc trong góc nhìn.');
  return {view,config,board,task,...admitted};
 };
 const positions=(s:ReturnType<typeof scope>,group:Group,at:QueryClock)=>{
  if(group.kind!==s.config.group)return fail(404,'Không tìm thấy nhóm công việc.');
  const ids=projectTaskGroups(s.rows,group.kind,at).cards.filter(c=>c.group.value===group.value).map(c=>c.taskId),rows=ids.map(taskId=>{const rank=s.ordering.get(taskId);if(!Number.isSafeInteger(rank))fail(409,'Thứ tự nhóm đã thay đổi.');return {taskId,rank:rank!};});
  if(!ids.includes(s.task.id))fail(404,'Không tìm thấy công việc trong nhóm.');
  return {rows,digest:hash(rows.map(row=>[row.taskId,s.tasksById.get(row.taskId),row.rank]).sort((a,b)=>String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0))};
 };
 const prune=()=>{const at=now();for(const [id,ref]of refs){if(ref.retireAt<=at)refs.delete(id);else if(ref.expiresAt<=at){delete ref.plan;ref.bytes=0;}}};
 const column=(r:TaskReader,s:ReturnType<typeof scope>,task:TaskRecord)=>{const key=s.board.mode==='workflow'?workflowColumn(task):task.sectionId===null?'none':'section:'+task.sectionId,row=r.get("SELECT c.id FROM productivity_board_columns c LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='section' AND m.entity_id=c.section_id WHERE c.board_id=? AND c.column_key=? AND c.archived_at IS NULL AND m.archived_at IS NULL",s.board.id,key);if(!row)fail(409,'Cột bảng đã thay đổi.');return row.id as string;};
 return {
  preview(actor:AppActor,input:GroupRankPreviewInput){
   let group:Group;syntax(()=>{keys(object(input),['viewId','taskId','group','beforeTaskId','timezone']);text(input.viewId,256);text(input.taskId,256);if(input.beforeTaskId!==null)text(input.beforeTaskId,256);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}group=groupValue(input.group);});
   const at=clock(input.timezone),s=scope(actor,input,at),current=positions(s,group!,at);
   if(input.beforeTaskId!==null&&!current.rows.some(row=>row.taskId===input.beforeTaskId))fail(404,'Không tìm thấy vị trí đích.');
   let rank:ReturnType<typeof planBoardRank>;try{rank=planBoardRank({positions:current.rows,taskId:input.taskId,beforeTaskId:input.beforeTaskId});}catch{fail(422,'Vị trí thứ tự nhóm không hợp lệ.');}
   prune();if(refs.size>=limit)fail(429,'Bộ nhớ xem trước thứ tự nhóm đã đầy.');
   const plan:Plan={actor:structuredClone(actor),viewId:s.view.id,viewRevision:s.view.revision,viewDigest:hash(s.view),boardId:s.board.id,boardRevision:s.revision,taskId:s.task.id,taskRevision:s.task.revision,taskDigest:hash(s.task),group:group!,laneDigest:current.digest,clock:at,day:localDateAt(utcInstant(at.nowUtc),at.timezone),rank:rank!},bytes=Buffer.byteLength(JSON.stringify(plan));
   if(bytes+[...refs.values()].reduce((n,r)=>n+r.bytes,0)>bytesLimit)fail(429,'Bộ nhớ xem trước thứ tự nhóm đã đầy.');const id=randomUUID(),expiresAt=now()+ttl;refs.set(id,{actor:structuredClone(actor),expiresAt,retireAt:expiresAt+ttl,bytes,plan});
   return {id,viewId:plan.viewId,viewRevision:plan.viewRevision,boardId:plan.boardId,boardRevision:plan.boardRevision,taskId:plan.taskId,taskRevision:plan.taskRevision,group:structuredClone(plan.group),beforeTaskId:input.beforeTaskId,rank:rank!.rank,clock:at,expiresAt:new Date(expiresAt).toISOString()};
  },
  apply(ctx:AppCommand,input:GroupRankApplyInput){
   syntax(()=>{keys(object(input),['viewId','taskId','previewId','expectedViewRevision','expectedBoardRevision']);for(const id of [input.viewId,input.taskId,input.previewId])text(id,256);integer(input.expectedViewRevision,1);integer(input.expectedBoardRevision,1);});assertContext(ctx,reader);scope(ctx.actor,input,clock(),reader,false);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:board:group-rank',requestId:ctx.requestId,payloadHash:hash({expectedRevision:ctx.expectedRevision,input})},tx=>{
    prune();const ref=refs.get(input.previewId);if(!ref||ref.actor.userId!==ctx.actor.userId||ref.actor.role!==ctx.actor.role)fail(404,'Không tìm thấy bản xem trước thứ tự nhóm.');if(ref.expiresAt<=now()||!ref.plan)fail(409,'Bản xem trước thứ tự nhóm đã hết hạn.');const plan=ref.plan,at=clock(plan.clock.timezone),s=scope(ctx.actor,input,at,tx,false);
    if(plan.taskId!==input.taskId||plan.viewId!==input.viewId||plan.boardId!==s.board.id)fail(404,'Không tìm thấy bản xem trước thứ tự nhóm.');
    if(s.view.revision!==plan.viewRevision||input.expectedViewRevision!==plan.viewRevision||hash(s.view)!==plan.viewDigest||s.revision!==plan.boardRevision||input.expectedBoardRevision!==plan.boardRevision||s.task.revision!==plan.taskRevision||ctx.expectedRevision!==plan.taskRevision||hash(s.task)!==plan.taskDigest||localDateAt(utcInstant(at.nowUtc),at.timezone)!==plan.day)fail(409,'Bảng hoặc công việc đã thay đổi; xem trước lại.');
    let laneDigest:string;try{laneDigest=positions(s,plan.group,at).digest;}catch(error){if(error instanceof AppStoreError&&error.status===404)fail(409,'Nhóm công việc đã thay đổi; xem trước lại.');throw error;}if(laneDigest!==plan.laneDigest)fail(409,'Thứ tự nhóm đã thay đổi; xem trước lại.');
    const writes=plan.rank.rebalance.length?plan.rank.rebalance:[{taskId:s.task.id,rank:plan.rank.rank}],updates=writes.map(row=>{const task=s.tasksById.get(row.taskId);if(!task)fail(409,'Nhóm công việc đã thay đổi.');const columnId=column(tx,s,task!),prior=tx.get('SELECT rank,column_id FROM productivity_board_positions WHERE board_id=? AND task_id=?',s.board.id,row.taskId);return {...row,columnId,changed:prior?.rank!==row.rank||prior?.column_id!==columnId};}).filter(row=>row.changed);
    if(updates.length&&s.revision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản bảng đã đạt giới hạn.');
    for(const row of updates)tx.run('INSERT INTO productivity_board_positions VALUES(?,?,?,?,?) ON CONFLICT(board_id,task_id) DO UPDATE SET column_id=excluded.column_id,rank=excluded.rank',s.board.id,row.taskId,s.board.list_id,row.columnId,row.rank);
    if(updates.length)tx.run('UPDATE productivity_boards SET revision=revision+1 WHERE id=?',s.board.id);ports.afterWrite?.();
    return {viewId:s.view.id,boardId:s.board.id,listId:s.board.list_id,boardRevision:tx.get('SELECT revision FROM productivity_boards WHERE id=?',s.board.id).revision,taskId:s.task.id,rank:plan.rank.rank,taskChanged:false as const,rankChanged:updates.length>0};
   });
  },
 };
}
