import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {AppActor,QueryClock,TaskRecord} from '../../src/features/productivity/contracts.js';
import {integer,keys,object,text} from '../../src/features/productivity/validation.js';
import {timezoneFormatter,utcInstant} from '../../src/features/productivity/dates.js';
import {UserRole} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import {taskScope,type TaskReader} from './access.js';
import {resolveBoardReference} from './boardViewSchema.js';
import {workflowColumn} from './board.js';
import {createTaskQuery} from './query.js';
import type {SavedTaskView} from './views.js';
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'board-projection');};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const labels:Record<string,string>={none:'Không phân loại',todo:'Cần làm',doing:'Đang làm',waiting:'Bị chặn',review:'Chờ duyệt',done:'Hoàn thành',wont_do:'Không làm',trash:'Thùng rác'};
const workflowSql="CASE WHEN t.deleted_at IS NOT NULL THEN 'trash' WHEN t.lifecycle='wont_do' THEN 'wont_do' WHEN t.pending_approval=1 THEN 'review' WHEN t.lifecycle='completed' THEN 'done' WHEN t.blocked=1 THEN 'waiting' WHEN t.lifecycle='in_progress' THEN 'doing' ELSE 'todo' END";
export const boardReadLimits=Object.freeze({rows:5000,bytes:16*1024*1024,tags:20000,columns:1000,pageSize:100,ttlMs:15*60000});
export interface BoardReadOptions {cursor?:string;timezone?:string}
interface Card {task:TaskRecord;rank:number}
export interface BoardColumnProjection {id:string;columnKey:string;sectionId:string|null;title:string;rank:number;revision:number;visibleCardCount:number;cards:Card[];wip:{policy:'off'|'soft'|'hard';limit:number|null;activeRootCount:number|null;visibility:'complete'|'redacted'}}
/** Actor-filtered read projection only. Admission uses the existing trusted full
 * SQL invariant in the write transaction; this DTO cannot grant a WIP override. */
