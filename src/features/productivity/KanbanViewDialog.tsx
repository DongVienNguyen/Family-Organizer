import React,{useCallback,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {FancySelect} from '../../components/FancySelect.js';
import {useModalA11y} from '../../hooks/useModalA11y.js';
import {assertKanbanViewDraft,type KanbanViewDraft} from './kanbanViewDraft.js';
import type {createKanbanViewEditorState} from './kanbanViewEditorState.js';
const button='bg-slate-800 hover:bg-slate-850 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-200 cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
const input='w-full min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40';
type State=ReturnType<ReturnType<typeof createKanbanViewEditorState>['snapshot']>;
export function KanbanViewDialog({state,ready,onDraft,onApply,onClose,onReload}:{state:State;ready:boolean;onDraft(draft:KanbanViewDraft):void;onApply():void;onClose():void;onReload():void}){
 const {t}=useTranslation(),ref=useRef<HTMLFormElement>(null),latest=useRef(onClose);latest.current=onClose;const close=useCallback(()=>latest.current(),[]);useModalA11y(ready,close,ref);
 const draft=state.draft;if(!ready||!draft)return null;const c=draft.input.config;if(c.kind!=='kanban')return null;
 const filter=draft.input.filter,busy=state.writing||state.reloading;let valid=true;try{assertKanbanViewDraft(draft);}catch{valid=false;}
 const edit=(next:Partial<typeof draft.input>)=>onDraft({...draft,input:{...draft.input,...next}});
 const toggle=(field:'priority'|'lifecycle',value:string,checked:boolean)=>{const next={...filter},values=(filter[field]??[])as string[],rows=checked?[...values,value]:values.filter(v=>v!==value);if(rows.length)(next as any)[field]=rows;else delete next[field];edit({filter:next});};
 return <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={close}><form ref={ref} role="dialog" aria-modal="true" aria-label={t('productivityKanbanView.edit')} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();if(!busy&&!state.conflict&&(state.locked||valid))onApply();}}>
  <header className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-100">{t('productivityKanbanView.edit')}</h2><button type="button" className={button} onClick={close}>{t('common.close')}</button></header>
  <p className="text-xs text-slate-400">{t('productivityKanbanView.hint')}</p>
  <fieldset disabled={busy||state.locked} className="space-y-3 min-w-0">
   <label className="block text-xs text-slate-400">{t('productivityKanbanView.title')}<input aria-label={t('productivityKanbanView.title')} className={input} maxLength={500} value={draft.input.title} onChange={e=>edit({title:e.target.value})}/></label>
   <FancySelect ariaLabel={t('productivityKanbanView.group')} value={c.group} options={['none','priority','assignee','due',...(draft.base.formatVersion===9?['tag']:[])].map(value=>({value,label:t('productivityKanbanView.groups.'+value)}))} onChange={group=>edit({config:{...c,group:group as typeof c.group}})}/>
   <FancySelect ariaLabel={t('productivityKanbanView.sort')} value={c.sort} options={['rank','due','priority','title'].map(value=>({value,label:t('productivityKanbanView.sorts.'+value)}))} onChange={sort=>edit({config:{...c,sort:sort as typeof c.sort}})}/>
   {c.sort!=='rank'&&<p className="text-xs text-amber-400">{t('productivityKanbanView.rankHint')}</p>}
   <label className="block text-xs text-slate-400">{t('productivityKanbanView.query')}<input aria-label={t('productivityKanbanView.query')} className={input} maxLength={500} value={filter.query??''} onChange={e=>{const next={...filter};if(e.target.value)next.query=e.target.value;else delete next.query;edit({filter:next});}}/></label>
   <fieldset className="space-y-2"><legend className="text-xs text-slate-400">{t('productivityKanbanView.priority')}</legend><div className="flex flex-wrap gap-3">{(['high','medium','low','none']as const).map(value=><label key={value} className="flex gap-2 items-center text-sm text-slate-300"><input type="checkbox" checked={filter.priority?.includes(value)??false} onChange={e=>toggle('priority',value,e.target.checked)}/>{t('matrixUi.priority.'+value)}</label>)}</div></fieldset>
   <fieldset className="space-y-2"><legend className="text-xs text-slate-400">{t('productivityKanbanView.lifecycle')}</legend><div className="flex flex-wrap gap-3">{(['todo','in_progress','completed','wont_do']as const).map(value=><label key={value} className="flex gap-2 items-center text-sm text-slate-300"><input type="checkbox" checked={filter.lifecycle?.includes(value)??false} onChange={e=>toggle('lifecycle',value,e.target.checked)}/>{t('productivityKanbanView.states.'+value)}</label>)}</div></fieldset>
  </fieldset>
  {state.error&&<p role="alert" className="text-xs text-rose-400">{t('productivityKanbanView.failed')}</p>}{state.conflict&&<p className="text-xs text-amber-400">{t('productivityKanbanView.conflict')}</p>}
  <footer className="flex flex-wrap gap-2"><button type="button" className={button} onClick={close}>{t('common.cancel')}</button>{state.conflict&&!state.locked&&<button type="button" className={button} disabled={busy} onClick={onReload}>{t('productivityKanbanView.reload')}</button>}<button type="submit" data-testid="kanban-view-save" className={button} disabled={busy||state.conflict||!state.locked&&!valid}>{t(state.locked?'productivityKanbanCreate.pending':'common.save')}</button></footer>
 </form></div>;
}
