import {canSelectTag} from './tagPolicy.js';
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
import {createGroupedBoardReader} from './groupedBoardReader.js';
import {boardReadLimits} from './boardProjection.js';
import {planBoardRank} from './rank.js';
import type {SavedTaskView} from './views.js';
export interface GroupMovePreviewInput {viewId:string;taskId:string;intent:GroupMoveIntent;beforeTaskId?:string|null;timezone?:string}
export interface GroupMoveApplyInput {viewId:string;taskId:string;previewId:string;expectedViewRevision:number;expectedBoardRevision:number;tagTargetId?:string|null}
interface Plan {actor:AppActor;viewId:string;viewRevision:number;boardId:string;boardRevision:number;taskId:string;taskRevision:number;kind:'priority'|'assignee'|'due'|'tag';tagTargetId?:string|null;targetDigest?:string|null;taskDigest:string;viewDigest:string;patch:TaskPatch;rankPlan?:{beforeTaskId:string|null;digest:string;rank:ReturnType<typeof planBoardRank>};clock:QueryClock;day:string}
interface Ref {actor:AppActor;expiresAt:number;retireAt:number;bytes:number;plan?:Plan}
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'grouped-board-move');},hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),ttl=15*60000;
const syntax=(work:()=>void)=>{try{work();}catch(error){if(error instanceof AppStoreError)throw error;fail(400,'Dữ liệu đổi nhóm không hợp lệ.');}};
/** Selected field changes compose the existing canonical writer inside one I01
 * transaction; an optional rank anchor composes metadata in that same transaction. Lifecycle, approval and reward authority stay with their existing commands. */
