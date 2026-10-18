import {WalletApiError,type WalletApi} from './api.js';
import {createWalletCommand,type WalletCommandState} from './commandState.js';
import {normalizeBudgetDraft,type WalletBudgetDraft,type BudgetFilter} from './budgetContracts.js';
import {resolvePeriod} from './dates.js';
import {parseMoney} from './money.js';
import {editableAmount} from './accountDraft.js';
import type {BudgetDetail,BudgetReport,BudgetSummary,BalanceForecast,BalanceForecastInput} from './budgetDto.js';
import type {WalletBudgetHeader,BudgetCarryResult} from '../../../server/wallet/budgets.js';
import type {AccessibleWalletAccount} from '../../../server/wallet/access.js';
import type {WalletCatalog} from '../../../server/wallet/catalogView.js';
import type {Period} from './contracts.js';
type Api=Pick<WalletApi,'status'|'accounts'|'catalog'|'budgets'|'budget'|'budgetReport'|'saveBudget'|'carryBudget'|'budgetSummary'|'balanceForecast'>;
export interface BudgetForm {name:string;amount:string;currency:string;timezone:string;locale:string;filter:BudgetFilter;carryPolicy:WalletBudgetDraft['carryPolicy'];alertThresholds:number[];previous:BudgetDetail|null}
type Intent={kind:'save';input:{id?:string;draft?:WalletBudgetDraft;archived?:boolean};revision:number;previous?:BudgetDetail}|{kind:'carry';budget:WalletBudgetHeader;from:Period;to:Period;sourceFingerprint:string};
type Result={kind:'save';header:WalletBudgetHeader}|{kind:'carry';receipt:BudgetCarryResult};
export interface BudgetState {
 phase:'idle'|'checking'|'ready'|'unavailable'|'error'|'disposed';
 budgets:WalletBudgetHeader[];accounts:AccessibleWalletAccount[];catalog:WalletCatalog|null;
 selected:BudgetDetail|null;report:BudgetReport|null;form:BudgetForm|null;carryPreview:BudgetReport|null;receipt:BudgetCarryResult|null;
 summary:BudgetSummary|null;forecast:BalanceForecast|null;timezone:string;month:string;method:'scheduledOnly'|'historicalAverage';
 loading:boolean;command:WalletCommandState<never>;error:WalletApiError|null;
}
const sameScope=(a:AccessibleWalletAccount[],b:AccessibleWalletAccount[])=>JSON.stringify(a.map(v=>[v.id,v.revision,v.permission,v.archivedAt]).sort())===JSON.stringify(b.map(v=>[v.id,v.revision,v.permission,v.archivedAt]).sort());
const headerSignature=(v:WalletBudgetHeader)=>JSON.stringify([v.id,v.name,v.revision,v.policyRevision,v.limit,v.timezone,v.archivedAt]);
const conflict=()=>new WalletApiError(409,'Quyền hoặc cấu hình ngân sách vừa thay đổi.','CONFLICT',undefined);
const failure=(e:unknown)=>e instanceof WalletApiError?e:new WalletApiError(0,'Không tải được ngân sách.','NETWORK_ERROR',undefined);
/** Private projections are memory-only. Every late read repeats current account
 * and definition authorization. Only an unresolved immutable command survives
 * hiding; it is destroyed at the session boundary. No automatic retry. */
