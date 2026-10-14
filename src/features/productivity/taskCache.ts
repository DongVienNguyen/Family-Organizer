import {assertTaskRecord,type TaskRecord,type TaskPatch} from './contracts.js';
import {keys,text} from './validation.js';
import {createTaskDraft,editTaskDraft,changedTaskFields,type TaskDraft} from './editor.js';
export type TaskLoader=(id:string)=>Promise<TaskRecord>;
export type TaskSaver=(id:string,revision:number,patch:TaskPatch,requestId:string)=>Promise<TaskRecord>;
export interface DrawerInputs {comment:string;newCheck:string;subtaskTitle:string}
const emptyInputs:DrawerInputs={comment:'',newCheck:'',subtaskTitle:''};
export interface TaskCache {
 subscribe(fn:()=>void):()=>void;snapshot():number;record(id:string):TaskRecord|undefined;draft(id:string):TaskDraft|undefined;
 load(id:string,loader:TaskLoader):Promise<void>;reload(id:string,loader:TaskLoader):Promise<void>;open(id:string):boolean;inputs(id:string):DrawerInputs|undefined;editInputs(id:string,patch:Partial<DrawerInputs>):void;edit(id:string,patch:TaskPatch):void;tagEditor(id:string,initialText:string):void;editTagText(id:string,text:string):void;discard(id:string):void;
 replaceVisible(tasks:readonly TaskRecord[]):void;save(id:string,saver:TaskSaver):Promise<void>;invalidate(id:string):void;clear():void;dispose():void;
}
/** One in-memory owner per authenticated session. No browser storage/offline writes. */
export function createTaskCache():TaskCache {
 const inputs=new Map<string,DrawerInputs>(),records=new Map<string,TaskRecord>(),drafts=new Map<string,TaskDraft>(),sequence=new Map<string,number>(),hidden=new Set<string>(),busy=new Set<string>(),listeners=new Set<()=>void>(),pending=new Map<string,{signature:string;requestId:string}>();
 let active=true,version=0,generation=0;
 const emit=()=>{version++;for(const fn of listeners)fn();};
 const requireActive=()=>{if(!active)throw Error('Task session disposed');};
 const next=(id:string)=>{const value=(sequence.get(id)??0)+1;sequence.set(id,value);return value;};
 const allowed=(id:string)=>active&&!hidden.has(id)?records.get(id):undefined;
 const wipe=(id:string)=>{records.delete(id);drafts.delete(id);inputs.delete(id);pending.delete(id);hidden.delete(id);};
 const deny=(error:unknown)=>[401,403,404].includes((error as any)?.status);
 const response=(id:string,task:TaskRecord)=>{assertTaskRecord(task);if(task.id!==id||task.revision<(records.get(id)?.revision??0))throw Error('Invalid or stale task response');};
 return {
  subscribe(fn){listeners.add(fn);return ()=>{listeners.delete(fn);};},snapshot:()=>version,
  record(id){const task=allowed(id);return task?structuredClone(task):undefined;},
  draft(id){const draft=allowed(id)?drafts.get(id):undefined;return draft?structuredClone(draft):undefined;},
  async load(id,loader){
   requireActive();const owner=generation,request=next(id);hidden.add(id);emit();
   try{const task=await loader(id);if(!active||generation!==owner||sequence.get(id)!==request)return;response(id,task);records.set(id,structuredClone(task));hidden.delete(id);emit();}
   catch(error){if(!active||generation!==owner||sequence.get(id)!==request)return;if(deny(error))wipe(id);emit();throw error;}
  },
  async reload(id,loader){requireActive();if(busy.has(id))throw Error('Task save in progress');await this.load(id,loader);const task=allowed(id);if(!task)throw Error('Task not ready');drafts.set(id,createTaskDraft(task));inputs.delete(id);pending.delete(id);emit();},
  open(id){requireActive();const task=allowed(id);if(!task)return false;if(!drafts.has(id)){drafts.set(id,createTaskDraft(task));emit();}return true;},
  inputs(id){return allowed(id)?structuredClone(inputs.get(id)??emptyInputs):undefined;},
  editInputs(id,patch){requireActive();if(!records.has(id))throw Error('Task not ready');keys(patch,['comment','newCheck','subtaskTitle']);for(const [key,value]of Object.entries(patch))text(value,key==='comment'?20000:key==='newCheck'?2000:500,false);inputs.set(id,{...(inputs.get(id)??emptyInputs),...patch});emit();},
  edit(id,patch){requireActive();if(busy.has(id))throw Error('Task save in progress');const draft=allowed(id)?drafts.get(id):undefined;if(!draft)throw Error('Task draft not ready');drafts.set(id,editTaskDraft(draft,patch));emit();},
  tagEditor(id,initialText){requireActive();const draft=allowed(id)?drafts.get(id):undefined;if(!draft)throw Error('Task draft not ready');if(!draft.tagEditor){drafts.set(id,{...draft,tagEditor:{originalText:initialText,text:initialText}});emit();}},
  editTagText(id,text){requireActive();if(busy.has(id))throw Error('Task save in progress');const draft=allowed(id)?drafts.get(id):undefined;if(!draft?.tagEditor)throw Error('Tag editor not ready');drafts.set(id,{...draft,tagEditor:{...draft.tagEditor,text}});emit();},
  discard(id){requireActive();if(busy.has(id))throw Error('Task save in progress');drafts.delete(id);pending.delete(id);emit();},
  replaceVisible(tasks){
   requireActive();const ids=new Set<string>();for(const task of tasks){assertTaskRecord(task);if(ids.has(task.id))throw Error('Duplicate task IDs');ids.add(task.id);}
   for(const id of [...records.keys()])if(!ids.has(id)){next(id);wipe(id);}
   for(const task of tasks){next(task.id);if(task.revision>=(records.get(task.id)?.revision??0))records.set(task.id,structuredClone(task));hidden.delete(task.id);}
   emit();
  },
  async save(id,saver){
   requireActive();if(busy.has(id))throw Error('Task save in progress');const task=allowed(id),draft=drafts.get(id);if(!task||!draft)throw Error('Task draft not ready');
   const patch=changedTaskFields(task,draft);if(!Object.keys(patch).length){drafts.delete(id);pending.delete(id);emit();return;}
   const signature=JSON.stringify({revision:draft.baseRevision,patch}),operation=pending.get(id)?.signature===signature?pending.get(id)!:{signature,requestId:crypto.randomUUID()};pending.set(id,operation);
   const owner=generation,request=next(id);busy.add(id);emit();
   try{const saved=await saver(id,draft.baseRevision,patch,operation.requestId);if(!active||generation!==owner)return;assertTaskRecord(saved);if(saved.id!==id||saved.revision<=draft.baseRevision)throw Error('Invalid saved task response');
    if(sequence.get(id)===request){response(id,saved);records.set(id,structuredClone(saved));hidden.delete(id);}drafts.delete(id);pending.delete(id);
   }catch(error){if(active&&generation===owner&&deny(error))wipe(id);if(active&&generation===owner)throw error;}
   finally{if(active&&generation===owner){busy.delete(id);emit();}}
  },
  invalidate(id){requireActive();next(id);hidden.add(id);emit();},
  clear(){requireActive();generation++;records.clear();drafts.clear();inputs.clear();sequence.clear();hidden.clear();busy.clear();pending.clear();emit();},
  dispose(){if(!active)return;active=false;generation++;records.clear();drafts.clear();inputs.clear();sequence.clear();hidden.clear();busy.clear();pending.clear();emit();listeners.clear();},
 };
}
