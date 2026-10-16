import type {TaskApi} from './api.js';
import type {BoardPage,GroupedBoardPage} from './boardClient.js';
import type {BoardCommandPlan,GroupCommandPlan} from './boardCommandsClient.js';
import type {BoardMovePreviewInput} from '../../../server/productivity/boardMoves.js';
import type {GroupMovePreviewInput} from '../../../server/productivity/groupedBoardMoves.js';
import {groupMovePatch} from './groupMove.js';
import {resolveDue} from './dates.js';
export type KanbanCommandSelection=({kind:'canonical';page:BoardPage}|{kind:'grouped';page:GroupedBoardPage})&{rankSorted:boolean};
export type KanbanCommandPlan={kind:'physical';value:BoardCommandPlan}|{kind:'grouped';value:GroupCommandPlan};
export interface KanbanCommandState {plan:KanbanCommandPlan|null;previewing:boolean;writing:boolean;error:{phase:'preview'|'write'|'refresh';status:number|null}|null}
const empty=():KanbanCommandState=>({plan:null,previewing:false,writing:false,error:null});
type Ports=Pick<TaskApi,'previewBoardMove'|'applyBoardMove'|'previewGroupedMove'|'applyGroupedMove'>&{newRequestId?:()=>string;onCommitted():Promise<void>};
const status=(error:unknown)=>{const n=(error as any)?.status;return typeof n==='number'&&Number.isInteger(n)&&n>=400&&n<=599?n:null;};
/** Owns a transient confirmation and command UUID, never optimistic Task facts.
 * The caller clears/selects on actor, authority, view or projection changes. */
