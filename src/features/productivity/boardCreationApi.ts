import type {BoardViewCreateInput,BoardTaskCreateInput} from '../../../server/productivity/boardCreation.js';
import type {SavedTaskView} from '../../../server/productivity/views.js';
import type {TaskRecord} from './contracts.js';
import {decodeBoardPolicy,type BoardPolicy} from './boardPolicyApi.js';
import {object,keys,text,choice,integer,boolean} from './validation.js';
import {assertDue} from './dates.js';
export type {BoardViewCreateInput,BoardTaskCreateInput};
type Read=(path:string,method?:string,body?:unknown,requestId?:string,signal?:AbortSignal)=>Promise<Record<string,any>>;
const fail=():never=>{throw Error('Inconsistent board creation result');};
export function assertBoardViewDraft(input:BoardViewCreateInput){keys(object(input),['listId','mode','title']);text(input.listId,256);text(input.title,500);choice(input.mode,['sections','workflow']);}
export function assertBoardTaskDraft(board:BoardPolicy,input:BoardTaskCreateInput){
 decodeBoardPolicy(board,board.id);keys(object(input),['viewId','expectedViewRevision','columnId','title','priority','due','isShared']);text(input.viewId,256);integer(input.expectedViewRevision,1);text(input.columnId,256);text(input.title,500);choice(input.priority,['high','medium','low','none']);assertDue(input.due);boolean(input.isShared);
 const column=board.columns.find(c=>c.id===input.columnId);if(!column||board.mode==='workflow'&&column.columnKey!=='todo')fail();return column;
}
/** No retries: the session-owned draft retains its exact command after an unknown result. */
export function createBoardCreationApi(read:Read,decode:{view(value:unknown):SavedTaskView;task(value:unknown):TaskRecord}){return {
 async createKanbanView(input:BoardViewCreateInput,requestId:string){
  assertBoardViewDraft(input);const raw=await read('/api/productivity/boards/views','POST',{expectedRevision:0,input},requestId);keys(raw,['board','view']);const b=object(raw.board);text(b.id,256);const board=decodeBoardPolicy(b,b.id as string),view=decode.view(raw.view),c=view.config;
  if(board.listId!==input.listId||board.mode!==input.mode||view.title!==input.title||view.revision!==1||c.kind!=='kanban'||c.mode!==input.mode||c.boardId!==board.id||c.group!=='none'||c.sort!=='rank'||c.columns.length!==0||JSON.stringify(view.filter)!==JSON.stringify({rootsOnly:true,listIds:[input.listId]}))fail();return {board,view};
 },
 async createKanbanTask(board:BoardPolicy,input:BoardTaskCreateInput,requestId:string){
  const column=assertBoardTaskDraft(board,input),raw=await read('/api/productivity/boards/tasks','POST',{expectedRevision:board.revision,input},requestId);keys(raw,['viewId','boardId','boardRevision','task']);integer(raw.boardRevision,1);const task=decode.task(raw.task);
  if(raw.viewId!==input.viewId||raw.boardId!==board.id||raw.boardRevision!==board.revision+1||task.title!==input.title||task.listId!==board.listId||task.sectionId!==column.sectionId||task.parentId!==null||task.lifecycle!=='todo'||task.pendingApproval||task.rewardPoints!==0||task.revision!==1||task.assigneeId!==null||task.isShared!==input.isShared||task.priority!==input.priority||task.blocked||task.blockedReason!==null||task.deletedAt!==null||task.tagIds.length!==0||task.scheduledStart!==null||task.scheduledEnd!==null||JSON.stringify(task.due)!==JSON.stringify(input.due))fail();
  return {viewId:raw.viewId as string,boardId:board.id,boardRevision:raw.boardRevision as number,task};
 }
};}