export function createBoardProjection(ports:{reader:TaskReader;views:{getView(actor:AppActor,id:string):SavedTaskView};now?:()=>number;pageSize?:number;maxRows?:number;maxBytes?:number}){
 const reader=ports.reader,now=ports.now??Date.now,secret=randomBytes(32),pageSize=ports.pageSize??50,maxRows=ports.maxRows??boardReadLimits.rows,maxBytes=ports.maxBytes??boardReadLimits.bytes,query=createTaskQuery({reader});
 integer(pageSize,1,boardReadLimits.pageSize);integer(maxRows,1,boardReadLimits.rows);integer(maxBytes,1,boardReadLimits.bytes);
 const sign=(body:string)=>createHmac('sha256',secret).update(body).digest();
 const open=(cursor:string):{clock:QueryClock;offset:number;identity:string}=>{
  try{text(cursor,2048);const parts=cursor.split('.');if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))throw Error();const signature=Buffer.from(parts[1],'base64url');if(signature.length!==32||!timingSafeEqual(signature,sign(parts[0])))throw Error();const p=object(JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')));keys(p,['version','clock','offset','identity']);if(p.version!==1)throw Error();const clock=object(p.clock);keys(clock,['nowUtc','timezone']);text(clock.nowUtc,64);text(clock.timezone,100);utcInstant(clock.nowUtc);timezoneFormatter(clock.timezone);integer(p.offset,1,maxRows);text(p.identity,64);if(!/^[a-f0-9]{64}$/.test(p.identity))throw Error();return {clock:clock as unknown as QueryClock,offset:p.offset,identity:p.identity};}catch{fail(400,'Con trỏ bảng không hợp lệ.');}
 };
 return {project(actor:AppActor,viewId:string,options:unknown={}){
  // Existing view owner/session checks precede all board and Task data reads.
  const view=ports.views.getView(actor,viewId);
  let input:Record<string,any>;try{input=object(options);keys(input,['cursor','timezone']);if(input.cursor!==undefined)text(input.cursor,2048);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}}catch{fail(400,'Tùy chọn bảng không hợp lệ.');}
  const config=view.config;if(config.kind!=='kanban')return fail(422,'Góc nhìn chưa liên kết bảng chuẩn.');
  if(config.boardId===undefined)return fail(422,'Góc nhìn chưa liên kết bảng chuẩn.');
  const board=resolveBoardReference(reader,actor,config.boardId,config.mode);
  if(config.group!=='none'||config.sort!=='rank')fail(422,'Cách nhóm hoặc sắp xếp bảng chưa được hỗ trợ.');
  const current=now(),prior=input.cursor===undefined?null:open(input.cursor),clock=prior?.clock??{nowUtc:new Date(current).toISOString(),timezone:input.timezone??'Asia/Saigon'};
  if(prior&&(utcInstant(clock.nowUtc)>current||utcInstant(clock.nowUtc)+boardReadLimits.ttlMs<=current||input.timezone!==undefined&&input.timezone!==clock.timezone))fail(409,'Trang bảng đã hết hạn; tải lại bảng.');
  const revision=reader.get('SELECT revision FROM productivity_boards WHERE id=?',board.id).revision,scope=taskScope(actor,{includeTrash:view.filter.includeTrash===true}),condition='t.list_id=? AND ('+scope.sql+')',args=[board.list_id,...scope.args];
  // Scalar SQL gates use the same ACL before any body or provenance is decoded.
  const size=reader.get('SELECT COUNT(*)AS n,COALESCE(SUM(length(CAST(t.title AS BLOB))+length(CAST(t.body AS BLOB))+length(CAST(t.legacy_json AS BLOB))),0)AS bytes FROM productivity_tasks t WHERE '+condition,...args);
  const tags=reader.get('SELECT COUNT(*)AS n FROM productivity_task_tags tg JOIN productivity_tasks t ON t.id=tg.task_id WHERE '+condition,...args);
  if(size.n>maxRows||size.bytes>maxBytes||tags.n>boardReadLimits.tags)fail(422,'Bảng vượt giới hạn đọc; cần thu hẹp phạm vi danh sách.');
  if(reader.get("SELECT count(*)AS n FROM productivity_board_columns c LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='section' AND m.entity_id=c.section_id WHERE c.board_id=? AND c.archived_at IS NULL AND m.archived_at IS NULL",board.id).n>boardReadLimits.columns)fail(422,'Bảng vượt giới hạn số cột.');
  const columns:BoardColumnProjection[]=reader.all("SELECT c.*,s.title FROM productivity_board_columns c LEFT JOIN productivity_sections s ON s.id=c.section_id AND s.list_id=c.list_id LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='section' AND m.entity_id=c.section_id WHERE c.board_id=? AND c.archived_at IS NULL AND m.archived_at IS NULL ORDER BY c.rank,c.id",board.id).map(c=>({id:c.id,columnKey:c.column_key,sectionId:c.section_id,title:c.title??labels[c.column_key]??c.column_key,rank:c.rank,revision:c.revision,visibleCardCount:0,cards:[],wip:{policy:c.wip_policy,limit:c.wip_limit,activeRootCount:actor.role===UserRole.ADMIN?0:null,visibility:actor.role===UserRole.ADMIN?'complete':'redacted'}}));
  const byKey=new Map(columns.map(c=>[c.columnKey,c])),ordering=new Map<string,number>(reader.all('SELECT t.id,COALESCE(p.rank,t.rank)AS rank FROM productivity_tasks t LEFT JOIN productivity_board_positions p ON p.task_id=t.id AND p.board_id=? WHERE '+condition,board.id,...args).map(r=>[r.id,r.rank]));
  const filter={...view.filter,listIds:view.filter.listIds===undefined?[board.list_id]:view.filter.listIds.filter(id=>id===board.list_id)};
  const rows=query.readFilteredTasks(actor,filter,clock),cards:{column:BoardColumnProjection;card:Card}[]=[];
  for(const task of rows){const key=board.mode==='workflow'?workflowColumn(task):task.sectionId===null?'none':'section:'+task.sectionId,column=byKey.get(key);if(!column)fail(409,'Cột bảng đã thay đổi; tải lại bảng.');const rank=ordering.get(task.id);if(!Number.isSafeInteger(rank))fail(409,'Thứ tự bảng không hợp lệ.');column.visibleCardCount++;cards.push({column,card:{task,rank:rank!}});}
  const order=new Map(columns.map((c,i)=>[c.id,i]));cards.sort((a,b)=>order.get(a.column.id)!-order.get(b.column.id)!||a.card.rank-b.card.rank||(a.card.task.id<b.card.task.id?-1:a.card.task.id>b.card.task.id?1:0));
  if(actor.role===UserRole.ADMIN){const membership=board.mode==='workflow'?workflowSql:"CASE WHEN t.section_id IS NULL THEN 'none' ELSE 'section:'||t.section_id END";for(const row of reader.all('SELECT '+membership+" AS lane,count(*)AS n FROM productivity_tasks t WHERE t.list_id=? AND t.parent_id IS NULL AND t.deleted_at IS NULL AND t.lifecycle NOT IN('completed','wont_do') GROUP BY "+membership,board.list_id)){const column=byKey.get(row.lane);if(column)column.wip.activeRootCount=row.n;}}
  const identity=hash({actor,viewId:view.id,viewRevision:view.revision,filter:view.filter,config:view.config,boardId:board.id,revision,clock,rows:cards.map(r=>[r.card.task.id,r.card.task.revision,r.column.id,r.card.rank])});
  if(prior&&(prior.identity!==identity||prior.offset>=cards.length))fail(409,'Công việc trong bảng đã thay đổi; tải lại bảng.');
  const offset=prior?.offset??0;for(const row of cards.slice(offset,offset+pageSize))row.column.cards.push(row.card);
  let nextCursor:string|null=null;if(offset+pageSize<cards.length){const body=Buffer.from(JSON.stringify({version:1,clock,offset:offset+pageSize,identity})).toString('base64url');nextCursor=body+'.'+sign(body).toString('base64url');}
  return {viewId:view.id,viewRevision:view.revision,boardId:board.id,boardRevision:revision,mode:board.mode,clock,columns,totalUnique:cards.length,nextCursor};
 }};
}
