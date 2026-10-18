import {WalletApiError,type WalletApi} from './api.js';
import {createWalletCommand,type WalletCommandState} from './commandState.js';
import {normalizeRuleDraft,type RuleDraft,type RuleProposal} from './ruleContracts.js';
import type {RecordFilter} from './contracts.js';
import type {RulePreviewInput,RulePreviewSummary,WalletRuleHeader} from '../../../server/wallet/rules.js';
import type {WalletCatalog} from '../../../server/wallet/catalogView.js';
import type {AccessibleWalletAccount} from '../../../server/wallet/access.js';
type Api=Pick<WalletApi,'status'|'accounts'|'catalog'|'rules'|'rule'|'saveRule'|'previewRules'|'rulePreview'|'rulePreviewRows'|'applyRulePreview'>;
type Receipt=Awaited<ReturnType<WalletApi['applyRulePreview']>>;
type Intent={kind:'save';input:{id?:string;draft?:RuleDraft;archived?:boolean};revision:number}|{kind:'preview';input:RulePreviewInput;filter:RecordFilter}|{kind:'apply';preview:RulePreviewSummary};
type Result={kind:'save';value:WalletRuleHeader}|{kind:'preview';value:RulePreviewSummary}|{kind:'apply';value:Receipt};
export interface RuleWorkspaceState {phase:'idle'|'checking'|'ready'|'unavailable'|'error'|'disposed';rules:WalletRuleHeader[];accounts:AccessibleWalletAccount[];catalog:WalletCatalog|null;draft:RuleDraft|null;editing:WalletRuleHeader|null;selected:string[];preview:RulePreviewSummary|null;rows:RuleProposal[];applied:Receipt|null;command:WalletCommandState<never>;error:WalletApiError|null}
const empty=():RuleDraft=>({name:'',criteria:{keywords:[],keywordMatch:'any',kinds:['income','expense'],sources:['import']},priority:10,stopOnMatch:false,actions:{markReviewed:true}});
const failure=(v:unknown)=>v instanceof WalletApiError?v:new WalletApiError(0,'Không tải được quy tắc.','NETWORK_ERROR',undefined);
const sameScope=(a:AccessibleWalletAccount[],b:AccessibleWalletAccount[])=>JSON.stringify(a.map(v=>[v.id,v.revision,v.permission,v.archivedAt]).sort())===JSON.stringify(b.map(v=>[v.id,v.revision,v.permission,v.archivedAt]).sort());
/** Session memory owns drafts/previews and the immutable uncertain command.
 * Navigation and scope refresh retire views synchronously, never retry writes. */
