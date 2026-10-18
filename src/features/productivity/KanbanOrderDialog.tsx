import React,{useCallback,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {FancySelect} from '../../components/FancySelect.js';
import {useModalA11y} from '../../hooks/useModalA11y.js';
import type {TaskRecord} from './contracts.js';
import type {KanbanCommandPlan,KanbanCommandState} from './kanbanCommandState.js';
export type KanbanOrderSource={kind:'column';id:string}|{kind:'priority'|'assignee'|'due'|'tag';value:string|null};
const button='bg-slate-800 hover:bg-slate-850 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-200 cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
export function KanbanOrderDialog({task,source,beforeTaskId,candidates,plan,ready,busy,error,onBefore,onPreview,onApply,onClose}:{task:TaskRecord;source:KanbanOrderSource;beforeTaskId:string|null;candidates:{id:string;title:string}[];plan:KanbanCommandPlan|null;ready:boolean;busy:boolean;error:KanbanCommandState['error'];onBefore(id:string|null):void;onPreview():void;onApply():void;onClose():void}){
 const {t}=useTranslation(),ref=useRef<HTMLDivElement>(null),latest=useRef({busy,onClose});latest.current={busy,onClose};const close=useCallback(()=>{if(!latest.current.busy)latest.current.onClose();},[]);useModalA11y(ready,close,ref);
 const anchors=candidates.filter(c=>c.id!==task.id),anchorValid=beforeTaskId===null||anchors.some(c=>c.id===beforeTaskId),matched=plan?.kind==='physical'?source.kind==='column'&&plan.value.operation==='rank'&&plan.value.targetColumnId===source.id:plan?.kind==='group-rank'?source.kind!=='column'&&plan.value.group.kind===source.kind&&plan.value.group.value===source.value:false;
 const valid=ready&&!busy&&anchorValid&&matched&&plan?.value.taskId===task.id&&(plan.kind==='physical'||plan.kind==='group-rank')&&plan.value.beforeTaskId===beforeTaskId;
 return <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={close}><div ref={ref} role="dialog" aria-modal="true" aria-label={t('productivityKanbanOrder.dialog')} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4" onClick={e=>e.stopPropagation()}>
  <header className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-100">{t('productivityKanbanOrder.dialog')}</h2><button type="button" disabled={busy} className={button} onClick={close}>{t('common.close')}</button></header>
  <p className="text-sm text-slate-200 break-words">{task.title}</p><p className="text-xs text-slate-400">{t('productivityKanbanOrder.hint')}</p>
  <fieldset disabled={busy||!ready} className="min-w-0"><FancySelect ariaLabel={t('productivityKanbanCreate.before')} value={beforeTaskId??''} onChange={id=>onBefore(id||null)} options={[{value:'',label:t('productivityKanbanCreate.last')},...anchors.map(c=>({value:c.id,label:c.title}))]}/></fieldset>
  {error&&<p role="alert" className="text-xs text-rose-400">{t(error.status===409?'productivityKanbanMove.conflict':'productivityKanbanOrder.failed')}</p>}
  <footer className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={close}>{t('common.cancel')}</button><button type="button" className={button} disabled={!ready||busy||!anchorValid} onClick={onPreview}>{t('productivityKanbanOrder.preview')}</button><button type="button" data-testid="kanban-order-apply" className={button} disabled={!valid} onClick={onApply}>{t('productivityKanbanOrder.apply')}</button></footer>
 </div></div>;
}
