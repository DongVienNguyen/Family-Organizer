import type {TaskApi}from'./api.js';
import type {TaskRecord}from'./contracts.js';
import {text}from'./validation.js';
export interface ReviewCommandState{writing:boolean;locked:boolean;error:{phase:'write'|'refresh';status:number|null}|null}
type Operation='approve'|'reject';
type Ports=Pick<TaskApi,'approveTaskReview'|'rejectTaskReview'>&{newRequestId?:()=>string;onCommitted():Promise<void>};
const empty=():ReviewCommandState=>({writing:false,locked:false,error:null});
const status=(error:unknown)=>{const n=(error as any)?.status;return typeof n==='number'&&Number.isInteger(n)&&n>=400&&n<=599?n:null;};
/** A confirmation owns one immutable P10 request, never optimistic Task facts. */
export function createReviewCommandState(ports:Ports){
 let state=empty(),selected:TaskRecord|null=null,signature='',epoch=0,disposed=false,request:AbortController|undefined,command:{task:TaskRecord;operation:Operation;reason:string;key:string}|null=null;
 const listeners=new Set<()=>void>(),publish=(next:ReviewCommandState)=>{state=next;for(const listener of listeners)listener();},current=(generation:number)=>!disposed&&generation===epoch;
 return {
  snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  select(task:TaskRecord|null){if(disposed)return;const next=task===null?'':JSON.stringify(task);if(next===signature)return;epoch++;signature=next;if(!state.writing)request?.abort();request=undefined;command=null;selected=task===null?null:structuredClone(task);publish(empty());},
  cancel(){if(disposed||state.writing)return false;epoch++;request?.abort();request=undefined;command=null;publish(empty());return true;},
  async apply(operation:Operation,reason=''){
   if(disposed||state.writing||!selected)return;const generation=epoch;
   if(!command){if(!selected.pendingApproval||selected.lifecycle!=='in_progress'||selected.deletedAt!==null||!['approve','reject'].includes(operation)){publish({...empty(),error:{phase:'write',status:422}});return;}try{if(operation==='reject')text(reason,8000);}catch{publish({...empty(),error:{phase:'write',status:422}});return;}command={task:structuredClone(selected),operation,reason,key:(ports.newRequestId??(()=>crypto.randomUUID()))()};}
   const packet=structuredClone(command),controller=new AbortController();request=controller;publish({writing:true,locked:true,error:null});if(!current(generation))return;
   try{if(packet.operation==='approve')await ports.approveTaskReview(packet.task,packet.key,{signal:controller.signal});else await ports.rejectTaskReview(packet.task,packet.reason,packet.key,{signal:controller.signal});}
   catch(error){if(current(generation)){const code=status(error);if(code!==null&&code<500){command=null;selected=null;}publish({writing:false,locked:command!==null,error:{phase:'write',status:code}});}return;}
   if(!current(generation))return;command=null;selected=null;publish(empty());if(!current(generation))return;
   try{await ports.onCommitted();}catch(error){if(current(generation))publish({...empty(),error:{phase:'refresh',status:status(error)}});}
  },
  dispose(){if(disposed)return;disposed=true;epoch++;if(!state.writing)request?.abort();request=undefined;selected=null;command=null;state=empty();listeners.clear();},
 };
}
