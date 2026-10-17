export interface DraftCommandState<D,R>{draft:D|null;writing:boolean;locked:boolean;error:{phase:'validate'|'write'|'refresh';status:number|null}|null;last:R|null}
export function createDraftCommandState<D,R>(ports:{validate(draft:D):void;send(draft:D,key:string):Promise<R>;onCommitted(result:R):Promise<void>;newRequestId?:()=>string}){
 const empty=():DraftCommandState<D,R>=>({draft:null,writing:false,locked:false,error:null,last:null});let state=empty(),epoch=0,pending=0,disposed=false,packet:{draft:D;key:string}|null=null;
 const listeners=new Set<()=>void>(),publish=(value:DraftCommandState<D,R>)=>{if(disposed)return;state=value;for(const listener of listeners)listener();},current=(generation:number)=>!disposed&&generation===epoch;
 const code=(error:unknown)=>{const value=(error as any)?.status;return Number.isInteger(value)&&value>=400&&value<=599?value as number:null;};
 const clear=()=>{epoch++;packet=null;publish({...empty(),writing:pending>0});};
 return {snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},clear,
  open(draft:D){if(disposed||pending||state.locked)return;packet=null;publish({...empty(),draft:structuredClone(draft)});},
  edit(draft:D){if(disposed||pending||state.locked||!state.draft)return;packet=null;publish({...state,draft:structuredClone(draft),error:null});},
  close(){if(disposed||pending||state.locked)return false;packet=null;publish({...empty()});return true;},
  async apply(){
   if(disposed||pending||!state.draft)return;
   if(!packet){try{ports.validate(state.draft);}catch{publish({...state,error:{phase:'validate',status:422}});return;}packet={draft:structuredClone(state.draft),key:(ports.newRequestId??(()=>crypto.randomUUID()))()};}
   const generation=epoch,command=structuredClone(packet);pending++;publish({...state,writing:true,locked:true,error:null});if(!current(generation)){pending--;if(!disposed)publish({...state,writing:pending>0});return;}
   let result:R;
   try{result=await ports.send(command.draft,command.key);if(current(generation)){packet=null;publish({...state,draft:null,locked:false,error:null,last:structuredClone(result)});}}
   catch(error){if(current(generation)){const status=code(error);if(status!==null&&status<500){packet=null;if([401,403,404].includes(status)){clear();}publish({...state,locked:false,error:{phase:'write',status}});}else publish({...state,locked:true,error:{phase:'write',status}});}return;}
   finally{pending--;if(!disposed&&state.writing)publish({...state,writing:pending>0});}
   if(!current(generation))return;try{await ports.onCommitted(result!);}catch(error){if(current(generation))publish({...state,error:{phase:'refresh',status:code(error)}});}
  },
  dispose(){if(disposed)return;disposed=true;epoch++;packet=null;state=empty();listeners.clear();}
 };
}
