import {boardPolicyDraft,type BoardPolicy,type ColumnPolicy} from './boardPolicyApi.js';
export interface BoardPolicyState {board:BoardPolicy|null;draft:ColumnPolicy[]|null;draftRevision:number|null;loading:boolean;saving:boolean;locked:boolean;error:{phase:'read'|'write'|'refresh';status:number|null}|null}
type Ports={boardPolicy(id:string,options?:{signal?:AbortSignal}):Promise<BoardPolicy>;configureBoardPolicy(board:BoardPolicy,draft:ColumnPolicy[],key:string):Promise<BoardPolicy>;newRequestId?:()=>string;onCommitted():Promise<void>};
const empty=():BoardPolicyState=>({board:null,draft:null,draftRevision:null,loading:false,saving:false,locked:false,error:null});
const status=(error:unknown)=>{const n=(error as any)?.status;return Number.isInteger(n)&&n>=400&&n<=599?n as number:null;};
/** Persistent session owner: uncertain delivery locks the original command until
 * a manual outcome check. Fresh reads never silently replace its UUID or body. */
export function createBoardPolicyState(ports:Ports){
 let state=empty(),id:string|null=null,epoch=0,readEpoch=0,pending=0,disposed=false,read:AbortController|undefined;
 let packet:{board:BoardPolicy;draft:ColumnPolicy[];key:string}|null=null;
 const listeners=new Set<()=>void>(),publish=(value:BoardPolicyState)=>{if(disposed)return;state=value;for(const listener of listeners)listener();},current=(generation:number)=>!disposed&&epoch===generation;
 const stopRead=()=>{readEpoch++;read?.abort();read=undefined;},clear=()=>{epoch++;stopRead();id=null;packet=null;publish({...empty(),saving:pending>0});};
 return {
  snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},clear,
  async load(next:string){if(disposed)return;if(id!==next){clear();id=next;}const generation=epoch,reading=++readEpoch;read?.abort();const controller=new AbortController();read=controller;publish({...state,board:null,loading:true});
   try{const board=await ports.boardPolicy(next,{signal:controller.signal});if(!current(generation)||reading!==readEpoch)return;if(board.id!==next)throw Object.assign(Error('Board changed'),{status:409});publish({...state,board:structuredClone(board),loading:false,error:state.locked&&state.error?.phase==='write'?state.error:null});}
   catch(error){if(current(generation)&&reading===readEpoch){const code=status(error);if(code!==null&&code<500)clear();publish({...state,board:null,loading:false,error:{phase:'read',status:code}});}}
  },
  suspend(){if(disposed)return;stopRead();publish({...state,board:null,loading:false});},
  open(){if(disposed||pending||state.loading||state.locked||!state.board)return;publish({...state,draft:state.board.columns.map(c=>({columnKey:c.columnKey,...c.wip})),draftRevision:state.board.revision,error:null});},
  edit(key:string,policy:ColumnPolicy['policy'],limit:number|null){if(disposed||pending||state.loading||state.locked||!state.draft)return;publish({...state,draft:state.draft.map(row=>row.columnKey===key?{columnKey:key,policy,limit}:row),error:null});},
  cancel(){if(disposed||pending||state.locked)return false;publish({...state,draft:null,draftRevision:null,error:null});return true;},
  async apply(){
   if(disposed||pending||state.loading||!id||!state.board)return;
   if(!packet){if(!state.draft)return;if(state.draftRevision!==state.board.revision){publish({...state,error:{phase:'write',status:409}});return;}try{boardPolicyDraft(state.board,state.draft);}catch{publish({...state,error:{phase:'write',status:422}});return;}packet={board:structuredClone(state.board),draft:structuredClone(state.draft),key:(ports.newRequestId??(()=>crypto.randomUUID()))()};}
   const generation=epoch,command=structuredClone(packet);pending++;publish({...state,saving:true,locked:true,error:null});if(!current(generation)){pending--;if(!disposed)publish({...state,saving:pending>0});return;}
   try{const board=await ports.configureBoardPolicy(command.board,command.draft,command.key);if(current(generation)){packet=null;stopRead();publish({...state,board:structuredClone(board),draft:null,draftRevision:null,loading:false,locked:false,error:null});}}
   catch(error){if(current(generation)){const code=status(error);if(code!==null&&code<500)clear();publish({...state,locked:packet!==null,error:{phase:'write',status:code}});}return;}
   finally{pending--;if(!disposed&&state.saving)publish({...state,saving:pending>0});}
   if(!current(generation))return;try{await ports.onCommitted();}catch(error){if(current(generation))publish({...state,error:{phase:'refresh',status:status(error)}});}
  },
  dispose(){if(disposed)return;disposed=true;epoch++;stopRead();packet=null;state=empty();listeners.clear();},
 };
}
