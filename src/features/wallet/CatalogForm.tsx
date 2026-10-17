import {catalogParents} from './catalogChoices.js';
import {useCallback,useId,useRef,useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {FancySelect} from '../../components/FancySelect.js';
import {useModalA11y} from '../../hooks/useModalA11y.js';
import type {CatalogWorkspace,CatalogWorkspaceState,CatalogDraft} from './catalogWorkspace.js';
const inputClass='w-full min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40';
const buttonClass='rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60';
export function CatalogForm({workspace,state}:{workspace:CatalogWorkspace;state:CatalogWorkspaceState}){
 const {t}=useTranslation(),id=useId(),ref=useRef<HTMLDivElement>(null),form=state.form!,phase=state.command.phase,close=useCallback(()=>{if(['pending','unknown'].includes(phase))workspace.hideForm();else workspace.cancel();},[workspace,phase]);
 useModalA11y(true,close,ref);
 const duplicate=state.command.error?.code==='CATALOG_NAME_CONFLICT',blocked=['pending','unknown'].includes(phase)||phase==='conflict'&&!duplicate,draft=form.draft;
 const parents=useMemo(()=>catalogParents(state.catalog!.categories,form.initial?.id),[state.catalog,form.initial?.id]);
 const field=(key:'name'|'icon'|'color')=><div className="space-y-1.5"><label htmlFor={id+'-'+key} className="block text-xs text-slate-400">{t('wallet.catalogForm.'+key)}</label><input id={id+'-'+key} value={draft[key]} maxLength={key==='name'?500:256} onChange={event=>workspace.change({[key]:event.target.value})} className={inputClass}/></div>;
 return <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={close}><div role="dialog" aria-modal="true" aria-labelledby={id+'-title'} ref={ref} tabIndex={-1} onClick={event=>event.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[90dvh] overflow-y-auto space-y-4 outline-none">
  <h3 id={id+'-title'} className="text-sm font-bold text-slate-100">{t('wallet.catalogForm.'+(form.initial?'edit':'new')+(form.kind==='category'?'Category':'Label'))}</h3>
  <form onSubmit={event=>{event.preventDefault();void workspace.save();}} className="space-y-4"><fieldset disabled={blocked} className="space-y-3 disabled:opacity-60">
   {field('name')}
   {form.kind==='category'&&<><div className="space-y-1.5"><label htmlFor={id+'-parent'} className="text-xs text-slate-400">{t('wallet.catalogForm.parent')}</label><FancySelect id={id+'-parent'} ariaLabel={t('wallet.catalogForm.parent')} value={draft.parentId??''} options={[{value:'',label:t('wallet.catalogForm.root')},...parents.map(item=>({value:item.id,label:item.name}))]} onChange={value=>workspace.change({parentId:value||null})}/></div><p className="text-xs text-slate-500">{t('wallet.catalogForm.depthHint')}</p><div className="space-y-1.5"><label htmlFor={id+'-nature'} className="text-xs text-slate-400">{t('wallet.catalogForm.nature')}</label><FancySelect id={id+'-nature'} ariaLabel={t('wallet.catalogForm.nature')} value={draft.nature} options={['must','need','want','unspecified'].map(value=>({value,label:t('wallet.catalogForm.natures.'+value)}))} onChange={value=>workspace.change({nature:value as CatalogDraft['nature']})}/></div></>}
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{field('icon')}{field('color')}</div>
   {(['hidden','archived'] as const).map(key=><label key={key} className="flex gap-2 text-xs text-slate-300 items-center"><input type="checkbox" checked={draft[key]} onChange={event=>workspace.change({[key]:event.target.checked})}/>{t('wallet.catalogForm.'+key)}</label>)}<p className="text-xs text-slate-500">{t('wallet.catalogForm.historyHint')}</p>
  </fieldset>
  {form.invalid&&<p role="alert" className="text-xs text-rose-400">{t('wallet.catalogForm.invalid')}</p>}
  {duplicate&&<p role="alert" className="text-xs text-amber-400">{t('wallet.catalogForm.duplicate')}</p>}
  {phase==='conflict'&&!duplicate&&<p role="alert" className="text-xs text-amber-400">{t('wallet.conflict')}</p>}
  {phase==='unknown'&&<p role="alert" className="text-xs text-amber-400">{t('wallet.unknownOutcome')}</p>}
  {phase==='error'&&<p role="alert" className="text-xs text-rose-400">{t('wallet.failed')} {state.command.error?.code}<span className="block font-mono break-all">{state.command.error?.requestId}</span></p>}
  <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={close} className={buttonClass+' bg-slate-800 text-slate-300'}>{t(['pending','unknown'].includes(phase)?'wallet.keepClose':'wallet.cancel')}</button>{phase==='unknown'?<button type="button" onClick={()=>void workspace.retry()} className={buttonClass+' bg-indigo-500 text-white'}>{t('wallet.retrySame')}</button>:phase==='conflict'&&!duplicate?<button type="button" onClick={()=>void workspace.reload()} className={buttonClass+' bg-indigo-500 text-white'}>{t('wallet.reloadDraft')}</button>:<button type="submit" disabled={blocked} className={buttonClass+' bg-indigo-500 hover:bg-indigo-400 text-white'}>{t(phase==='pending'?'wallet.saving':'wallet.save')}</button>}</div>
  </form>
 </div></div>;
}
