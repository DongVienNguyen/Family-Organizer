import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FancySelect } from '../../components/FancySelect.js';
import { useConfirm } from '../../components/ConfirmDialog.js';
import { PreferenceForm } from './PreferenceForm.js';
import type { DashboardWorkspace } from './dashboardWorkspace.js';
import type { WalletChartConfig, WalletFilterConfig, WalletPreference } from './preferenceContracts.js';
import type { RecordFilter } from './contracts.js';
export function SavedPreferences({ workspace, filter, onFilter, onChart }: {
    workspace: DashboardWorkspace;
    filter: RecordFilter;
    onFilter?: (filter: RecordFilter) => Promise<boolean>;
    onChart?: (config: WalletChartConfig) => Promise<boolean>;
}) {
    const { t } = useTranslation(), state = useSyncExternalStore(workspace.subscribe, workspace.snapshot), [selected, setSelected] = useState(''), [blocked, setBlocked] = useState(false), { confirm, ConfirmDialog } = useConfirm();
    if (['unavailable', 'disposed'].includes(state.phase))
        return null;
    const rows = state.preferences ? [...state.preferences.filters, ...state.preferences.charts] : [], current = rows.find(p => p.id === selected), locked = state.phase !== 'ready' || ['pending', 'unknown'].includes(state.command.phase) || !!state.form;
    async function archive(saved: WalletPreference) { if (await confirm({ title: t(saved.archivedAt ? 'wallet.personal.restore' : 'wallet.personal.archive'), message: t('wallet.personal.archiveConfirm'), tone: saved.archivedAt ? 'default' : 'danger' }))
        await workspace.archive(saved, !saved.archivedAt); }
    return <section aria-label={t('wallet.personal.saved')} className="bg-slate-900 neu-raised rounded-2xl p-4 space-y-3"><div className="flex flex-wrap items-end gap-2"><h3 className="text-xs font-bold text-slate-200">{t('wallet.personal.saved')}</h3><button type="button" disabled={locked} onClick={() => workspace.openSave('filter', { version: 1, filter })} className="rounded-xl px-3 py-2.5 bg-slate-950 neu-btn text-slate-300 text-xs disabled:opacity-50">{t('wallet.personal.saveFilter')}</button><fieldset disabled={locked} className="min-w-40 flex-1"><FancySelect ariaLabel={t('wallet.personal.select')} value={current?.id ?? ''} options={[{ value: '', label: t('wallet.personal.select') }, ...rows.map(p => ({ value: p.id, label: p.name + (p.archivedAt ? ' · ' + t('wallet.personal.archived') : '') }))]} onChange={id => { setSelected(id); setBlocked(false); }}/></fieldset>{current && <><button type="button" disabled={locked || !!current.archivedAt || current.kind === 'filter' && !onFilter || current.kind === 'chart' && !onChart} onClick={() => { void (current.kind === 'filter' ? onFilter?.((current.config as WalletFilterConfig).filter) : onChart?.(current.config as WalletChartConfig))?.then(ok => setBlocked(!ok)); }} className="rounded-xl px-3 py-2.5 bg-indigo-500 text-white text-xs disabled:opacity-50">{t('wallet.personal.apply')}</button><button type="button" disabled={locked} onClick={() => workspace.openSave(current.kind, current.config, current)} className="rounded-xl px-3 py-2.5 bg-slate-950 neu-btn text-slate-300 text-xs disabled:opacity-50">{t('wallet.personal.rename')}</button><button type="button" disabled={locked} onClick={() => void archive(current)} className="rounded-xl px-3 py-2.5 bg-slate-950 neu-btn text-slate-300 text-xs disabled:opacity-50">{t(current.archivedAt ? 'wallet.personal.restore' : 'wallet.personal.archive')}</button></>}</div>
 {state.phase === 'checking' && <p role="status" className="text-xs text-slate-400">{t('wallet.loading')}</p>}{state.phase === 'error' && <p role="alert" className="text-xs text-rose-400">{t('wallet.loadFailed')} {state.error?.code}</p>}{blocked && <p role="alert" className="text-xs text-amber-400">{t('wallet.analytics.finishDraft')}</p>}{!state.form && state.command.phase === 'unknown' && <div><p role="alert" className="text-xs text-amber-400">{t('wallet.unknownOutcome')}</p><button type="button" disabled={state.phase !== 'ready'} onClick={() => void workspace.retry()} className="rounded-xl px-3 py-2.5 bg-indigo-500 text-white text-xs disabled:opacity-50">{t('wallet.retrySame')}</button>{workspace.hasForm() && <button type="button" onClick={() => workspace.resumeForm()} className="rounded-xl px-3 py-2.5 bg-slate-950 text-slate-300 text-xs">{t('wallet.resumeDraft')}</button>}</div>}{state.form && <PreferenceForm workspace={workspace} state={state}/>} {ConfirmDialog}
 </section>;
}
