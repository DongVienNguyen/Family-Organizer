import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FancySelect } from '../../components/FancySelect.js';
import type { RecordWorkspace, RecordWorkspaceState } from './recordWorkspace.js';
import { parseMoney } from './money.js';
import { walletLocale, editableAmount } from './accountDraft.js';
const fieldClass = 'w-full min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40';
export function FilterPanel({ workspace, state }: {
    workspace: RecordWorkspace;
    state: RecordWorkspaceState;
}) {
    const { t, i18n } = useTranslation(), locale = walletLocale(i18n.resolvedLanguage ?? i18n.language), [filter, setFilter] = useState(state.filter), [minimum, setMinimum] = useState(''), [maximum, setMaximum] = useState(''), [invalid, setInvalid] = useState(false);
    useEffect(() => { setFilter(state.filter); setMinimum(state.filter.absoluteMin === undefined ? '' : editableAmount(state.filter.absoluteMin, state.filter.referenceCurrency, locale)); setMaximum(state.filter.absoluteMax === undefined ? '' : editableAmount(state.filter.absoluteMax, state.filter.referenceCurrency, locale)); }, [state.filter, locale]);
    const blocked = state.phase !== 'ready' || !!state.form || ['pending', 'unknown'].includes(state.command.phase);
    function apply() { try {
        const value = { ...filter };
        delete value.absoluteMin;
        delete value.absoluteMax;
        if (minimum !== '')
            value.absoluteMin = parseMoney(minimum, value.referenceCurrency, locale).minor;
        if (maximum !== '')
            value.absoluteMax = parseMoney(maximum, value.referenceCurrency, locale).minor;
        setInvalid(false);
        void workspace.applyFilter(value);
    }
    catch {
        setInvalid(true);
    } }
    const toggle = (key: 'accountIds' | 'categoryIds' | 'labelIds', id: string, checked: boolean) => setFilter(value => { const selected = checked ? [...(value[key] ?? []), id] : (value[key] ?? []).filter(item => item !== id); return { ...value, [key]: selected.length ? selected : undefined }; });
    return <details className="bg-slate-950/40 neu-pressed-sm rounded-xl p-3"><summary className="text-xs font-bold text-slate-200 cursor-pointer">{t('wallet.recordsForm.filters')}</summary><fieldset disabled={blocked} className="space-y-3 mt-3 disabled:opacity-60">
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.fromDate')}<input type="date" value={filter.period.fromDate} onChange={event => setFilter(value => ({ ...value, period: { ...value.period, fromDate: event.target.value } }))} className={fieldClass + ' font-mono'}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.toDateExclusive')}<input type="date" value={filter.period.toDateExclusive} onChange={event => setFilter(value => ({ ...value, period: { ...value.period, toDateExclusive: event.target.value } }))} className={fieldClass + ' font-mono'}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.search')}<input value={filter.query ?? ''} maxLength={500} onChange={event => setFilter(value => ({ ...value, query: event.target.value }))} className={fieldClass}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.transferMode')}<FancySelect ariaLabel={t('wallet.recordsForm.transferMode')} value={filter.transferMode ?? 'include'} options={['include', 'exclude', 'only'].map(value => ({ value, label: t('wallet.transferModes.' + value) }))} onChange={transferMode => setFilter(value => ({ ...value, transferMode: transferMode as any }))}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.minimum')}<input inputMode="decimal" value={minimum} onChange={event => setMinimum(event.target.value)} className={fieldClass + ' font-mono'}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.maximum')}<input inputMode="decimal" value={maximum} onChange={event => setMaximum(event.target.value)} className={fieldClass + ' font-mono'}/></label>
   <label className="text-xs text-slate-400">{t('wallet.recordsForm.referenceCurrency')}<FancySelect ariaLabel={t('wallet.recordsForm.referenceCurrency')} value={filter.referenceCurrency} options={['VND', 'USD'].map(value => ({ value, label: value }))} onChange={referenceCurrency => { setMinimum(''); setMaximum(''); setFilter(value => ({ ...value, referenceCurrency })); }}/></label>
  </div>
  {(['accountIds', 'categoryIds', 'labelIds'] as const).map(key => <fieldset key={key}><legend className="text-xs text-slate-400 mb-2">{t('wallet.recordsForm.' + key)}</legend><div className="flex flex-wrap gap-3">{(key === 'accountIds' ? state.accounts : key === 'categoryIds' ? state.catalog.categories : state.catalog.labels).map(item => <label key={item.id} className="text-xs text-slate-300 flex gap-2 items-center"><input type="checkbox" checked={filter[key]?.includes(item.id) ?? false} onChange={event => toggle(key, item.id, event.target.checked)}/>{item.name}</label>)}</div></fieldset>)}
  {(invalid || state.filterInvalid) && <p role="alert" className="text-xs text-rose-400">{t('wallet.recordErrors.INVALID_INPUT')}</p>}
  <button type="button" onClick={apply} className="bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer">{t('wallet.recordsForm.applyFilter')}</button>
 </fieldset></details>;
}
