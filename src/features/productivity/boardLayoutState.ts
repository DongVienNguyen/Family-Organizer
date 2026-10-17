import type {TaskApi}from'./api.js';
import type {BoardLayout,BoardArchivePlan}from'./boardLayoutApi.js';
export type BoardLayoutDraft={kind:'create';title:string}|{kind:'rename';columnId:string;title:string}|{kind:'reorder';columnId:string;beforeColumnId:string|null}|{kind:'archive';columnId:string};
export interface BoardLayoutState{layout:BoardLayout|null;draft:BoardLayoutDraft|null;plan:BoardArchivePlan|null;loading:boolean;previewing:boolean;writing:boolean;locked:boolean;error:{phase:'read'|'preview'|'write'|'refresh';status:number|null}|null}
type Scope={viewId:string;boardId:string};
type Ports=Pick<TaskApi,'boardLayout'|'createBoardSection'|'renameBoardSection'|'reorderBoardColumn'|'previewBoardColumnArchive'|'applyBoardColumnArchive'>&{newRequestId?:()=>string;onCommitted():Promise<void>};
const empty=():BoardLayoutState=>({layout:null,draft:null,plan:null,loading:false,previewing:false,writing:false,locked:false,error:null});
const status=(error:unknown)=>{const n=(error as any)?.status;return Number.isInteger(n)&&n>=400&&n<=599?n as number:null;};
/** One persistent API-session owner. A read may hide facts without replacing an
 * uncertain write's immutable request; only a manual retry can dispatch it. */
