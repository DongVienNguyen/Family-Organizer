import React,{useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {createBoardPolicyState,BoardPolicyState} from './boardPolicyState.js';
import {KanbanPolicyDialog} from './KanbanPolicyDialog.js';
export function KanbanPolicySettings({commands,state,ready,titles,onReload}:{commands:ReturnType<typeof createBoardPolicyState>;state:BoardPolicyState;ready:boolean;titles:Record<string,string>;onReload():void}){
 const {t}=useTranslation(),[hidden,setHidden]=useState(false);if(!ready)return null;
 return <section data-testid="kanban-policy-settings" data-policy-revision={state.board?.revision??''} className="space-y-2" aria-label={t('productivityKanbanPolicy.title')}>
  {state.board&&<button type="button" className="bg-slate-900 neu-btn rounded-xl px-4 py-2.5 text-xs font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40" onClick={()=>{setHidden(false);if(!state.draft)commands.open();}}>{t(state.locked?'productivityKanbanPolicy.pending':'productivityKanbanPolicy.title')}</button>}
  {state.error&&!state.draft&&<><p role="alert" className="text-xs text-rose-400">{t('productivityKanbanPolicy.failed')}</p><button type="button" disabled={state.loading||state.saving} className="text-xs text-sky-400" onClick={onReload}>{t('productivityKanbanPolicy.reload')}</button></>}
  {!hidden&&state.draft&&<KanbanPolicyDialog state={state} titles={titles} ready={ready} onEdit={(...args)=>commands.edit(...args)} onApply={()=>void commands.apply()} onClose={()=>{commands.cancel();setHidden(true);}} onReload={onReload}/>}
 </section>;
}
