import {WalletApiError,type WalletApi} from './api.js';
import {createWalletCommand,type WalletCommandState} from './commandState.js';
import type {WalletCatalog,WalletCatalogItem,WalletCategoryView} from '../../../server/wallet/catalogView.js';
import type {CategoryDraft,LabelDraft} from '../../../server/wallet/catalog.js';
type Kind='category'|'label';
type CatalogApi=Pick<WalletApi,'status'|'catalog'|'catalogCapabilities'|'createCategory'|'updateCategory'|'createLabel'|'updateLabel'|'categoryDeletion'|'labelDeletion'|'deleteCategory'|'deleteLabel'>;
export interface CatalogDraft {name:string;parentId:string|null;nature:WalletCategoryView['nature'];icon:string;color:string;hidden:boolean;archived:boolean}
export interface CatalogForm {kind:Kind;draft:CatalogDraft;initial?:WalletCatalogItem;invalid:boolean}
type Deletion=Awaited<ReturnType<WalletApi['categoryDeletion']>>&{kind:Kind};
type Result=WalletCatalogItem|{id:string;revision:number;deleted:true};
type Intent={action:'save';kind:Kind;id?:string;revision:number;input:CategoryDraft|LabelDraft}|{action:'delete';kind:Kind;id:string;revision:number};
export interface CatalogWorkspaceState {kind:Kind;phase:'checking'|'inactive'|'ready'|'error'|'disposed';catalog:WalletCatalog|null;canManage:boolean;form:CatalogForm|null;deletion:Deletion|null;command:WalletCommandState<Result>;error:WalletApiError|null}
const draft=(item?:WalletCatalogItem):CatalogDraft=>({name:item?.name??'',parentId:item&&'parentId' in item?(item as WalletCategoryView).parentId:null,nature:item&&'nature' in item?(item as WalletCategoryView).nature:'unspecified',icon:item?.icon??'',color:item?.color??'',hidden:item?.hidden??false,archived:!!item?.archivedAt});
/** One memory-only catalog owner above navigation. Counts and drafts disappear
 * during permission revalidation; uncertain writes retain their exact intent. */