export function createBoardLayoutState(ports:Ports){
 let state=empty(),scope:Scope|null=null,epoch=0,readEpoch=0,previewEpoch=0,pending=0,disposed=false,read:AbortController|undefined,preview:AbortController|undefined;
 let packet:{layout:BoardLayout;draft:BoardLayoutDraft;plan:BoardArchivePlan|null;key:string}|null=null;
 const listeners=new Set<()=>void>(),publish=(next:BoardLayoutState)=>{if(disposed)return;state=next;for(const listener of listeners)listener();},current=(n:number)=>!disposed&&n===epoch;
 const stopReads=()=>{readEpoch++;previewEpoch++;read?.abort();preview?.abort();read=undefined;preview=undefined;};
 const reset=()=>{epoch++;stopReads();scope=null;packet=null;publish({...empty(),writing:pending>0});};
 const valid=(draft:BoardLayoutDraft,layout:BoardLayout)=>{if(!draft||!['create','rename','reorder','archive'].includes(draft.kind))return false;if(draft.kind==='create')return typeof draft.title==='string'&&!!draft.title.trim()&&draft.title.length<=500;const c=layout.columns.find(c=>c.id===draft.columnId);if(!c)return false;if(draft.kind==='reorder')return draft.beforeColumnId!==c.id&&(draft.beforeColumnId===null||layout.columns.some(c=>c.id===draft.beforeColumnId));if(c.sectionId===null)return false;return draft.kind==='archive'||typeof draft.title==='string'&&!!draft.title.trim()&&draft.title.length<=500;};
 return {
  snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  async load(next:Scope){
   if(disposed)return;if(!scope||next.viewId!==scope.viewId||next.boardId!==scope.boardId){reset();scope=structuredClone(next);}const generation=epoch,reading=++readEpoch;read?.abort();previewEpoch++;preview?.abort();const controller=new AbortController();read=controller;publish({...state,layout:null,plan:null,loading:true,previewing:false});
   try{const layout=await ports.boardLayout(next.viewId,{signal:controller.signal});if(!current(generation)||reading!==readEpoch)return;if(layout.viewId!==next.viewId||layout.boardId!==next.boardId)throw Object.assign(Error('Board reference changed'),{status:409});publish({...state,layout:structuredClone(layout),loading:false,plan:packet?.plan?structuredClone(packet.plan):null,error:state.locked&&state.error?.phase==='write'?state.error:null});}
   catch(error){if(current(generation)&&reading===readEpoch){const code=status(error);if(code!==null&&code<500)reset();publish({...state,layout:null,plan:null,loading:false,error:{phase:'read',status:code}});}}
  },
  suspend(){if(disposed)return;stopReads();publish({...state,layout:null,plan:null,loading:false,previewing:false});},
  clear(){if(!disposed)reset();},
  open(draft:BoardLayoutDraft){if(disposed||pending||state.loading||state.previewing||state.locked||!state.layout)return;previewEpoch++;preview?.abort();packet=null;if(draft.kind==='create'?typeof draft.title!=='string'||draft.title.length>500:!valid(draft,state.layout)){publish({...state,error:{phase:'write',status:422}});return;}publish({...state,draft:structuredClone(draft),plan:null,error:null});},
  edit(draft:BoardLayoutDraft){if(disposed||pending||state.loading||state.previewing||state.locked||!state.layout||!state.draft||draft.kind!==state.draft.kind)return;previewEpoch++;preview?.abort();packet=null;publish({...state,draft:structuredClone(draft),plan:null,error:null});},
  async previewArchive(){
   if(disposed||pending||state.loading||state.previewing||state.locked||!state.layout||state.draft?.kind!=='archive'||!valid(state.draft,state.layout))return;
   const generation=epoch,reading=++previewEpoch,layout=structuredClone(state.layout),draft=structuredClone(state.draft),controller=new AbortController();preview=controller;publish({...state,plan:null,previewing:true,error:null});
   try{const plan=await ports.previewBoardColumnArchive(layout,draft.columnId,{signal:controller.signal});if(current(generation)&&reading===previewEpoch)publish({...state,plan:structuredClone(plan),previewing:false});}
   catch(error){if(current(generation)&&reading===previewEpoch){const code=status(error);if(code!==null&&code<500)reset();publish({...state,plan:null,previewing:false,error:{phase:'preview',status:code}});}}
  },
  async apply(){
   if(disposed||pending||state.loading||state.previewing||!scope||!state.layout)return;
   if(!packet){if(!state.draft||!valid(state.draft,state.layout)||state.draft.kind==='archive'&&!state.plan){if(state.draft)publish({...state,error:{phase:'write',status:422}});return;}packet={layout:structuredClone(state.layout),draft:structuredClone(state.draft),plan:state.plan?structuredClone(state.plan):null,key:(ports.newRequestId??(()=>crypto.randomUUID()))()};}
   const generation=epoch,command=structuredClone(packet),draft=command.draft;pending++;publish({...state,writing:true,locked:true,error:null});if(!current(generation)){pending--;if(!disposed)publish({...state,writing:pending>0});return;}
   try{
    if(draft.kind==='create')await ports.createBoardSection(command.layout,draft.title,command.key);
    else if(draft.kind==='rename')await ports.renameBoardSection(command.layout,draft.columnId,draft.title,command.key);
    else if(draft.kind==='reorder')await ports.reorderBoardColumn(command.layout,draft.columnId,draft.beforeColumnId,command.key);
    else await ports.applyBoardColumnArchive(command.layout,command.plan!,command.key);
    if(current(generation)){packet=null;stopReads();publish({...state,layout:null,draft:null,plan:null,loading:false,previewing:false,locked:false,error:null});}
   }catch(error){if(current(generation)){const code=status(error);if(code!==null&&code<500)reset();publish({...state,locked:packet!==null,error:{phase:'write',status:code}});}return;}
   finally{pending--;if(!disposed&&state.writing)publish({...state,writing:pending>0});}
   if(!current(generation))return;
   try{await ports.onCommitted();}catch(error){if(current(generation))publish({...state,error:{phase:'refresh',status:status(error)}});}
  },
  cancel(){if(disposed||pending||state.locked)return false;previewEpoch++;preview?.abort();packet=null;publish({...state,draft:null,plan:null,previewing:false,error:null});return true;},
  dispose(){if(disposed)return;disposed=true;epoch++;stopReads();scope=null;packet=null;state=empty();listeners.clear();},
 };
}
