import {productivityVersionsFrom} from './knownVersions.js';
import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,AppCommand} from '../../src/features/productivity/contracts.js';
import {object,keys,text,integer,choice} from '../../src/features/productivity/validation.js';
import {UserRole} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {listPermission,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
import {planBoardRank} from './rank.js';
export interface BoardPolicyInput {columnKey:string;policy:'off'|'soft'|'hard';limit:number|null}
export interface BoardConfigureInput {listId:string;mode:'sections'|'workflow';policies:BoardPolicyInput[]}
export interface SharedBoardConfig {id:string;listId:string;mode:'sections'|'workflow';revision:number;columns:{id:string;columnKey:string;sectionId:string|null;rank:number;revision:number;wip:{policy:'off'|'soft'|'hard';limit:number|null}}[]}
const workflowKeys=['todo','doing','waiting','review','done','wont_do','trash']as const;
const workflowSql="CASE WHEN deleted_at IS NOT NULL THEN 'trash' WHEN lifecycle='wont_do' THEN 'wont_do' WHEN pending_approval=1 THEN 'review' WHEN lifecycle='completed' THEN 'done' WHEN blocked=1 THEN 'waiting' WHEN lifecycle='in_progress' THEN 'doing' ELSE 'todo' END";
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'board-config');};
function validate(input:unknown):asserts input is BoardConfigureInput {
 try{const p=object(input);keys(p,['listId','mode','policies']);text(p.listId,256);choice(p.mode,['sections','workflow']);if(!Array.isArray(p.policies)||p.policies.length>1000)throw Error();const seen=new Set<string>();for(const value of p.policies){const row=object(value);keys(row,['columnKey','policy','limit']);text(row.columnKey,264);choice(row.policy,['off','soft','hard']);if(row.policy==='off'){if(row.limit!==null)throw Error();}else integer(row.limit,1);if(seen.has(row.columnKey))throw Error();seen.add(row.columnKey);}}
 catch{fail(400,'Cấu hình bảng không hợp lệ.');}
}
function authorize(reader:TaskReader,ctx:AppCommand,listId:string):void {
 assertContext(ctx,reader);
 if(ctx.actor.role===UserRole.CHILD||ctx.actor.role===UserRole.GUEST)fail(403,'Bạn không có quyền cấu hình bảng.');
 if(!reader.get("SELECT l.id FROM productivity_lists l LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='list' AND m.entity_id=l.id WHERE l.id=? AND m.archived_at IS NULL",listId)||ctx.actor.role!==UserRole.ADMIN&&listPermission(reader,ctx.actor,listId)!=='manage')fail(404,'Không tìm thấy danh sách.');
 if(!productivityVersionsFrom(7).includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))fail(409,'Cần migration bảng trước khi cấu hình.');
}
function projection(tx:TaskReader,id:string):SharedBoardConfig {
 const board=tx.get('SELECT id,list_id,mode,revision FROM productivity_boards WHERE id=?',id);
 return {id:board.id,listId:board.list_id,mode:board.mode,revision:board.revision,columns:tx.all('SELECT * FROM productivity_board_columns WHERE board_id=? AND archived_at IS NULL ORDER BY rank,id',id).map(c=>({id:c.id,columnKey:c.column_key,sectionId:c.section_id,rank:c.rank,revision:c.revision,wip:{policy:c.wip_policy,limit:c.wip_limit}}))};
}
/** Shared configuration through the internal authenticated board router; no UI activation. */
export function createBoardCatalog(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;afterWrite?:()=>void}){
 return {read(actor:AppActor,id:string):SharedBoardConfig {
  const ctx={actor,expectedRevision:0,requestId:'board-policy:read'};assertContext(ctx,ports.reader);
  try{text(id,256);}catch{fail(400,'Mã bảng không hợp lệ.');}
  if(!productivityVersionsFrom(7).includes(ports.reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))fail(409,'Cần migration bảng trước khi đọc cấu hình.');
  const board=ports.reader.get('SELECT list_id FROM productivity_boards WHERE id=?',id);if(!board)fail(404,'Không tìm thấy bảng.');
  authorize(ports.reader,ctx,board.list_id);return projection(ports.reader,id);
 },configure(ctx:AppCommand,input:BoardConfigureInput):SharedBoardConfig {
  validate(input);authorize(ports.reader,ctx,input.listId);
  return ports.write({actorId:ctx.actor.userId,command:'productivity:board:configure',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({expectedRevision:ctx.expectedRevision,input})).digest('hex')},tx=>{
   authorize(tx,ctx,input.listId);
   const before=tx.get('SELECT * FROM productivity_boards WHERE list_id=? AND mode=?',input.listId,input.mode);
   if((before?.revision??0)!==ctx.expectedRevision)fail(409,'Bảng vừa được thay đổi.');
   if(before?.revision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản bảng đã đạt giới hạn.');
   const canonical:{key:string;sectionId:string|null}[]=input.mode==='workflow'?workflowKeys.map(key=>({key,sectionId:null})):[{key:'none',sectionId:null},...tx.all("SELECT s.id FROM productivity_sections s LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='section' AND m.entity_id=s.id WHERE s.list_id=? AND m.archived_at IS NULL ORDER BY s.title,s.id LIMIT 1001",input.listId).map(row=>({key:'section:'+row.id,sectionId:row.id}))];
   if(canonical.length>1000)fail(422,'Bảng vượt giới hạn số cột.');
   const allowed=new Set(canonical.map(c=>c.key));if(input.policies.some(p=>!allowed.has(p.columnKey)))fail(422,'Cột cấu hình không hợp lệ.');
   const id=before?.id??randomUUID(),revision=(before?.revision??0)+1;
   if(!before)tx.run('INSERT INTO productivity_boards VALUES(?,?,?,?)',id,input.listId,input.mode,revision);
   const existing=tx.all('SELECT * FROM productivity_board_columns WHERE board_id=?',id),byKey=new Map(existing.map(c=>[c.column_key,c]));let lastRank=existing.reduce((max,c)=>Math.max(max,c.rank),-1024);
   for(const c of canonical){
    const old=byKey.get(c.key),policy=input.policies.find(p=>p.columnKey===c.key),columnRevision=old?(old.revision+1):1;
    if(!Number.isSafeInteger(columnRevision))fail(422,'Phiên bản cột đã đạt giới hạn.');
    if(!old){lastRank+=1024;if(!Number.isSafeInteger(lastRank))fail(422,'Thứ tự cột đã đạt giới hạn.');}
    tx.run('INSERT INTO productivity_board_columns VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(board_id,id) DO UPDATE SET wip_limit=excluded.wip_limit,wip_policy=excluded.wip_policy,archived_at=NULL,revision=excluded.revision',id,old?.id??randomUUID(),input.listId,c.key,c.sectionId,old?.rank??lastRank,policy?policy.limit:(old?.wip_limit??null),policy?.policy??old?.wip_policy??'off',null,columnRevision);
   }
   for(const c of existing)if(!allowed.has(c.column_key)&&c.archived_at===null){if(tx.get('SELECT task_id FROM productivity_board_positions WHERE board_id=? AND column_id=? LIMIT 1',id,c.id))fail(422,'Cần chuyển công việc trước khi lưu trữ cột.');if(c.revision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản cột đã đạt giới hạn.');tx.run('UPDATE productivity_board_columns SET archived_at=?,revision=revision+1 WHERE board_id=? AND id=?',new Date().toISOString(),id,c.id);}
   seedPositions(tx,id,input.listId,input.mode);
   if(before)tx.run('UPDATE productivity_boards SET revision=? WHERE id=?',revision,id);
   ports.afterWrite?.();return projection(tx,id);
  });
 }};
}
function seedPositions(tx:AppWriteTx,boardId:string,listId:string,mode:'sections'|'workflow'):void {
 const columns=new Map(tx.all('SELECT id,column_key FROM productivity_board_columns WHERE board_id=? AND archived_at IS NULL',boardId).map(c=>[c.column_key,c.id]));
 const missing=tx.all('SELECT t.id,t.section_id,t.deleted_at,'+workflowSql+" AS lane FROM productivity_tasks t WHERE t.list_id=? AND NOT EXISTS(SELECT 1 FROM productivity_board_positions p WHERE p.board_id=? AND p.task_id=t.id) ORDER BY t.rank,t.id LIMIT 100001",listId,boardId);
 if(missing.length>100000)fail(422,'Bảng vượt giới hạn số công việc.');
 const maxima=new Map(tx.all('SELECT column_id,max(rank)AS rank FROM productivity_board_positions WHERE board_id=? GROUP BY column_id',boardId).map(p=>[p.column_id,p.rank]));
 for(const task of missing){
  if(mode==='sections'&&task.deleted_at!==null)continue;
  const key=mode==='workflow'?task.lane:task.section_id===null?'none':'section:'+task.section_id,columnId=columns.get(key);if(!columnId)fail(422,'Cột công việc chưa sẵn sàng.');
  let rank=(maxima.get(columnId)??0)+1024;
  if(!Number.isSafeInteger(rank)){
   const plan=planBoardRank({positions:tx.all('SELECT task_id AS taskId,rank FROM productivity_board_positions WHERE board_id=? AND column_id=? ORDER BY rank,task_id',boardId,columnId),taskId:task.id,beforeTaskId:null});rank=plan.rank;
   for(const p of plan.rebalance)if(p.taskId!==task.id)tx.run('UPDATE productivity_board_positions SET rank=? WHERE board_id=? AND task_id=?',p.rank,boardId,p.taskId);
  }
  tx.run('INSERT INTO productivity_board_positions VALUES(?,?,?,?,?)',boardId,task.id,listId,columnId,rank);maxima.set(columnId,rank);
 }
}
