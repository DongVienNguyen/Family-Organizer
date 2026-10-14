import {assertTaskRecord,type TaskRecord,type TaskPatch} from './contracts.js';
import {createTaskDraft,editTaskDraft,changedTaskFields,type TaskDraft} from './editor.js';
export type TaskLoader=(id:string)=>Promise<TaskRecord>;
export type TaskSaver=(id:string,revision:number,patch:TaskPatch)=>Promise<TaskRecord>;
export interface TaskCache {
 subscribe(fn:()=>void):()=>void;snapshot():number;record(id:string):TaskRecord|undefined;draft(id:string):TaskDraft|undefined;
 load(id:string,loader:TaskLoader):Promise<void>;open(id:string):void;edit(id:string,patch:TaskPatch):void;discard(id:string):void;
 save(id:string,saver:TaskSaver):Promise<void>;invalidate(id:string):void;dispose():void;
}
/** One in-memory owner per authenticated session. No browser storage/offline writes. */
export function createTaskCache():TaskCache {
 const records=new Map<string,TaskRecord>(),drafts=new Map<string,TaskDraft>(),sequence=new Map<string,number>(),hidden=new Set<string>(),busy=new Set<string>(),listeners=new Set<()=>void>();
 let active=true,version=0;
 const emit=()=>{version++;for(const fn of listeners)fn();};
 const requireActive=()=>{if(!active)throw Error('Task session disposed');};
 const next=(id:string)=>{const value=(sequence.get(id)??0)+1;sequence.set(id,value);return value;};
 const allowed=(id:string)=>active&&!hidden.has(id)?records.get(id):undefined;
 const wipe=(id:string)=>{records.delete(id);drafts.delete(id);hidden.delete(id);};
 const deny=(error:unknown)=>[401,403,404].includes((error as any)?.status);
 const response=(id:string,task:TaskRecord)=>{assertTaskRecord(task);if(task.id!==id||task.revision<(records.get(id)?.revision??0))throw Error('Invalid or stale task response');};
 return {
  subscribe(fn){listeners.add(fn);return ()=>{listeners.delete(fn);};},snapshot:()=>version,
  record(id){const task=allowed(id);return task?structuredClone(task):undefined;},
  draft(id){const draft=allowed(id)?drafts.get(id):undefined;return draft?structuredClone(draft):undefined;},
  async load(id,loader){
   requireActive();const request=next(id);hidden.add(id);emit();
   try{const task=await loader(id);if(!active||sequence.get(id)!==request)return;response(id,task);records.set(id,structuredClone(task));hidden.delete(id);emit();}
   catch(error){if(!active||sequence.get(id)!==request)return;if(deny(error))wipe(id);emit();throw error;}
  },
  open(id){requireActive();const task=allowed(id);if(!task)throw Error('Task not ready');if(!drafts.has(id)){drafts.set(id,createTaskDraft(task));emit();}},
  edit(id,patch){requireActive();if(busy.has(id))throw Error('Task save in progress');const draft=allowed(id)?drafts.get(id):undefined;if(!draft)throw Error('Task draft not ready');drafts.set(id,editTaskDraft(draft,patch));emit();},
  discard(id){requireActive();if(busy.has(id))throw Error('Task save in progress');drafts.delete(id);emit();},
  async save(id,saver){
   requireActive();if(busy.has(id))throw Error('Task save in progress');const task=allowed(id),draft=drafts.get(id);if(!task||!draft)throw Error('Task draft not ready');
   const patch=changedTaskFields(task,draft);if(!Object.keys(patch).length){drafts.delete(id);emit();return;}
   const request=next(id);busy.add(id);emit();
   try{const saved=await saver(id,draft.baseRevision,patch);if(!active)return;assertTaskRecord(saved);if(saved.id!==id||saved.revision<=draft.baseRevision)throw Error('Invalid saved task response');
    if(sequence.get(id)===request){response(id,saved);records.set(id,structuredClone(saved));hidden.delete(id);}drafts.delete(id);
   }catch(error){if(active&&deny(error))wipe(id);if(active)throw error;}
   finally{if(active){busy.delete(id);emit();}}
  },
  invalidate(id){requireActive();next(id);hidden.add(id);emit();},
  dispose(){if(!active)return;active=false;records.clear();drafts.clear();sequence.clear();hidden.clear();busy.clear();emit();listeners.clear();},
 };
}
