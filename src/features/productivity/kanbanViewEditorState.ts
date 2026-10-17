import {createDraftCommandState,type DraftCommandState} from './draftCommandState.js';
import {createKanbanViewDraft,assertKanbanViewDraft,rebaseKanbanViewDraft,saveKanbanViewDraft,type KanbanViewDraft} from './kanbanViewDraft.js';
import type {SavedTaskView,SaveViewInput} from '../../../server/productivity/views.js';
type Ports={view(id:string):Promise<SavedTaskView>;saveView(input:SaveViewInput,revision:number,key:string):Promise<SavedTaskView>;onCommitted(result:SavedTaskView):Promise<void>;newRequestId?:()=>string};
export function createKanbanViewEditorState(ports:Ports){
 const s=createDraftCommandState<KanbanViewDraft,SavedTaskView>({...ports,validate:assertKanbanViewDraft,send:(draft,key)=>saveKanbanViewDraft(ports,draft,key)});
 let reloading=false,conflict=false,disposed=false,sequence=0,reloadError:DraftCommandState<KanbanViewDraft,SavedTaskView>['error']=null;
 let cached={...s.snapshot(),reloading,conflict};const listeners=new Set<()=>void>();
 const publish=()=>{if(disposed)return;if(s.snapshot().error?.phase==='write'&&s.snapshot().error?.status===409)conflict=true;cached={...s.snapshot(),error:reloadError??s.snapshot().error,reloading,conflict};for(const l of listeners)l();},unsubscribe=s.subscribe(publish);
 const clear=()=>{sequence++;reloading=false;conflict=false;reloadError=null;s.clear();};
 const editable=()=>!disposed&&!reloading&&!s.snapshot().writing&&!s.snapshot().locked;
 return {snapshot:()=>cached,subscribe:(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};},clear,
  open(view:SavedTaskView){if(!editable())return;sequence++;reloadError=null;conflict=false;s.open(createKanbanViewDraft(view));},
  edit(draft:KanbanViewDraft){if(!editable())return;sequence++;reloadError=null;s.edit(draft);},
  close(){if(!editable())return false;sequence++;reloadError=null;conflict=false;return s.close();},
  async apply(){if(disposed||reloading||conflict)return;reloadError=null;await s.apply();},
  async reload(){
   if(!editable()||!s.snapshot().draft)return;const draft=structuredClone(s.snapshot().draft!),seq=++sequence;reloading=true;reloadError=null;publish();
   try{const latest=await ports.view(draft.base.id);if(disposed||seq!==sequence)return;const next=rebaseKanbanViewDraft(draft,latest);conflict=false;s.edit(next);}
   catch(error){if(disposed||seq!==sequence)return;const n=(error as any)?.status,status=Number.isInteger(n)&&n>=400&&n<=599?n as number:null;if(status!==null&&[401,403,404].includes(status)){clear();return;}reloadError={phase:'refresh',status};}
   finally{if(!disposed&&seq===sequence){reloading=false;publish();}}
  },
  dispose(){if(disposed)return;sequence++;reloading=false;conflict=false;reloadError=null;unsubscribe();s.dispose();cached={...s.snapshot(),reloading,conflict};disposed=true;listeners.clear();}
 };
}
