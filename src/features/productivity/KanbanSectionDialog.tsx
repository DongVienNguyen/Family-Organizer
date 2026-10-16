import React,{useCallback,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {FancySelect} from '../../components/FancySelect.js';
import {useModalA11y} from '../../hooks/useModalA11y.js';
import type {TaskRecord} from './contracts.js';
import type {BoardCommandPlan} from './boardCommandsClient.js';
import type {KanbanCommandState} from './kanbanCommandState.js';
const button='bg-slate-900 neu-btn rounded-xl px-4 py-2.5 text-xs font-bold text-slate-200 cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
export function KanbanSectionDialog({task,columns,target,plan,busy,ready,error,onTarget,onPreview,onApply,onCancel}:{task:TaskRecord;columns:{id:string;title:string}[];target:string;plan:BoardCommandPlan|null;busy:boolean;ready:boolean;error:KanbanCommandState['error'];onTarget(id:string):void;onPreview():void;onApply():void;onCancel():void}){
 const {t}=useTranslation(),ref=useRef<HTMLDivElement>(null),latest=useRef({busy,onCancel});latest.current={busy,onCancel};const close=useCallback(()=>{if(!latest.current.busy)latest.current.onCancel();},[]);useModalA11y(ready,close,ref);
 const valid=ready&&!busy&&plan!==null&&plan.taskId===task.id&&plan.targetColumnId===target;
 return <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={close}><div ref={ref} role="dialog" aria-modal="true" aria-label={t('productivityKanbanMove.dialog')} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4" onClick={event=>event.stopPropagation()}>
  <header className="flex items-start justify-between gap-3"><h2 className="text-sm font-bold text-slate-100">{t('productivityKanbanMove.dialog')}</h2><button type="button" className={button} disabled={busy} onClick={close}>{t('common.close')}</button></header>
  <p className="text-sm text-slate-200 break-words">{task.title}</p><p className="text-xs text-slate-400">{t('productivityKanbanMove.classification')}</p>
  <fieldset disabled={busy||!ready} className="min-w-0"><FancySelect ariaLabel={t('productivityKanbanMove.target')} value={target} onChange={onTarget} options={[{value:'',label:t('productivityKanbanMove.choose')},...columns.map(c=>({value:c.id,label:c.title}))]}/></fieldset>
  {plan&&<p className="text-xs text-slate-400 font-mono break-words">{plan.clock.timezone} · {t('productivityKanbanMove.expires')} {plan.expiresAt}</p>}
  {plan?.warning==='wip'&&<p className="text-xs text-amber-400">{t('productivityKanbanMove.wip')}</p>}
  {error&&<p role="alert" className="text-xs text-rose-400">{t(error.status===409?'productivityKanbanMove.conflict':error.status===422?'productivityKanbanMove.semantic':'productivityKanbanMove.failed')}</p>}
  <footer className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={close}>{t('common.cancel')}</button><button type="button" className={button} disabled={!ready||busy||!target} onClick={onPreview}>{t('productivityKanbanMove.preview')}</button><button type="button" data-testid="kanban-section-apply" disabled={!valid} onClick={onApply} className="bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60">{t(busy?'productivityKanbanMove.busy':'productivityKanbanMove.apply')}</button></footer>
 </div></div>;
}