export function createBudgetWorkspace(api:Api,options:{date:()=>string;timezone:string;newRequestId?:()=>string}){
 const clear=()=>({budgets:[],accounts:[],catalog:null,selected:null,report:null,form:null,carryPreview:null,receipt:null,summary:null,forecast:null,loading:false,error:null});
 let state:BudgetState={...clear(),phase:'idle',timezone:options.timezone,month:options.date().slice(0,7),method:'scheduledOnly',command:{phase:'idle'}},active=false,disposed=false,generation=0,visibility=0,targetId:string|null=null,completed:Result|null=null;
 const listeners=new Set<()=>void>(),publish=(patch:Partial<BudgetState>)=>{if(disposed)return;state=Object.freeze({...state,...patch});for(const fn of listeners)fn();};
 const command=createWalletCommand<Intent,Result>({newRequestId:options.newRequestId,execute:async(intent,key)=>intent.kind==='save'?{kind:'save',header:await api.saveBudget(intent.input,intent.revision,key,intent.previous)}:{kind:'carry',receipt:await api.carryBudget(intent.budget,intent.from,intent.to,key,intent.sourceFingerprint)}});
 const unsubscribe=command.subscribe(()=>{const {result:_result,...publicState}=command.snapshot();publish({command:publicState});});
 const busy=()=>['pending','unknown'].includes(command.snapshot().phase),editable=()=>active&&!disposed&&state.phase==='ready'&&!state.loading&&!busy(),current=(v:number)=>active&&!disposed&&generation===v;
 const period=(timezone=state.selected?.timezone??options.timezone)=>resolvePeriod({kind:'month',anchorDate:state.month+'-01'},timezone);
 async function fresh(v:number,scope:AccessibleWalletAccount[],headers:WalletBudgetHeader[]=[]){
  const accounts=await api.accounts();if(!current(v))return false;if(!sameScope(scope,accounts))throw conflict();
  for(const header of headers){const latest=await api.budget(header.id);if(!current(v))return false;if(headerSignature(latest)!==headerSignature(header))throw conflict();}return true;
 }
 function failed(v:number,e:unknown){if(current(v)){completed=null;publish({...clear(),phase:'error',error:failure(e)});}}
 function present(){if(completed?.kind==='carry'&&state.phase==='ready'&&!state.loading&&state.selected?.id===completed.receipt.budgetId)publish({receipt:completed.receipt});}
 async function refresh(){if(disposed)return;const v=++generation;publish({...clear(),phase:active?'checking':'idle'});if(!active)return;
  try{const status=await api.status();if(!current(v))return;if(!status.active||status.storageVersion<14){publish({phase:'unavailable'});return;}
   const [accounts,catalog,budgets]=await Promise.all([api.accounts(),api.catalog(),api.budgets()]);if(!await fresh(v,accounts))return;const latest=await api.budgets();if(!current(v))return;if(JSON.stringify(latest.map(headerSignature))!==JSON.stringify(budgets.map(headerSignature)))throw conflict();
   publish({phase:'ready',accounts,catalog,budgets});if(targetId&&!busy()&&budgets.some(b=>b.id===targetId))await select(targetId);present();
  }catch(e){failed(v,e);}
 }
 async function select(id:string){if(!editable())return;targetId=id;const v=++generation,scope=state.accounts,p=period(state.budgets.find(b=>b.id===id)?.timezone),method=state.method;
  publish({selected:null,report:null,form:null,carryPreview:null,receipt:null,summary:null,forecast:null,loading:true,error:null});
  try{const selected=await api.budget(id),report=await api.budgetReport(id,p,method);if(headerSignature(selected)!==headerSignature(report.budget))throw conflict();if(!await fresh(v,scope,[selected]))return;publish({selected,report,loading:false});present();}catch(e){failed(v,e);}
 }
 async function finish(visible:number){if(disposed||!active||visible!==visibility)return;const result=command.snapshot().result;if(!result)return;completed=result;targetId=result.kind==='save'?result.header.id:result.receipt.budgetId;await refresh();if(active&&!disposed&&visible===visibility)present();}
 async function submit(intent:Intent){const visible=visibility;command.reset();completed=null;publish({form:null,carryPreview:null,receipt:null,summary:null,forecast:null,error:null});await command.submit(intent);await finish(visible);}
 const owner={snapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  async show(){if(disposed)return;active=true;visibility++;await refresh();},
  hide(){if(disposed)return;active=false;visibility++;generation++;targetId=null;completed=null;publish({...clear(),phase:'idle'});},refresh,select,
  async setMonth(month:string){if(!editable()||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;try{resolvePeriod({kind:'month',anchorDate:month+'-01'},options.timezone);}catch{return;}publish({month,report:null,summary:null,forecast:null,carryPreview:null,receipt:null});if(targetId)await select(targetId);},
  async setMethod(method:BudgetState['method']){if(!editable()||!['scheduledOnly','historicalAverage'].includes(method))return;publish({method,report:null,summary:null,forecast:null,carryPreview:null,receipt:null});if(targetId)await select(targetId);},
  create(locale:string){if(!editable())return;generation++;command.reset();targetId=null;completed=null;publish({selected:null,report:null,carryPreview:null,receipt:null,summary:null,forecast:null,form:{name:'',amount:'',currency:'VND',timezone:options.timezone,locale,filter:{},carryPolicy:'none',alertThresholds:[80,100],previous:null},error:null});},
  async edit(id:string,locale:string){if(!editable())return;const v=++generation,scope=state.accounts;publish({form:null,carryPreview:null,receipt:null,loading:true,error:null});try{const detail=await api.budget(id);if(!await fresh(v,scope,[detail]))return;publish({loading:false,form:{name:detail.name,amount:editableAmount(detail.limit.minor,detail.limit.currency,locale),currency:detail.limit.currency,timezone:detail.timezone,locale,filter:structuredClone(detail.draft.filter),carryPolicy:detail.draft.carryPolicy,alertThresholds:[...detail.draft.alertThresholds],previous:detail}});}catch(e){failed(v,e);}},
  change(patch:Partial<Omit<BudgetForm,'previous'>>){if(!editable()||!state.form)return;generation++;if(command.snapshot().phase==='conflict')command.reset();publish({form:structuredClone({...state.form,...patch}),carryPreview:null,receipt:null,error:null});},
  cancel(){if(!editable())return;generation++;command.reset();publish({form:null,carryPreview:null,error:null});},
  async save(){if(!editable()||!state.form)return;const form=state.form;try{const draft=normalizeBudgetDraft({name:form.name,limit:parseMoney(form.amount,form.currency,form.locale),timezone:form.timezone,filter:form.filter,carryPolicy:form.carryPolicy,alertThresholds:form.alertThresholds});await submit({kind:'save',input:{...(form.previous?{id:form.previous.id}:{}),draft},revision:form.previous?.revision??0,...(form.previous?{previous:form.previous}:{})});}catch(e){publish({error:e instanceof WalletApiError?e:new WalletApiError(400,'Cấu hình ngân sách không hợp lệ.','INVALID_INPUT',undefined)});}},
  async archive(id:string){if(!editable())return;const header=state.budgets.find(b=>b.id===id);if(header)await submit({kind:'save',input:{id,archived:!header.archivedAt},revision:header.revision});},
  async prepareCarry(){if(!editable()||!state.selected||!state.report)return;if(state.report.carryReceipts.length){publish({receipt:state.report.carryReceipts[0],carryPreview:null});return;}
   const selected=state.selected,p=state.report.period,scope=state.accounts,v=++generation;publish({carryPreview:null,receipt:null,loading:true,error:null});
   try{if(selected.archivedAt||selected.draft.carryPolicy==='none')throw conflict();const date=new Date(p.fromDate+'T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);const from=resolvePeriod({kind:'month',anchorDate:date.toISOString().slice(0,10)},p.timezone);if(from.toDateExclusive>options.date())throw conflict();const preview=await api.budgetReport(selected.id,from,'scheduledOnly');if(headerSignature(preview.budget)!==headerSignature(selected)||!preview.amounts.remaining)throw conflict();if(!await fresh(v,scope,[selected]))return;publish({carryPreview:preview,loading:false});}catch(e){failed(v,e);}
  },
  async applyCarry(){if(!editable()||!state.selected||!state.report||!state.carryPreview)return;const preview=state.carryPreview;if(headerSignature(preview.budget)!==headerSignature(state.selected))return;await submit({kind:'carry',budget:preview.budget,from:preview.period,to:state.report.period,sourceFingerprint:preview.sourceFingerprint});},
  clearSummary(){if(editable()){generation++;publish({summary:null});}},
  clearForecast(){if(editable()){generation++;publish({forecast:null});}},
  async summarize(ids:string[],currency:string){if(!editable())return;const captured=[...ids],headers=captured.map(id=>state.budgets.find(b=>b.id===id));if(!captured.length||captured.length>32||headers.some(h=>!h)||new Set(captured).size!==captured.length)return;const v=++generation,scope=state.accounts,p=period(headers[0]!.timezone);publish({summary:null,loading:true,error:null});try{const summary=await api.budgetSummary(captured,p,currency);if(!await fresh(v,scope,headers as WalletBudgetHeader[]))return;publish({summary,loading:false});}catch(e){failed(v,e);}},
  async forecast(input:BalanceForecastInput){if(!editable())return;const captured=structuredClone(input),v=++generation,scope=state.accounts;publish({forecast:null,loading:true,error:null});try{const forecast=await api.balanceForecast(captured);if(!await fresh(v,scope))return;publish({forecast,loading:false});}catch(e){failed(v,e);}},
  async retry(){if(!active||disposed||state.phase!=='ready'||command.snapshot().phase!=='unknown')return;const visible=visibility;await command.retry();await finish(visible);},
  dispose(){if(disposed)return;active=false;visibility++;generation++;targetId=null;completed=null;unsubscribe();command.dispose();state=Object.freeze({...state,...clear(),phase:'disposed',command:{phase:'disposed' as const}});disposed=true;for(const fn of listeners)fn();listeners.clear();},
 };return owner;
}
export type BudgetWorkspace=ReturnType<typeof createBudgetWorkspace>;
