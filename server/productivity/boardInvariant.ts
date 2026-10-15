import type {AppWriteTx} from '../appStore.js';
import type {TaskRecord} from '../../src/features/productivity/contracts.js';
import {AppStoreError} from '../appErrors.js';
const workflowSql="CASE WHEN deleted_at IS NOT NULL THEN 'trash' WHEN lifecycle='wont_do' THEN 'wont_do' WHEN pending_approval=1 THEN 'review' WHEN lifecycle='completed' THEN 'done' WHEN blocked=1 THEN 'waiting' WHEN lifecycle='in_progress' THEN 'doing' ELSE 'todo' END";
const workflow=(task:TaskRecord)=>task.deletedAt!==null?'trash':task.lifecycle==='wont_do'?'wont_do':task.pendingApproval?'review':task.lifecycle==='completed'?'done':task.blocked?'waiting':task.lifecycle==='in_progress'?'doing':'todo';
const active=(row:{parent_id:unknown;deleted_at:unknown;lifecycle:unknown}|undefined)=>!!row&&row.parent_id===null&&row.deleted_at===null&&!['completed','wont_do'].includes(row.lifecycle as string);
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'board-invariant');};
/** Internal store boundary, always under the existing I01 transaction. No actor
 * override is exposed here: generic/legacy writers cannot acquire one implicitly.
 * An unregistered candidate is exercised explicitly in synthetic fixtures only;
 * ordinary supported schema1–6 has no board tables and remains inert. */
export function prepareBoardTaskWrite(tx:AppWriteTx,task:TaskRecord):()=>void {
 if(!tx.get("SELECT name FROM sqlite_master WHERE type='table' AND name='productivity_boards'"))return ()=>{};
 const old=tx.get('SELECT *, '+workflowSql+' AS workflow_column FROM productivity_tasks WHERE id=?',task.id);
 const boards=tx.all('SELECT * FROM productivity_boards WHERE list_id IN(?,?) ORDER BY id',task.listId,old?.list_id??task.listId);
 if(!boards.length)return ()=>{};
 const previous=new Map(tx.all('SELECT * FROM productivity_board_positions WHERE task_id=?',task.id).map(row=>[row.board_id,row]));
 const plans=boards.map(board=>{
  if(!Number.isSafeInteger(board.revision)||board.revision>=Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản bảng đã đạt giới hạn.');
  if(board.list_id!==task.listId||board.mode==='sections'&&task.deletedAt!==null)return {board,column:null};
  const key=board.mode==='sections'?(task.sectionId===null?'none':'section:'+task.sectionId):workflow(task);
  const column=tx.get('SELECT * FROM productivity_board_columns WHERE board_id=? AND column_key=? AND archived_at IS NULL',board.id,key);
  if(!column)fail(422,'Cột đích chưa sẵn sàng.');
  const candidateActive=task.parentId===null&&task.deletedAt===null&&!['completed','wont_do'].includes(task.lifecycle);
  if(candidateActive&&column.wip_policy==='hard'){
   const same=active(old)&&old.list_id===task.listId&&(board.mode==='sections'?old.section_id===task.sectionId:old.workflow_column===key);
   const predicate=board.mode==='sections'?'section_id IS ?':workflowSql+'=?';
   const count=tx.get("SELECT count(*) AS n FROM productivity_tasks WHERE list_id=? AND id!=? AND parent_id IS NULL AND deleted_at IS NULL AND lifecycle NOT IN('completed','wont_do') AND "+predicate,task.listId,task.id,board.mode==='sections'?task.sectionId:key).n;
   if(!same&&count>=column.wip_limit)fail(422,'Cột đích đã đạt giới hạn công việc.');
  }
  return {board,column};
 });
 // Remove before changing the compound Task-list identity; every caller owns the
 // same transaction, so a later validation/error restores all old positions.
 tx.run('DELETE FROM productivity_board_positions WHERE task_id=?',task.id);
 return ()=>{
  for(const {board,column}of plans){
   if(column){
    const prior=previous.get(board.id);
    const rank=prior?.column_id===column.id?prior.rank:(tx.get('SELECT max(rank)AS rank FROM productivity_board_positions WHERE board_id=? AND column_id=?',board.id,column.id)?.rank??0)+1024;
    if(!Number.isSafeInteger(rank)||rank<0)fail(422,'Thứ tự bảng đã đạt giới hạn.');
    tx.run('INSERT INTO productivity_board_positions VALUES(?,?,?,?,?)',board.id,task.id,task.listId,column.id,rank);
   }
   tx.run('UPDATE productivity_boards SET revision=revision+1 WHERE id=?',board.id);
  }
 };
}
