import type {TaskApi} from './api.js';
import type {BoardPage} from './boardClient.js';
import type {BoardCommandPlan} from './boardCommandsClient.js';
import type {BoardMovePreviewInput} from '../../../server/productivity/boardMoves.js';
export interface KanbanCommandSelection {kind:'canonical';page:BoardPage;rankSorted:boolean}
export interface KanbanCommandState {plan:{kind:'physical';value:BoardCommandPlan}|null;previewing:boolean;writing:boolean;error:{phase:'preview'|'write'|'refresh';status:number|null}|null}
const empty=():KanbanCommandState=>({plan:null,previewing:false,writing:false,error:null});
type Ports=Pick<TaskApi,'previewBoardMove'|'applyBoardMove'>&{newRequestId?:()=>string;onCommitted():Promise<void>};
const status=(error:unknown)=>{const n=(error as any)?.status;return typeof n==='number'&&Number.isInteger(n)&&n>=400&&n<=599?n:null;};
/** Owns a transient confirmation and command UUID, never optimistic Task facts.
 * The caller clears/selects on actor, authority, view or projection changes. */
export function createKanbanCommandState(ports:Ports){
 let state=empty(),selection:KanbanCommandSelection|null=null,signature='',disposed=false,epoch=0,sequence=0,active:BoardCommandPlan|null=null,commandKey:string|undefined,request:AbortController|undefined;
 const listeners=new Set<()=>void>(),publish=(next:KanbanCommandState)=>{state=next;for(const listener of listeners)listener();},current=(generation:number,seq:number)=>!disposed&&epoch===generation&&sequence===seq;
 const invalidate=()=>{epoch++;sequence++;request?.abort();request=undefined;active=null;commandKey=undefined;publish(empty());};
 const failure=(error:unknown,phase:'preview'|'write'|'refresh')=>({phase,status:status(error)});
 const clear=()=>{if(disposed)return;selection=null;signature='';invalidate();};
 const admit=(input:BoardMovePreviewInput)=>{if(!selection||selection.page.mode!=='sections'||!selection.rankSorted||input.viewId!==selection.page.viewId)return false;const page=selection.page,destination=page.columns.find(c=>c.id===input.targetColumnId),task=page.columns.flatMap(c=>c.cards).find(card=>card.task.id===input.taskId)?.task;return !!destination&&!!task&&input.timezone===page.clock.timezone&&(input.beforeTaskId===null||input.beforeTaskId!==input.taskId&&destination.cards.some(c=>c.task.id===input.beforeTaskId));};
 return {
  snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},clear,
  select(next:KanbanCommandSelection|null){if(disposed)return;const encoded=next===null?'':JSON.stringify(next);if(encoded===signature)return;invalidate();selection=next===null?null:structuredClone(next);signature=encoded;},
  async previewPhysical(input:BoardMovePreviewInput){
   if(disposed||state.writing)return;sequence++;request?.abort();active=null;commandKey=undefined;const selected=selection,packet={...structuredClone(input),timezone:input.timezone??selected?.page.clock.timezone};
   if(!selected||!admit(packet)){publish({...empty(),error:{phase:'preview',status:422}});return;}
   const generation=epoch,seq=sequence,controller=new AbortController();request=controller;publish({...empty(),previewing:true});
   try{const plan=await ports.previewBoardMove(packet,{signal:controller.signal});if(!current(generation,seq))return;const page=selected.page,task=page.columns.flatMap(c=>c.cards).find(c=>c.task.id===input.taskId)!.task;
    if(plan.viewId!==page.viewId||plan.boardId!==page.boardId||plan.viewRevision!==page.viewRevision||plan.boardRevision!==page.boardRevision||plan.taskId!==task.id||plan.taskRevision!==task.revision||plan.clock.timezone!==page.clock.timezone)throw Object.assign(Error('Preview does not match current projection'),{status:409});
    active=structuredClone(plan);publish({...empty(),plan:{kind:'physical',value:structuredClone(plan)}});
   }catch(error){if(current(generation,seq))publish({...empty(),error:failure(error,'preview')});}
  },
  cancel(){if(disposed||state.writing)return false;sequence++;request?.abort();request=undefined;active=null;commandKey=undefined;publish(empty());return true;},
  async apply(){
   if(disposed||state.writing||state.previewing||!active)return;const generation=epoch,seq=sequence,plan=structuredClone(active),controller=new AbortController();request=controller;publish({...state,writing:true,error:null});
   try{commandKey??=(ports.newRequestId??(()=>crypto.randomUUID()))();await ports.applyBoardMove(plan,commandKey,{signal:controller.signal});if(!current(generation,seq))return;active=null;commandKey=undefined;publish(empty());}
   catch(error){if(current(generation,seq)){const code=status(error);if(code!==null&&code<500){active=null;commandKey=undefined;}publish({...state,plan:active?{kind:'physical',value:structuredClone(active)}:null,writing:false,error:failure(error,'write')});}return;}
   if(!current(generation,seq))return;
   try{await ports.onCommitted();}catch(error){if(current(generation,seq))publish({...empty(),error:failure(error,'refresh')});}
  },
  dispose(){if(disposed)return;disposed=true;epoch++;sequence++;request?.abort();request=undefined;active=null;commandKey=undefined;selection=null;signature='';state=empty();listeners.clear();},
 };
}