export function createGroupedBoardMoves(ports:{reader:TaskReader;views:{getView(actor:AppActor,id:string):SavedTaskView};write:typeof withAppWriteTransaction;now?:()=>number;previewLimit?:number;previewBytes?:number;maxRows?:number;maxBytes?:number;afterWrite?:()=>void}){
 const reader=ports.reader,now=ports.now??Date.now,refs=new Map<string,Ref>(),limit=ports.previewLimit??128,byteLimit=ports.previewBytes??16*1024*1024;integer(limit,1,128);integer(byteLimit,1,16*1024*1024);const limits={maxRows:ports.maxRows??boardReadLimits.rows,maxBytes:ports.maxBytes??boardReadLimits.bytes};integer(limits.maxRows,1,boardReadLimits.rows);integer(limits.maxBytes,1,boardReadLimits.bytes);
 const scope=(actor:AppActor,input:{viewId:string;taskId:string},r:TaskReader=reader,at?:QueryClock)=>{
  assertContext({actor,expectedRevision:0,requestId:'group:scope'},r);const view=ports.views.getView(actor,input.viewId),config=view.config;
  if(config.kind!=='kanban'||config.boardId===undefined||!['priority','assignee','due','tag'].includes(config.group))return fail(422,'Góc nhìn chưa hỗ trợ đổi nhóm.');
  if(at&&config.sort!=='rank')fail(422,'Chỉ đặt vị trí nhóm khi dùng thứ tự tùy chỉnh.');
  const board=resolveBoardReference(r,actor,config.boardId,config.mode),admitted=at?createGroupedBoardReader({reader:r}).read(actor,view,board,config.group as Plan['kind'],at,limits):undefined,before=createTaskAccess(r).assertTaskCommand(actor,input.taskId,'update');if(before.listId!==board.list_id)fail(404,'Không tìm thấy công việc trong bảng.');
  return {view,board,before,admitted,kind:config.group as Plan['kind'],boardRevision:r.get('SELECT revision FROM productivity_boards WHERE id=?',board.id).revision};
 };
 const target=(r:TaskReader,actor:AppActor,id:string|null)=>{if(id===null)return null;if(!canSelectTag(r,actor,id))return fail(404,'Không tìm thấy nhãn đích.');const row=r.get("SELECT tag.id,tag.name,m.revision FROM productivity_tags tag LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='tag' AND m.entity_id=tag.id WHERE tag.id=? AND m.archived_at IS NULL",id);if(!row||row.id!==id)fail(404,'Không tìm thấy nhãn đích.');return {id:row.id,digest:hash([row.id,row.name,row.revision??1])};};
 const targetScope=(r:TaskReader,actor:AppActor,kind:Plan['kind'],input:GroupMoveApplyInput)=>{if(kind==='tag'){if(!Object.hasOwn(input,'tagTargetId'))fail(400,'Thiếu nhãn đích của bản xem trước.');return target(r,actor,input.tagTargetId!);}if(Object.hasOwn(input,'tagTargetId'))fail(400,'Nhãn đích không thuộc kiểu nhóm này.');return null;};
 const rankState=(r:TaskReader,actor:AppActor,v:ReturnType<typeof scope>,patch:TaskPatch,beforeTaskId:string|null,at:QueryClock)=>{
  if(v.view.config.kind!=='kanban'||v.view.config.sort!=='rank')return fail(422,'Chỉ đặt vị trí nhóm khi dùng thứ tự tùy chỉnh.');
  const admitted=v.admitted??createGroupedBoardReader({reader:r}).read(actor,v.view,v.board,v.kind,at,limits),task=admitted.tasksById.get(v.before.id);
  if(!task)return fail(404,'Không tìm thấy công việc trong góc nhìn.');const after={...task,...patch};
  if(!matchesFilter(after,{...v.view.filter,listIds:v.view.filter.listIds===undefined?[v.board.list_id]:v.view.filter.listIds.filter(id=>id===v.board.list_id)},at))return fail(422,'Công việc rời bộ lọc; không thể đặt vị trí nhóm.');
  const projected=projectTaskGroups([after],v.kind,at).cards.map(c=>c.group),targetGroup=v.kind==='tag'?null:projected[0];
  const digest=hash(admitted.rows.map(t=>[t.id,t,admitted.ordering.get(t.id)]).sort((a,b)=>String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0));
  return {admitted,after,projected,targetGroup,digest,beforeTaskId};
 };
 const ranked=(r:TaskReader,actor:AppActor,v:ReturnType<typeof scope>,patch:TaskPatch,beforeTaskId:string|null,at:QueryClock,tagTargetId?:string|null)=>{
  const state=rankState(r,actor,v,patch,beforeTaskId,at),group=v.kind==='tag'?state.projected.find(g=>g.value===tagTargetId):state.targetGroup;if(!group)return fail(422,'Công việc không thuộc nhóm đích.');
  const destination=projectTaskGroups(state.admitted.rows.map(t=>t.id===v.before.id?state.after:t),v.kind,at).cards.filter(c=>c.group.value===group.value).map(c=>c.taskId),positions=destination.map(taskId=>({taskId,rank:state.admitted.ordering.get(taskId)!}));
  if(beforeTaskId!==null&&!destination.includes(beforeTaskId))return fail(404,'Không tìm thấy vị trí đích.');
  // A newly arriving card has no rank in this lane until the atomic write.
  const beforeGroups=projectTaskGroups([projectTaskRecord(v.before)],v.kind,at).cards.map(c=>c.group.value),existing=beforeGroups.includes(group.value)?positions:positions.filter(p=>p.taskId!==v.before.id);
  try{return {beforeTaskId,digest:state.digest,rank:planBoardRank({positions:existing,taskId:v.before.id,beforeTaskId})};}catch{return fail(422,'Vị trí thứ tự nhóm không hợp lệ.');}
 };
 const prune=()=>{const at=now();for(const [id,ref]of refs){if(ref.retireAt<=at)refs.delete(id);else if(ref.expiresAt<=at){delete ref.plan;ref.bytes=0;}}};
 return {
  preview(actor:AppActor,input:GroupMovePreviewInput){
   syntax(()=>{keys(object(input),['viewId','taskId','intent','beforeTaskId','timezone']);text(input.viewId,256);text(input.taskId,256);object(input.intent);if(Object.hasOwn(input,'beforeTaskId')&&input.beforeTaskId!==null)text(input.beforeTaskId,256);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}});
   const clock:QueryClock={nowUtc:new Date(now()).toISOString(),timezone:input.timezone??'Asia/Saigon'},v=scope(actor,input,reader,Object.hasOwn(input,'beforeTaskId')?clock:undefined),before=projectTaskRecord(v.before);
   if(!matchesFilter(before,{...v.view.filter,listIds:v.view.filter.listIds===undefined?[v.board.list_id]:v.view.filter.listIds.filter(id=>id===v.board.list_id)},clock))fail(404,'Không tìm thấy công việc trong góc nhìn.');
   if(before.deletedAt!==null||['completed','wont_do'].includes(before.lifecycle))fail(422,'Không đổi nhóm công việc đã kết thúc.');if(input.intent.kind!==v.kind)fail(422,'Chỉ thay đổi thuộc tính đang nhóm.');
   let patch:TaskPatch;try{patch=groupMovePatch(before,input.intent);}catch{fail(422,'Giá trị nhóm đích không hợp lệ.');}
   if(patch!.assigneeId!==undefined&&patch!.assigneeId!==before.assigneeId){if(actor.role===UserRole.CHILD&&before.rewardPoints>0)fail(403,'Không được đổi người nhận công việc có thưởng.');const raw=patch!.assigneeId===null?null:reader.get('SELECT data FROM users WHERE id=?',patch!.assigneeId);if(patch!.assigneeId!==null&&(!raw||JSON.parse(raw.data).isDeleted||!Object.values(UserRole).includes(JSON.parse(raw.data).role)))fail(422,'Người được giao không hợp lệ.');}
   const tagTarget=v.kind==='tag'?target(reader,actor,(input.intent as Extract<GroupMoveIntent,{kind:'tag'}>).target):null;
   if(v.kind==='tag'&&(input.intent as Extract<GroupMoveIntent,{kind:'tag'}>).target===null&&patch!.tagIds!.length>0)fail(422,'Chọn thay thế toàn bộ thẻ để bỏ phân loại.');
   prune();if(refs.size>=limit)fail(429,'Bộ nhớ xem trước nhóm đã đầy.');
   const plan:Plan={actor:structuredClone(actor),viewId:v.view.id,viewRevision:v.view.revision,boardId:v.board.id,boardRevision:v.boardRevision,taskId:before.id,taskRevision:before.revision,kind:v.kind,...(v.kind==='tag'?{tagTargetId:(input.intent as Extract<GroupMoveIntent,{kind:'tag'}>).target,targetDigest:tagTarget?.digest??null}:{}),taskDigest:hash(before),viewDigest:hash(v.view),patch:patch!,...(Object.hasOwn(input,'beforeTaskId')?{rankPlan:ranked(reader,actor,v,patch!,input.beforeTaskId!,clock,v.kind==='tag'?(input.intent as Extract<GroupMoveIntent,{kind:'tag'}>).target:undefined)}:{}),clock,day:localDateAt(utcInstant(clock.nowUtc),clock.timezone)},bytes=Buffer.byteLength(JSON.stringify(plan));
   if(bytes+[...refs.values()].reduce((sum,r)=>sum+r.bytes,0)>byteLimit)fail(429,'Bộ nhớ xem trước nhóm đã đầy.');
   const id=randomUUID(),expiresAt=now()+ttl;refs.set(id,{actor:structuredClone(actor),expiresAt,retireAt:expiresAt+ttl,bytes,plan});
   return structuredClone({id,viewId:plan.viewId,viewRevision:plan.viewRevision,boardId:plan.boardId,boardRevision:plan.boardRevision,taskId:plan.taskId,taskRevision:plan.taskRevision,...(v.kind==='tag'?{tagTargetId:plan.tagTargetId}:{}),before,after:{...before,...plan.patch},...(plan.rankPlan?{beforeTaskId:plan.rankPlan.beforeTaskId,rank:plan.rankPlan.rank.rank}:{}),clock,expiresAt:new Date(expiresAt).toISOString()});
  },
  apply(ctx:AppCommand,input:GroupMoveApplyInput){
   syntax(()=>{keys(object(input),['viewId','taskId','previewId','expectedViewRevision','expectedBoardRevision','tagTargetId']);if(Object.hasOwn(input,'tagTargetId')&&input.tagTargetId!==null)text(input.tagTargetId,256);for(const id of [input.viewId,input.taskId,input.previewId])text(id,256);integer(input.expectedViewRevision,1);integer(input.expectedBoardRevision,1);});const preflight=scope(ctx.actor,input);targetScope(reader,ctx.actor,preflight.kind,input);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:grouped-board:move',requestId:ctx.requestId,payloadHash:hash({expectedRevision:ctx.expectedRevision,input})},tx=>{
    const v=scope(ctx.actor,input,tx),currentTarget=targetScope(tx,ctx.actor,v.kind,input);prune();const ref=refs.get(input.previewId);if(!ref||ref.actor.userId!==ctx.actor.userId||ref.actor.role!==ctx.actor.role)fail(404,'Không tìm thấy bản xem trước nhóm.');if(!ref.plan||ref.expiresAt<=now())fail(409,'Bản xem trước nhóm đã hết hạn.');const plan=ref.plan!,current=now(),clock={nowUtc:new Date(current).toISOString(),timezone:plan.clock.timezone};
    if(plan.viewId!==input.viewId||plan.taskId!==input.taskId||plan.boardId!==v.board.id)fail(404,'Bản xem trước không thuộc công việc này.');
    if(v.kind==='tag'&&(plan.tagTargetId!==input.tagTargetId||(currentTarget?.digest??null)!==plan.targetDigest))fail(409,'Nhãn đích vừa thay đổi; xem trước lại.');
    if(hash(projectTaskRecord(v.before))!==plan.taskDigest||hash(v.view)!==plan.viewDigest||plan.kind!==v.kind||v.view.revision!==plan.viewRevision||input.expectedViewRevision!==plan.viewRevision||v.boardRevision!==plan.boardRevision||input.expectedBoardRevision!==plan.boardRevision||v.before.revision!==plan.taskRevision||ctx.expectedRevision!==plan.taskRevision||current<utcInstant(plan.clock.nowUtc)||localDateAt(current,clock.timezone)!==plan.day||!matchesFilter(projectTaskRecord(v.before),v.view.filter,clock))fail(409,'Góc nhìn hoặc công việc đã thay đổi; xem trước lại.');
    if(plan.rankPlan&&hash(ranked(tx,ctx.actor,v,plan.patch,plan.rankPlan.beforeTaskId,clock,plan.tagTargetId))!==hash(plan.rankPlan))fail(409,'Nhóm hoặc vị trí đã thay đổi; xem trước lại.');
    const changed=Object.entries(plan.patch).some(([key,value])=>!isDeepStrictEqual(v.before[key as keyof typeof v.before],value)),row=changed?updateTaskWithinTransaction(tx,ctx,v.before.id,plan.patch):v.before,task=projectTaskRecord(row),actualGroups=projectTaskGroups([task],v.kind,clock).cards.map(c=>c.group),actualGroup=v.kind==='tag'?actualGroups.find(g=>g.value===plan.tagTargetId):actualGroups[0];if(!actualGroup)fail(422,'Công việc không thuộc nhãn đích.');
    let rankChanged=false;
    if(plan.rankPlan){const ranking=plan.rankPlan.rank,writes=ranking.rebalance.length?ranking.rebalance:[{taskId:task.id,rank:ranking.rank}];
     for(const item of writes){const prior=tx.get('SELECT rank,column_id FROM productivity_board_positions WHERE board_id=? AND task_id=?',v.board.id,item.taskId);if(!prior)fail(409,'Vị trí bảng đã thay đổi.');if(prior.rank!==item.rank){tx.run('UPDATE productivity_board_positions SET rank=? WHERE board_id=? AND task_id=?',item.rank,v.board.id,item.taskId);rankChanged=true;}}
     if(rankChanged&&!changed){if(v.boardRevision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản bảng đã đạt giới hạn.');tx.run('UPDATE productivity_boards SET revision=revision+1 WHERE id=?',v.board.id);}
    }
    const visible=createTaskAccess(tx).getTask(ctx.actor,task.id)!==null;ports.afterWrite?.();return {viewId:v.view.id,boardId:v.board.id,boardRevision:tx.get('SELECT revision FROM productivity_boards WHERE id=?',v.board.id).revision,task,taskChanged:changed,...(plan.rankPlan?{rankChanged}:{}),actualGroup,...(v.kind==='tag'?{actualGroups}:{}),filteredOut:!visible||!matchesFilter(task,v.view.filter,clock)};
   });
  },
 };
}
