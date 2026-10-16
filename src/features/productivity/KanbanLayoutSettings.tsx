import React,{useState}from'react';import {useTranslation}from'react-i18next';
import {KanbanLayoutDialog}from'./KanbanLayoutDialog.js';
import type {createBoardLayoutState,BoardLayoutState}from'./boardLayoutState.js';
export function KanbanLayoutSettings({commands,state,ready,onReload}:{commands:ReturnType<typeof createBoardLayoutState>;state:BoardLayoutState;ready:boolean;onReload():void}){
 const{t}=useTranslation(),[opened,setOpened]=useState(false),[hidden,setHidden]=useState(false);if(!ready)return null;const visible=!hidden&&(opened||state.draft!==null),busy=state.writing||state.previewing||state.loading;
 const close=()=>{if(!state.writing&&!state.locked)commands.cancel();setHidden(true);setOpened(false);};
 return <section className="space-y-2" aria-label={t('productivityKanbanLayout.title')}>
  {state.layout&&<button type="button" className="bg-slate-900 neu-btn rounded-xl px-4 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/40" onClick={()=>{setHidden(false);setOpened(true);}}>{t(state.locked?'productivityKanbanLayout.checkPending':'productivityKanbanLayout.title')}</button>}
  {state.error&&(!visible||!state.layout)&&<><p role="alert" className="text-xs text-rose-400">{t('productivityKanbanLayout.failed')}</p><button type="button" disabled={busy} className="bg-slate-900 neu-btn rounded-xl px-4 py-2.5 text-xs text-slate-200 cursor-pointer disabled:opacity-60" onClick={onReload}>{t('productivityKanbanLayout.reload')}</button></>}
  {visible&&state.layout&&<KanbanLayoutDialog layout={state.layout} draft={state.draft} plan={state.plan} busy={busy} locked={state.locked} error={state.error} ready={ready} onDraft={value=>state.draft?commands.edit(value):commands.open(value)} onPreview={()=>void commands.previewArchive()} onApply={()=>void commands.apply()} onCancel={close} onReload={onReload}/>}
 </section>;
}
