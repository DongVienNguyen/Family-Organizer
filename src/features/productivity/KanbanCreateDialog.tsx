import React,{useCallback,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {FancySelect} from '../../components/FancySelect.js';
import {DateInputDMY} from '../../components/DateTimePicker24.js';
import {useModalA11y} from '../../hooks/useModalA11y.js';
import {assertKanbanCreateDraft,type KanbanCreateDraft} from './kanbanCreateDraft.js';
import type {DraftCommandState} from './draftCommandState.js';
const button='bg-slate-800 hover:bg-slate-850 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-200 cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
const input='w-full min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40';
export function KanbanCreateDialog({state,lists,timezone,ready,onDraft,onApply,onClose,onReload}:{state:DraftCommandState<KanbanCreateDraft,unknown>;lists:{id:string;title:string}[];timezone:string;ready:boolean;onDraft(draft:KanbanCreateDraft):void;onApply():void;onClose():void;onReload?:()=>void}){
 const {t}=useTranslation(),ref=useRef<HTMLFormElement>(null),latest=useRef(onClose);latest.current=onClose;const close=useCallback(()=>latest.current(),[]);useModalA11y(ready,close,ref);
 if(!ready||!state.draft)return null;const draft=state.draft;if(draft.kind==='task'&&!lists.some(l=>l.id===draft.board.listId))return null;let valid=true;try{assertKanbanCreateDraft(draft);}catch{valid=false;}
 if(draft.kind==='view'&&!lists.some(l=>l.id===draft.input.listId))valid=false;
 const edit=(value:Partial<typeof draft.input>)=>onDraft({...draft,input:{...draft.input,...value}}as KanbanCreateDraft);
 return <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={close}><form ref={ref} role="dialog" aria-modal="true" aria-label={t('productivityKanbanCreate.'+(draft.kind==='view'?'newView':'addTask'))} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();if(!state.writing&&(state.locked||valid))onApply();}}>
  <header className="flex items-start justify-between gap-3"><h2 className="text-sm font-bold text-slate-100">{t('productivityKanbanCreate.'+(draft.kind==='view'?'newView':'addTask'))}</h2><button type="button" className={button} onClick={close}>{t('common.close')}</button></header>
  <p className="text-xs text-slate-400">{t('productivityKanbanCreate.'+(draft.kind==='view'?'draftHint':'taskHint'))}</p>
  <fieldset disabled={state.writing||state.locked} className="space-y-3 min-w-0">
   <label className="block text-xs text-slate-400">{t('productivityKanbanCreate.'+(draft.kind==='view'?'viewTitle':'title'))}<input aria-label={t('productivityKanbanCreate.'+(draft.kind==='view'?'viewTitle':'title'))} className={input} value={draft.input.title} maxLength={500} onChange={e=>edit({title:e.target.value})}/></label>
   {draft.kind==='view'?<><FancySelect ariaLabel={t('productivityKanbanCreate.list')} value={draft.input.listId} options={lists.map(l=>({value:l.id,label:l.title}))} onChange={listId=>edit({listId})}/><FancySelect ariaLabel={t('productivityKanbanCreate.mode')} value={draft.input.mode} options={['sections','workflow'].map(value=>({value,label:t('productivityKanbanCreate.'+value)}))} onChange={mode=>edit({mode:mode as 'sections'|'workflow'})}/></>:<>
    <p className="text-sm text-slate-200 break-words">{draft.columnTitle}</p><FancySelect ariaLabel={t('productivityKanbanCreate.priority')} value={draft.input.priority} options={['high','medium','low','none'].map(value=>({value,label:t('matrixUi.priority.'+value)}))} onChange={priority=>edit({priority:priority as typeof draft.input.priority})}/>
    <DateInputDMY ariaLabel={t('productivityKanbanCreate.due')} value={draft.input.due.kind==='all_day'?draft.input.due.date:''} onChange={date=>edit({due:date?{kind:'all_day',date,timezone}:{kind:'none'}})}/>
    <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={draft.input.isShared} onChange={e=>edit({isShared:e.target.checked})}/>{t('productivityKanbanCreate.shared')}</label>
   </>}
  </fieldset>
  {state.error&&<p role="alert" className="text-xs text-rose-400">{t('productivityKanbanCreate.failed')}</p>}
  <footer className="flex flex-wrap gap-2"><button type="button" className={button} onClick={close}>{t('common.cancel')}</button>{draft.kind==='task'&&state.error?.status===409&&!state.locked&&onReload&&<button type="button" className={button} onClick={onReload}>{t('productivityKanbanCreate.refreshDraft')}</button>}<button type="submit" data-testid="kanban-create-apply" className={button} disabled={state.writing||!state.locked&&!valid}>{t(state.locked?'productivityKanbanCreate.pending':'productivityKanbanCreate.confirm')}</button></footer>
 </form></div>;
}
