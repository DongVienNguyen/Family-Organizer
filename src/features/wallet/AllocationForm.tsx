import {useCallback,useId,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {AllocationEditor} from './AllocationEditor.js';
import {useModalA11y} from '../../hooks/useModalA11y.js';
import {categorySelectability} from './catalogChoices.js';
import {formatMoney} from './money.js';
import type {RecordWorkspace,RecordWorkspaceState} from './recordWorkspace.js';
const buttonClass='rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60';
export function AllocationForm({workspace,state}:{workspace:RecordWorkspace;state:RecordWorkspaceState}){
 const {t}=useTranslation(),id=useId(),ref=useRef<HTMLDivElement>(null),form=state.allocationForm!,phase=state.command.phase,blocked=['pending','unknown','conflict'].includes(phase),close=useCallback(()=>{if(['pending','unknown'].includes(phase))workspace.hideForm();else workspace.cancel();},[workspace,phase]);useModalA11y(true,close,ref);
 const selectable=categorySelectability(state.catalog.categories),options=state.catalog.categories.filter(row=>selectable(row.id)||form.retainedCategoryIds.includes(row.id)).map(row=>({value:row.id,label:row.name+(!selectable(row.id)?' · '+t('wallet.recordsForm.historical'):'')}));
 return <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={close}><div role="dialog" aria-modal="true" aria-labelledby={id+'-title'} ref={ref} tabIndex={-1} onClick={event=>event.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-5 shadow-2xl max-h-[90dvh] overflow-y-auto space-y-4 outline-none">
  <h3 id={id+'-title'} className="text-sm font-bold text-slate-100">{t('wallet.allocations.title')}</h3><p className="text-xs text-slate-400">{t('wallet.allocations.hint')}</p><p className="font-mono text-xs text-slate-200">{t('wallet.allocations.original')}: {formatMoney({minor:form.postingMinor,currency:form.currency},form.locale)}</p>
  <form onSubmit={event=>{event.preventDefault();void workspace.saveAllocations();}} className="space-y-4"><fieldset disabled={blocked} className="space-y-3 disabled:opacity-60">
   <AllocationEditor rows={form.rows} options={options} onChange={rows=>workspace.changeAllocations(rows)}/>
  </fieldset>
  {form.invalid&&<p role="alert" className="text-xs text-rose-400">{t('wallet.allocations.invalid')}</p>}{phase==='conflict'&&<p role="alert" className="text-xs text-amber-400">{t('wallet.conflict')}</p>}{phase==='unknown'&&<p role="alert" className="text-xs text-amber-400">{t('wallet.unknownOutcome')}</p>}{phase==='error'&&<p role="alert" className="text-xs text-rose-400">{t('wallet.failed')} {state.command.error?.code}</p>}
  <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={close} className={buttonClass+' bg-slate-800 text-slate-300'}>{t(['pending','unknown'].includes(phase)?'wallet.keepClose':'wallet.cancel')}</button>{phase==='conflict'?<button type="button" onClick={()=>void workspace.reloadAllocations()} className={buttonClass+' bg-indigo-500 text-white'}>{t('wallet.reloadDraft')}</button>:phase==='unknown'?<button type="button" onClick={()=>void workspace.retry()} className={buttonClass+' bg-indigo-500 text-white'}>{t('wallet.retrySame')}</button>:<button type="submit" disabled={blocked} className={buttonClass+' bg-indigo-500 text-white'}>{t(phase==='pending'?'wallet.saving':'wallet.save')}</button>}</div>
  </form>
 </div></div>;
}