export function createKanbanCommandState(ports:Ports){
 let state=empty(),selection:KanbanCommandSelection|null=null,signature='',disposed=false,epoch=0,sequence=0,active:KanbanCommandPlan|null=null,commandKey:string|undefined,request:AbortController|undefined;
 const listeners=new Set<()=>void>(),publish=(next:KanbanCommandState)=>{state=next;for(const listener of listeners)listener();},current=(generation:number,seq:number)=>!disposed&&epoch===generation&&sequence===seq;
 const invalidate=()=>{epoch++;sequence++;request?.abort();request=undefined;active=null;commandKey=undefined;publish(empty());};
 const failure=(error:unknown,phase:'preview'|'write'|'refresh')=>({phase,status:status(error)});
 const clear=()=>{if(disposed)return;selection=null;signature='';invalidate();};
 const visible=(selected:KanbanCommandSelection,id:string)=>selected.kind==='canonical'?selected.page.columns.flatMap(c=>c.cards).find(card=>card.task.id===id)?.task:selected.page.cards.some(card=>card.taskId===id)?selected.page.tasks.find(task=>task.id===id):undefined;
 const bound=(selected:KanbanCommandSelection,taskId:string,plan:BoardCommandPlan|GroupCommandPlan)=>{const page=selected.page,task=visible(selected,taskId);return !!task&&plan.viewId===page.viewId&&plan.boardId===page.boardId&&plan.viewRevision===page.viewRevision&&plan.boardRevision===page.boardRevision&&plan.taskId===task.id&&plan.taskRevision===task.revision&&plan.clock.timezone===page.clock.timezone;};
 const admitPhysical=(input:BoardMovePreviewInput)=>{if(!selection||selection.kind!=='canonical'||selection.page.mode!=='sections'||!selection.rankSorted||input.viewId!==selection.page.viewId)return false;const page=selection.page,destination=page.columns.find(c=>c.id===input.targetColumnId),task=visible(selection,input.taskId);return !!destination&&!!task&&input.timezone===page.clock.timezone&&(input.beforeTaskId===null||input.beforeTaskId!==input.taskId&&destination.cards.some(c=>c.task.id===input.beforeTaskId));};
 const admitGrouped=(input:GroupMovePreviewInput)=>{try{if(!selection||selection.kind!=='grouped'||input.viewId!==selection.page.viewId||input.timezone!==selection.page.clock.timezone||input.intent.kind!==selection.page.group)return false;const page=selection.page,task=visible(selection,input.taskId);if(!task)return false;const after={...task,...groupMovePatch(task,input.intent)};
  if(input.intent.kind==='tag'){const source=input.intent.source;if((source===null||typeof source==='string')&&!page.cards.some(card=>card.taskId===task.id&&card.group.kind==='tag'&&card.group.value===source))return false;}
  if(Object.hasOwn(input,'beforeTaskId')){if(!selection.rankSorted)return false;const target=input.intent.kind==='priority'?after.priority:input.intent.kind==='assignee'?after.assigneeId:input.intent.kind==='due'?resolveDue(after.due,page.clock).localDate:input.intent.target;if(input.beforeTaskId!==null&&(input.beforeTaskId===task.id||!page.cards.some(card=>card.taskId===input.beforeTaskId&&card.group.kind===input.intent.kind&&card.group.value===target)))return false;}
  return true;}catch{return false;}};
 return {
  snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},clear,
  select(next:KanbanCommandSelection|null){if(disposed)return;const encoded=next===null?'':JSON.stringify(next);if(encoded===signature)return;invalidate();selection=next===null?null:structuredClone(next);signature=encoded;},
  async previewPhysical(input:BoardMovePreviewInput){
   if(disposed||state.writing)return;sequence++;request?.abort();active=null;commandKey=undefined;const selected=selection,packet={...structuredClone(input),timezone:input.timezone??selected?.page.clock.timezone};
   if(!selected||!admitPhysical(packet)){publish({...empty(),error:{phase:'preview',status:422}});return;}
   const generation=epoch,seq=sequence,controller=new AbortController();request=controller;publish({...empty(),previewing:true});if(!current(generation,seq))return;
   try{const plan=await ports.previewBoardMove(packet,{signal:controller.signal});if(!current(generation,seq))return;if(!bound(selected,input.taskId,plan))throw Object.assign(Error('Preview does not match current projection'),{status:409});active={kind:'physical',value:structuredClone(plan)};publish({...empty(),plan:structuredClone(active)});}
   catch(error){if(current(generation,seq))publish({...empty(),error:failure(error,'preview')});}
  },
  async previewGrouped(input:GroupMovePreviewInput){
   if(disposed||state.writing)return;sequence++;request?.abort();active=null;commandKey=undefined;const selected=selection,packet={...structuredClone(input),timezone:input.timezone??selected?.page.clock.timezone};
   if(!selected||!admitGrouped(packet)){publish({...empty(),error:{phase:'preview',status:422}});return;}
   const generation=epoch,seq=sequence,controller=new AbortController();request=controller;publish({...empty(),previewing:true});if(!current(generation,seq))return;
   try{const plan=await ports.previewGroupedMove(packet,{signal:controller.signal});if(!current(generation,seq))return;if(!bound(selected,input.taskId,plan))throw Object.assign(Error('Preview does not match current projection'),{status:409});active={kind:'grouped',value:structuredClone(plan)};publish({...empty(),plan:structuredClone(active)});}
   catch(error){if(current(generation,seq))publish({...empty(),error:failure(error,'preview')});}
  },
  cancel(){if(disposed||state.writing)return false;sequence++;request?.abort();request=undefined;active=null;commandKey=undefined;publish(empty());return true;},
  async apply(){
   if(disposed||state.writing||state.previewing||!active)return;const generation=epoch,seq=sequence,plan=structuredClone(active),controller=new AbortController();request=controller;publish({...state,writing:true,error:null});if(!current(generation,seq))return;
   try{commandKey??=(ports.newRequestId??(()=>crypto.randomUUID()))();if(plan.kind==='physical')await ports.applyBoardMove(plan.value,commandKey,{signal:controller.signal});else await ports.applyGroupedMove(plan.value,commandKey,{signal:controller.signal});if(!current(generation,seq))return;active=null;commandKey=undefined;publish(empty());}
   catch(error){if(current(generation,seq)){const code=status(error);if(code!==null&&code<500){active=null;commandKey=undefined;}publish({...state,plan:active?structuredClone(active):null,writing:false,error:failure(error,'write')});}return;}
   if(!current(generation,seq))return;
   try{await ports.onCommitted();}catch(error){if(current(generation,seq))publish({...empty(),error:failure(error,'refresh')});}
  },
  dispose(){if(disposed)return;disposed=true;epoch++;sequence++;request?.abort();request=undefined;active=null;commandKey=undefined;selection=null;signature='';state=empty();listeners.clear();},
 };
}
