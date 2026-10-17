import React,{useCallback,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {FancySelect} from '../../components/FancySelect.js';
import {useModalA11y} from '../../hooks/useModalA11y.js';
import {boardPolicyDraft,type ColumnPolicy} from './boardPolicyApi.js';
import type {BoardPolicyState} from './boardPolicyState.js';
const button='bg-slate-800 hover:bg-slate-850 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-200 cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
export function KanbanPolicyDialog({state,titles,ready,onEdit,onApply,onClose,onReload}:{state:BoardPolicyState;titles:Record<string,string>;ready:boolean;onEdit(key:string,policy:ColumnPolicy['policy'],limit:number|null):void;onApply():void;onClose():void;onReload():void}){
 const {t}=useTranslation(),ref=useRef<HTMLDivElement>(null),latest=useRef(onClose);latest.current=onClose;const close=useCallback(()=>latest.current(),[]);useModalA11y(ready,close,ref);
 if(!ready||!state.board||!state.draft)return null;
 const busy=state.loading||state.saving,editable=!busy&&!state.locked,recoverable=!state.error||state.error.phase==='write'&&(state.error.status===null||state.error.status>=500);
 let valid=state.draftRevision===state.board.revision;try{boardPolicyDraft(state.board,state.draft);}catch{valid=false;}
 return <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={close}><div ref={ref} role="dialog" aria-modal="true" aria-label={t('productivityKanbanPolicy.title')} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4" onClick={e=>e.stopPropagation()}>
  <header className="flex items-start justify-between gap-3"><h2 className="text-sm font-bold text-slate-100">{t('productivityKanbanPolicy.title')}</h2><button type="button" className={button} onClick={close}>{t('common.close')}</button></header>
  <p className="text-xs text-slate-400">{t('productivityKanbanPolicy.scope')}</p><p className="text-xs text-slate-400">{t('productivityKanbanPolicy.unchanged')}</p>
  <fieldset disabled={!editable} className="space-y-3">{state.draft.map(row=>{const title=titles[row.columnKey]??t('productivityKanbanPolicy.unavailable');return <div key={row.columnKey} className="bg-slate-950 rounded-xl p-3 space-y-2 min-w-0"><h3 className="text-sm font-bold text-slate-200 break-words">{title}</h3><FancySelect ariaLabel={t('productivityKanbanPolicy.policyFor',{title})} value={row.policy} options={(['off','soft','hard']as const).map(value=>({value,label:t('productivityKanbanPolicy.'+value)}))} onChange={value=>onEdit(row.columnKey,value as ColumnPolicy['policy'],value==='off'?null:row.limit??1)}/>{row.policy!=='off'&&<label className="block text-xs text-slate-400">{t('productivityKanbanPolicy.limitFor',{title})}<input aria-label={t('productivityKanbanPolicy.limitFor',{title})} inputMode="numeric" value={Number.isSafeInteger(row.limit)?row.limit!:''} onChange={e=>onEdit(row.columnKey,row.policy,/^[1-9]\d*$/.test(e.target.value)?Number(e.target.value):NaN)} className="w-full min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40"/></label>}</div>;})}</fieldset>
  {state.error&&<p role="alert" className="text-xs text-rose-400">{t('productivityKanbanPolicy.failed')}</p>}
  <div className="flex flex-wrap gap-2"><button type="button" data-testid="kanban-policy-apply" className={button} disabled={busy||!recoverable||!state.locked&&!valid} onClick={onApply}>{t(state.locked?'productivityKanbanPolicy.pending':'productivityKanbanPolicy.apply')}</button>{!state.locked&&<button type="button" className={button} disabled={busy} onClick={onReload}>{t('productivityKanbanPolicy.reload')}</button>}</div>
 </div></div>;
}