export function createRuleWorkspace(api:Api,options:{newRequestId?:()=>string}={}){
 let state:RuleWorkspaceState={phase:'idle',rules:[],accounts:[],catalog:null,draft:null,editing:null,selected:[],preview:null,rows:[],applied:null,command:{phase:'idle'},error:null},active=false,disposed=false,generation=0,visibility=0;
 const listeners=new Set<()=>void>(),publish=(patch:Partial<RuleWorkspaceState>)=>{if(disposed)return;state=Object.freeze({...state,...patch});for(const l of listeners)l();};
 const command=createWalletCommand<Intent,Result>({newRequestId:options.newRequestId,execute:async(intent,nonce)=>intent.kind==='save'?{kind:'save',value:await api.saveRule(intent.input,intent.revision,nonce)}:intent.kind==='preview'?{kind:'preview',value:await api.previewRules(intent.input,intent.filter,nonce)}:{kind:'apply',value:await api.applyRulePreview(intent.preview,nonce)}});
 const publicCommand=()=>{const {result:_result,...v}=command.snapshot();return v;},unsubscribe=command.subscribe(()=>publish({command:publicCommand()})),busy=()=>['pending','unknown'].includes(command.snapshot().phase),editable=()=>active&&!disposed&&state.phase==='ready'&&!busy();
 const clear=()=>({rules:[],accounts:[],catalog:null,draft:null,editing:null,selected:[],preview:null,rows:[],applied:null,error:null});
 async function refresh(){if(disposed)return;const version=++generation;publish({...clear(),phase:active?'checking':'idle'});if(!active)return;try{const status=await api.status();if(disposed||!active||version!==generation)return;if(!status.active||status.storageVersion<11){publish({phase:'unavailable'});return;}const [accounts,catalog,rules]=await Promise.all([api.accounts(),api.catalog(),api.rules()]);if(disposed||!active||version!==generation)return;publish({phase:'ready',accounts,catalog,rules,error:null});}catch(error){if(disposed||!active||version!==generation)return;publish({...clear(),phase:'error',error:failure(error)});}}
 async function finish(visible:number){if(disposed||!active||visible!==visibility)return;const result=command.snapshot().result;if(!result)return;if(result.kind==='preview'){
   const version=++generation,expected=state.accounts;publish({preview:null,rows:[],applied:null});try{const preview=await api.rulePreview(result.value.id);if(preview.hash!==result.value.hash||preview.state!=='ready')throw new WalletApiError(409,'Bản xem trước đã thay đổi.','CONFLICT',undefined);const [rows,accounts]=await Promise.all([api.rulePreviewRows(preview),api.accounts()]);if(disposed||!active||visible!==visibility||version!==generation)return;if(!sameScope(expected,accounts))throw new WalletApiError(409,'Quyền Wallet vừa thay đổi.','CONFLICT',undefined);publish({preview,rows,error:null});}catch(error){if(disposed||!active||visible!==visibility||version!==generation)return;publish({preview:null,rows:[],error:failure(error)});}
  }else{await refresh();if(!disposed&&active&&visible===visibility&&state.phase==='ready'&&result.kind==='apply')publish({applied:result.value});}}
 async function submit(intent:Intent){const visible=visibility;command.reset();await command.submit(intent);await finish(visible);}
 const owner={snapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},async show(){if(disposed)return;active=true;visibility++;await refresh();},hide(){if(disposed)return;active=false;visibility++;generation++;publish({...clear(),phase:'idle'});},refresh,
  create(){if(!editable())return;command.reset();generation++;publish({draft:empty(),editing:null,preview:null,rows:[],applied:null,error:null});},
  async edit(id:string){if(!editable())return;const version=++generation;publish({draft:null,editing:null,preview:null,rows:[],applied:null,error:null});try{const detail=await api.rule(id);if(disposed||!active||version!==generation)return;const {draft,...header}=detail;publish({draft,editing:header});}catch(error){if(disposed||!active||version!==generation)return;publish({error:failure(error)});}},
  change(patch:Partial<RuleDraft>){if(!editable()||!state.draft)return;generation++;if(command.snapshot().phase==='conflict')command.reset();publish({draft:structuredClone({...state.draft,...patch}),preview:null,rows:[],applied:null,error:null});},
  cancel(){if(!editable())return;generation++;command.reset();publish({draft:null,editing:null,preview:null,rows:[],error:null});},
  select(id:string,checked:boolean){if(!editable()||!state.rules.some(v=>v.id===id&&!v.archivedAt))return;generation++;publish({selected:checked?[...new Set([...state.selected,id])]:state.selected.filter(v=>v!==id),preview:null,rows:[],applied:null,error:null});},
  async save(){if(!editable()||!state.draft)return;try{const draft=normalizeRuleDraft(state.draft);await submit({kind:'save',input:{...(state.editing?{id:state.editing.id}:{}),draft},revision:state.editing?.revision??0});}catch(error){publish({error:error instanceof WalletApiError?error:new WalletApiError(400,'Cấu hình quy tắc không hợp lệ.','INVALID_INPUT',undefined)});}},
  async archive(id:string){if(!editable())return;const rule=state.rules.find(v=>v.id===id);if(!rule)return;await submit({kind:'save',input:{id,archived:!rule.archivedAt},revision:rule.revision});},
  async preview(filter:RecordFilter){if(!editable()||!state.draft&&!state.selected.length)return;try{const input:RulePreviewInput=state.draft?{drafts:[normalizeRuleDraft(state.draft)]}:{ruleIds:[...state.selected]};publish({preview:null,rows:[],applied:null,error:null});await submit({kind:'preview',input,filter:structuredClone(filter)});}catch(error){publish({error:error instanceof WalletApiError?error:new WalletApiError(400,'Cấu hình quy tắc không hợp lệ.','INVALID_INPUT',undefined)});}},
  async apply(){if(!editable()||!state.preview||!state.preview.changed)return;await submit({kind:'apply',preview:structuredClone(state.preview)});},
  async retry(){if(disposed||!active||state.phase!=='ready'||command.snapshot().phase!=='unknown')return;const visible=visibility;await command.retry();await finish(visible);},
  dispose(){if(disposed)return;active=false;visibility++;generation++;unsubscribe();command.dispose();state=Object.freeze({...state,...clear(),phase:'disposed',command:{phase:'disposed' as const}});disposed=true;for(const l of listeners)l();listeners.clear();},
 };return owner;
}
export type RuleWorkspace=ReturnType<typeof createRuleWorkspace>;
