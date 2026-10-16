import type {AppActor,QueryClock} from '../../src/features/productivity/contracts.js';
import {integer} from '../../src/features/productivity/validation.js';
import {utcInstant,localDateAt,calendarDate} from '../../src/features/productivity/dates.js';
import {AppStoreError} from '../appErrors.js';
import {taskScope,type TaskReader} from './access.js';
import {boardReadLimits} from './boardProjection.js';
import {createTaskQuery} from './query.js';
import {groupProjectionLimits,type BoardGroupKind} from './grouping.js';
import type {SavedTaskView} from './views.js';
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'grouped-board');};
/** Trusted internal read stage. Caller first resolves the current owned view and
 * canonical board/list authority. Scalar ACL resource checks precede Task decode;
 * both page projection and grouped rank commands consume the same admitted rows. */
export function createGroupedBoardReader(ports:{reader:TaskReader}){
 const reader=ports.reader,query=createTaskQuery({reader});
 return {read(actor:AppActor,view:SavedTaskView,board:{id:string;list_id:string},kind:BoardGroupKind,clock:QueryClock,limits:{maxRows:number;maxBytes:number}={maxRows:boardReadLimits.rows,maxBytes:boardReadLimits.bytes}){
  const {maxRows,maxBytes}=limits;integer(maxRows,1,boardReadLimits.rows);integer(maxBytes,1,boardReadLimits.bytes);
  const revision=reader.get('SELECT revision FROM productivity_boards WHERE id=?',board.id).revision,scope=taskScope(actor,{includeTrash:view.filter.includeTrash===true}),condition='t.list_id=? AND ('+scope.sql+')',args=[board.list_id,...scope.args];
  const size=reader.get('SELECT COUNT(*)AS n,COALESCE(SUM(length(CAST(t.title AS BLOB))+length(CAST(t.body AS BLOB))+length(CAST(t.legacy_json AS BLOB))),0)AS bytes FROM productivity_tasks t WHERE '+condition,...args),tags=reader.get('SELECT COUNT(*)AS n FROM productivity_task_tags tg JOIN productivity_tasks t ON t.id=tg.task_id WHERE '+condition,...args);
  if(size.n>maxRows||size.bytes>maxBytes||tags.n>boardReadLimits.tags)fail(422,'Bảng vượt giới hạn đọc; thu hẹp danh sách.');
  // Admit distinct group keys with scalar ACL-filtered facts before Task/body
  // decoding. The resource scope is the same whole visible list as row/byte gates.
  if(kind==='tag'&&reader.get('SELECT count(*)AS n FROM productivity_tasks t LEFT JOIN productivity_task_tags tg ON tg.task_id=t.id WHERE '+condition,...args).n>groupProjectionLimits.references)fail(422,'Bảng vượt giới hạn số thẻ hiển thị.');
  const groupValues=new Set<string|null>(),facts=kind==='due'?reader.all('SELECT DISTINCT t.due_kind,t.due_date,t.due_instant FROM productivity_tasks t WHERE '+condition,...args):kind==='tag'?reader.all('SELECT DISTINCT tg.tag_id AS value FROM productivity_tasks t LEFT JOIN productivity_task_tags tg ON tg.task_id=t.id WHERE '+condition,...args):reader.all('SELECT DISTINCT '+(kind==='priority'?'t.priority':'t.assignee_id')+' AS value FROM productivity_tasks t WHERE '+condition,...args);
  for(const fact of facts){let value:string|null;if(kind!=='due')value=fact.value;else if(fact.due_kind==='none')value=null;else if(fact.due_kind==='all_day'){calendarDate(fact.due_date);value=fact.due_date;}else if(fact.due_kind==='timed')value=localDateAt(utcInstant(fact.due_instant),clock.timezone);else return fail(422,'Dữ liệu nhóm không hợp lệ.');groupValues.add(value);if(groupValues.size>boardReadLimits.columns)fail(422,'Bảng vượt giới hạn số nhóm; thu hẹp danh sách.');}
  const filter={...view.filter,listIds:view.filter.listIds===undefined?[board.list_id]:view.filter.listIds.filter(id=>id===board.list_id)},rows=query.readFilteredTasks(actor,filter,clock),tasksById=new Map(rows.map(t=>[t.id,t]));
  const ordering=new Map<string,number>(reader.all('SELECT t.id,COALESCE(p.rank,t.rank)AS rank FROM productivity_tasks t LEFT JOIN productivity_board_positions p ON p.task_id=t.id AND p.board_id=? WHERE '+condition,board.id,...args).map(r=>[r.id,r.rank]));
  return {revision,rows,tasksById,ordering};
 }};
}
