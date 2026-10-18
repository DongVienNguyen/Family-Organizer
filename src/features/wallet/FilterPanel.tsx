import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FancySelect } from '../../components/FancySelect.js';
import type { RecordWorkspace, RecordWorkspaceState } from './recordWorkspace.js';
import {recordFilterDraftInput,toggleRecordFacet,presetRecordPeriod,type RecordFacet} from './filterDraft.js';
import { walletLocale, editableAmount } from './accountDraft.js';
const fieldClass = 'w-full min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40';
export function FilterPanel({ workspace, state }: {
    workspace: RecordWorkspace;
    state: RecordWorkspaceState;
}) {
    const { t, i18n } = useTranslation(), locale = walletLocale(i18n.resolvedLanguage ?? i18n.language), [filter, setFilter] = useState(state.filter), [minimum, setMinimum] = useState(''), [maximum, setMaximum] = useState(''), [invalid, setInvalid] = useState(false);
    useEffect(() => { setInvalid(false);setFilter(state.filter); setMinimum(state.filter.absoluteMin === undefined ? '' : editableAmount(state.filter.absoluteMin, state.filter.referenceCurrency, locale)); setMaximum(state.filter.absoluteMax === undefined ? '' : editableAmount(state.filter.absoluteMax, state.filter.referenceCurrency, locale)); }, [state.filter, locale]);
    const blocked = state.phase !== 'ready' || !!state.form || workspace.isBusy();
    function apply() {try{const value=recordFilterDraftInput(filter,minimum,maximum,locale);setInvalid(false);void workspace.applyFilter(value);}catch{setInvalid(true);}}
    const toggle=(key:RecordFacet,id:string,checked:boolean)=>setFilter(value=>{const next=toggleRecordFacet(value,key,id,checked);if(key==='categoryIds')delete next.uncategorized;if(key==='labelIds')delete next.unlabeled;return next;});
    const facets:{key:RecordFacet;choices:{id:string;name:string}[]}[]=[
        {key:'kinds',choices:['income','expense','transfer','adjustment','trade'].map(id=>({id,name:t('wallet.recordKinds.'+id)}))},
        {key:'statuses',choices:['uncleared','cleared','reconciled','voided'].map(id=>({id,name:t('wallet.recordStatuses.'+id)}))},
        {key:'currencies',choices:[...new Set(state.accounts.map(account=>account.currency))].sort().map(id=>({id,name:id}))},
        {key:'creatorIds',choices:state.filterOptions.creators},
        {key:'paymentMethods',choices:state.filterOptions.paymentMethods.map(id=>({id,name:id}))},
    ];
    return <details className="bg-slate-950/40 neu-pressed-sm rounded-xl p-3"><summary className="text-xs font-bold text-slate-200 cursor-pointer">{t('wallet.recordsForm.filters')}</summary><fieldset disabled={blocked} className="space-y-3 mt-3 disabled:opacity-60">
  <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-400">{t('wallet.recordFilters.period')}</span>{(['week','month','year'] as const).map(kind=><button key={kind} type="button" onClick={()=>setFilter(value=>presetRecordPeriod(value,kind,new Date().toISOString()))} className="bg-slate-800 text-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer">{t('wallet.recordFilters.'+kind)}</button>)}<span className="text-xs text-slate-400 font-mono">{filter.period.timezone}</span></div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.fromDate')}<input type="date" value={filter.period.fromDate} onChange={event => setFilter(value => ({ ...value, period: { ...value.period, fromDate: event.target.value } }))} className={fieldClass + ' font-mono'}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.toDateExclusive')}<input type="date" value={filter.period.toDateExclusive} onChange={event => setFilter(value => ({ ...value, period: { ...value.period, toDateExclusive: event.target.value } }))} className={fieldClass + ' font-mono'}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.search')}<input value={filter.query ?? ''} maxLength={500} onChange={event => setFilter(value => ({ ...value, query: event.target.value }))} className={fieldClass}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.transferMode')}<FancySelect ariaLabel={t('wallet.recordsForm.transferMode')} value={filter.transferMode ?? 'include'} options={['include', 'exclude', 'only'].map(value => ({ value, label: t('wallet.transferModes.' + value) }))} onChange={transferMode => setFilter(value => ({ ...value, transferMode: transferMode as any }))}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.minimum')}<input inputMode="decimal" value={minimum} onChange={event => setMinimum(event.target.value)} className={fieldClass + ' font-mono'}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.maximum')}<input inputMode="decimal" value={maximum} onChange={event => setMaximum(event.target.value)} className={fieldClass + ' font-mono'}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.referenceCurrency')}<FancySelect ariaLabel={t('wallet.recordsForm.referenceCurrency')} value={filter.referenceCurrency} options={['VND', 'USD'].map(value => ({ value, label: value }))} onChange={referenceCurrency => { setMinimum(''); setMaximum(''); setFilter(value => ({ ...value, referenceCurrency })); }}/></label>
  </div>
  <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={filter.categoryMatch==='exact'} onChange={event=>setFilter(value=>{const next={...value};if(event.target.checked)next.categoryMatch='exact';else delete next.categoryMatch;return next;})}/>{t('wallet.analytics.categoryExact')}</label>
  <div className="flex flex-wrap gap-3 text-xs text-slate-400">{(['uncategorized','unlabeled'] as const).map(key=><label key={key} className="flex items-center gap-2"><input type="checkbox" checked={!!filter[key]} onChange={event=>setFilter(value=>{const next={...value};if(event.target.checked){next[key]=true;delete next[key==='uncategorized'?'categoryIds':'labelIds'];}else delete next[key];return next;})}/>{t('wallet.analytics.'+key)}</label>)}</div>
  {(['accountIds', 'categoryIds', 'labelIds'] as const).map(key => <fieldset key={key}><legend className="text-xs text-slate-400 mb-2">{t('wallet.recordsForm.' + key)}</legend><div className="flex flex-wrap gap-3">{(key === 'accountIds' ? state.accounts : key === 'categoryIds' ? state.catalog.categories : state.catalog.labels).map(item => <label key={item.id} className="text-xs text-slate-300 inline-flex max-w-full gap-2 items-start"><input type="checkbox" checked={filter[key]?.includes(item.id) ?? false} onChange={event => toggle(key, item.id, event.target.checked)}/><span className="min-w-0 break-words">{item.name}</span></label>)}</div></fieldset>)}
  <label className="block text-xs text-slate-400">{t('wallet.recordFilters.labelMatch')}<FancySelect ariaLabel={t('wallet.recordFilters.labelMatch')} value={filter.labelMatch??'any'} options={['any','all'].map(value=>({value,label:t('wallet.recordFilters.labels'+(value==='any'?'Any':'All'))}))} onChange={labelMatch=>setFilter(value=>({...value,labelMatch:labelMatch as 'any'|'all'}))}/></label>
  {facets.map(({key,choices})=><fieldset key={key}><legend className="text-xs text-slate-400 mb-2">{t('wallet.recordFilters.'+key)}</legend><div className="flex flex-wrap gap-3">{choices.map(item=><label key={item.id} className="text-xs text-slate-300 inline-flex max-w-full gap-2 items-start"><input type="checkbox" checked={(filter[key] as string[]|undefined)?.includes(item.id)??false} onChange={event=>toggle(key,item.id,event.target.checked)}/><span className="min-w-0 break-words">{item.name}</span></label>)}{!choices.length&&<p className="text-xs text-slate-500">{t('wallet.recordFilters.noChoices')}</p>}</div></fieldset>)}
  <p className="text-xs text-slate-400">{t('wallet.recordFilters.allHint')}</p>
  {(invalid || state.filterInvalid) && <p role="alert" className="text-xs text-rose-400">{t('wallet.recordErrors.INVALID_INPUT')}</p>}
  <button type="button" onClick={apply} className="bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer">{t('wallet.recordsForm.applyFilter')}</button>{state.phase==='ready'&&<button type="button" onClick={()=>void workspace.resetFilter()} className="ml-2 bg-slate-800 text-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer">{t('wallet.recordsForm.resetFilter')}</button>}
 </fieldset></details>;
}
