import type {TaskApi} from './api.js';
import type {MatrixPlan,MatrixPreviewInput,MatrixApplyInput,MatrixResult} from '../../../server/productivity/matrix.js';
import type {MatrixViewProjection} from './matrixClient.js';
export interface MatrixState {projection:MatrixViewProjection|null;plan:MatrixPlan|null;loading:boolean;previewing:boolean;writing:boolean;conflict:boolean;error:string;lastResult:MatrixResult|null}
const empty=():MatrixState=>({projection:null,plan:null,loading:false,previewing:false,writing:false,conflict:false,error:'',lastResult:null});
type Ports=Pick<TaskApi,'matrix'|'previewMatrix'|'applyMatrix'|'resetMatrixPin'>&{newRequestId?:()=>string};
/** Owns only a view projection/confirmation; never replaces the full authorized cache. */
export function createMatrixState(ports:Ports){
 let state=empty(),disposed=false,generation=0,readSeq=0,moveSeq=0,selected:{viewId:string;timezone:string}|undefined,activePlan:MatrixPlan|null=null;
 let readRequest:AbortController|undefined,moveRequest:AbortController|undefined,writeRequest:AbortController|undefined,command:{signature:string;key:string}|undefined;
 const listeners=new Set<()=>void>(),publish=(next:MatrixState)=>{state=next;for(const listener of listeners)listener();},key=ports.newRequestId??(()=>crypto.randomUUID());
 const current=(epoch:number)=>!disposed&&generation===epoch,visible=(id:string)=>state.projection&&[...Object.values(state.projection.quadrants).flat(),...state.projection.unmatched].some(task=>task.id===id);
 const clear=()=>{generation++;readSeq++;moveSeq++;readRequest?.abort();moveRequest?.abort();writeRequest?.abort();selected=undefined;activePlan=null;command=undefined;publish(empty());};
 const failure=(error:unknown,phase:'read'|'preview'|'write')=>{const status=(error as {status?:number})?.status,message=error instanceof Error?error.message:'Không xử lý được Matrix.';if([401,403,404].includes(status??0))clear();publish({...state,loading:phase==='read'?false:state.loading,previewing:phase==='preview'?false:state.previewing,writing:phase==='write'?false:state.writing,error:message,conflict:status===409||state.conflict});};
 const refresh=async()=>{if(disposed||!selected)return;const scope={...selected},epoch=generation,seq=++readSeq,controller=new AbortController();readRequest?.abort();readRequest=controller;publish({...state,loading:true,error:''});try{const projection=await ports.matrix(scope.viewId,scope.timezone,{signal:controller.signal});if(current(epoch)&&seq===readSeq)publish({...state,projection:structuredClone(projection),loading:false});}catch(error){if(current(epoch)&&seq===readSeq)failure(error,'read');}};
 const identity=(signature:string)=>{if(command?.signature!==signature)command={signature,key:key()};return command.key;};
 return {
  snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},clear,refresh,
  async load(viewId:string,timezone='Asia/Saigon'){if(disposed)return;clear();selected={viewId,timezone};await refresh();},
  async preview(input:MatrixPreviewInput){if(disposed||state.writing||state.loading||!selected||input.viewId!==selected.viewId||!visible(input.taskId))return;const epoch=generation,seq=++moveSeq,controller=new AbortController();moveRequest?.abort();moveRequest=controller;activePlan=null;command=undefined;publish({...state,plan:null,previewing:true,conflict:false,error:'',lastResult:null});try{const plan=await ports.previewMatrix(structuredClone(input),{signal:controller.signal});if(current(epoch)&&seq===moveSeq){activePlan=structuredClone(plan);publish({...state,plan:structuredClone(plan),previewing:false});}}catch(error){if(current(epoch)&&seq===moveSeq)failure(error,'preview');}},
  cancel(){if(disposed||state.writing)return false;moveSeq++;moveRequest?.abort();activePlan=null;command=undefined;publish({...state,plan:null,previewing:false,conflict:false,error:''});return true;},
  async apply(confirmedDue:boolean){
   if(disposed||state.writing||state.previewing||state.conflict||!activePlan)return;
   const plan=structuredClone(activePlan);if(typeof confirmedDue!=='boolean'||plan.warnings.includes('custom-rule-choice')||plan.warnings.includes('deadline-change')&&!confirmedDue){publish({...state,error:'Cần chọn rõ thay đổi trước khi áp dụng.'});return;}
   const input:MatrixApplyInput={viewId:plan.viewId,taskId:plan.taskId,previewId:plan.id,expectedViewRevision:plan.viewRevision,confirmedDue,mode:plan.mode},requestId=identity(JSON.stringify({operation:'apply',revision:plan.taskRevision,input})),epoch=generation,controller=new AbortController();writeRequest=controller;publish({...state,writing:true,error:''});
   try{const result=await ports.applyMatrix(plan.taskRevision,input,requestId,{signal:controller.signal});if(!current(epoch))return;activePlan=null;command=undefined;publish({...state,plan:null,writing:false,conflict:false,lastResult:structuredClone(result)});await refresh();}catch(error){if(current(epoch))failure(error,'write');}
  },
  async reset(revision:number,input:{viewId:string;taskId:string;expectedPinRevision:number}){
   if(disposed||state.writing||state.previewing||state.loading||!selected||input.viewId!==selected.viewId||!visible(input.taskId))return;const packet=structuredClone(input),requestId=identity(JSON.stringify({operation:'reset',revision,input:packet})),epoch=generation,controller=new AbortController();writeRequest=controller;publish({...state,writing:true,error:''});
   try{await ports.resetMatrixPin(revision,packet,requestId,{signal:controller.signal});if(!current(epoch))return;activePlan=null;command=undefined;publish({...state,plan:null,writing:false,conflict:false});await refresh();}catch(error){if(current(epoch))failure(error,'write');}
  },
  dispose(){if(disposed)return;disposed=true;listeners.clear();clear();},
 };
}