export function createCatalogWorkspace(api:CatalogApi,options:{newRequestId?:()=>string}={}){
 let state:CatalogWorkspaceState={kind:'category',phase:'checking',catalog:null,canManage:false,form:null,deletion:null,command:{phase:'idle'},error:null},form:CatalogForm|null=null,formOpen=false,generation=0,previewGeneration=0,disposed=false;
 const listeners=new Set<()=>void>();
 const withoutReferences=(error:WalletApiError|undefined)=>error&&new WalletApiError(error.status,error.message,error.code,error.requestId,error.unknownOutcome);
 const publish=(patch:Partial<CatalogWorkspaceState>)=>{if(disposed)return;const next={...state,...patch};if(next.phase!=='ready'||!next.canManage){next.command={...next.command,error:withoutReferences(next.command.error)};if(next.error)next.error=withoutReferences(next.error)!;}state=Object.freeze(next);for(const listener of listeners)listener();};
 const command=createWalletCommand<Intent,Result>({newRequestId:options.newRequestId,execute:(intent,nonce)=>{
  if(intent.action==='delete')return intent.kind==='category'?api.deleteCategory(intent.id,intent.revision,nonce):api.deleteLabel(intent.id,intent.revision,nonce);
  return intent.kind==='category'?(intent.id?api.updateCategory(intent.id,intent.revision,intent.input,nonce):api.createCategory(intent.input,nonce)):(intent.id?api.updateLabel(intent.id,intent.revision,intent.input,nonce):api.createLabel(intent.input,nonce));
 }});
 const publicCommand=()=>{const {result:_result,...value}=command.snapshot();return value;};
 const unsubscribe=command.subscribe(()=>publish({command:publicCommand()}));
 const busy=()=>['pending','unknown'].includes(command.snapshot().phase);
 const editable=()=>!disposed&&state.phase==='ready'&&state.canManage&&!busy();
 const failure=(error:unknown)=>error instanceof WalletApiError?error:new WalletApiError(0,'Không tải được Wallet.','NETWORK_ERROR',undefined);
 const find=(kind:Kind,id:string)=>state.catalog?.[kind==='category'?'categories':'labels'].find(item=>item.id===id);
 const duplicate=()=>command.snapshot().error?.code==='CATALOG_NAME_CONFLICT';
 async function refresh(){
  if(disposed)return;const current=++generation;previewGeneration++;
  publish({phase:'checking',catalog:null,canManage:false,form:null,deletion:null,error:null,command:publicCommand()});
  try{
   const status=await api.status();if(disposed||current!==generation)return;
   if(!status.active){if(!busy())form=null;publish({phase:'inactive'});return;}
   const [catalog,capabilities]=await Promise.all([api.catalog(),api.catalogCapabilities()]);if(disposed||current!==generation)return;
   if(!capabilities.canManage&&!busy())form=null;
   if(form?.initial&&!catalog[form.kind==='category'?'categories':'labels'].some(item=>item.id===form!.initial!.id)&&!busy())form=null;
   publish({phase:'ready',catalog,canManage:capabilities.canManage,form:capabilities.canManage&&formOpen?form:null,command:publicCommand()});
  }catch(error){if(disposed||current!==generation)return;if(!busy())form=null;publish({phase:'error',catalog:null,canManage:false,form:null,error:failure(error)});}
 }
 async function finish(operation:()=>Promise<void>){await operation();if(disposed)return;if(command.snapshot().phase==='success'){form=null;formOpen=false;publish({form:null,deletion:null});await refresh();}}
 return {setKind(kind:Kind){if(disposed)return;previewGeneration++;publish({kind,deletion:null});},snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},refresh,
  create(kind:Kind){if(!editable()||form)return;previewGeneration++;command.reset();formOpen=true;form={kind,draft:draft(),invalid:false};publish({kind,form,deletion:null,error:null});},
  edit(kind:Kind,id:string){if(!editable()||form)return;const initial=find(kind,id);if(!initial)return;previewGeneration++;command.reset();formOpen=true;form={kind,initial:structuredClone(initial),draft:draft(initial),invalid:false};publish({kind,form,deletion:null,error:null});},
  change(patch:Partial<CatalogDraft>){if(!editable()||!form||command.snapshot().phase==='conflict'&&!duplicate())return;if(duplicate())command.reset();form={...form,draft:{...form.draft,...patch},invalid:false};publish({form});},
  cancel(){if(!editable())return;command.reset();form=null;formOpen=false;previewGeneration++;publish({form:null,deletion:null,error:null});},
  hideForm(){if(disposed||!busy())return;formOpen=false;publish({form:null});},
  resumeForm(){if(disposed||state.phase!=='ready'||!state.canManage||!form)return;formOpen=true;publish({form});},
  async reload(){if(!editable()||!form?.initial)return;const {kind,initial}=form;form=null;command.reset();await refresh();if(!editable())return;const current=find(kind,initial.id);if(!current)return;formOpen=true;form={kind,initial:structuredClone(current),draft:draft(current),invalid:false};publish({form});},
  async save(){if(!editable()||!form||command.snapshot().phase==='conflict'&&!duplicate())return;const value=form.draft;if(!value.name.trim()||value.name.length>500){form={...form,invalid:true};publish({form});return;}
   if(duplicate())command.reset();const base={name:value.name,icon:value.icon,color:value.color,hidden:value.hidden,archived:value.archived},input=form.kind==='category'?{...base,parentId:value.parentId,nature:value.nature}:base;
   await finish(()=>command.submit({action:'save',kind:form!.kind,id:form!.initial?.id,revision:form!.initial?.revision??0,input}));
  },
  async previewDelete(kind:Kind,id:string){if(!editable()||form)return;const item=find(kind,id);if(!item)return;const current=generation,preview=++previewGeneration;publish({deletion:null,error:null});try{const result=await(kind==='category'?api.categoryDeletion(id):api.labelDeletion(id));if(!editable()||current!==generation||preview!==previewGeneration)return;if(result.revision!==item.revision)throw new WalletApiError(409,'Danh mục đã thay đổi.','CONFLICT',undefined);publish({deletion:{...result,kind}});}catch(error){if(disposed||current!==generation||preview!==previewGeneration)return;publish({error:failure(error),deletion:null});}},
  async delete(){if(!editable()||form||!state.deletion?.canDelete)return;const item=find(state.deletion.kind,state.deletion.id);if(!item||item.revision!==state.deletion.revision)return;const {kind,id,revision}=state.deletion;command.reset();await finish(()=>command.submit({action:'delete',kind,id,revision}));},
  async retry(){if(disposed||state.phase!=='ready'||!state.canManage||command.snapshot().phase!=='unknown')return;await finish(()=>command.retry());},
  dispose(){if(disposed)return;generation++;previewGeneration++;form=null;unsubscribe();command.dispose();state={kind:'category',phase:'disposed',catalog:null,canManage:false,form:null,deletion:null,command:{phase:'disposed'},error:null};disposed=true;for(const listener of listeners)listener();listeners.clear();}
 };
}
export type CatalogWorkspace=ReturnType<typeof createCatalogWorkspace>;
