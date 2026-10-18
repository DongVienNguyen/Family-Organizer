import { useCallback, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import type { DashboardWorkspace, DashboardState } from './dashboardWorkspace.js';
export function PreferenceForm({ workspace, state }: {
    workspace: DashboardWorkspace;
    state: DashboardState;
}) {
    const { t } = useTranslation(), id = useId(), ref = useRef<HTMLDivElement>(null), form = state.form!, phase = state.command.phase, close = useCallback(() => { if (['pending', 'unknown'].includes(phase))
        workspace.hideForm();
    else
        workspace.cancelForm(); }, [workspace, phase]);
    useModalA11y(true, close, ref);
    const blocked = ['pending', 'unknown', 'conflict'].includes(phase);
    return <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={close}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} onClick={e => e.stopPropagation()} className="bg-slate-900 neu-raised rounded-2xl p-5 w-full max-w-md max-h-[90dvh] overflow-y-auto outline-none space-y-4">
  <h3 id={id} className="text-sm font-bold text-slate-100">{t('wallet.personal.save' + (form.kind === 'chart' ? 'Chart' : 'Filter'))}</h3>
  <form onSubmit={e => { e.preventDefault(); void workspace.saveForm(); }} className="space-y-4"><label className="block text-xs text-slate-400">{t('wallet.personal.name')}<input value={form.name} maxLength={120} disabled={blocked} onChange={e => workspace.changeName(e.target.value)} className="mt-1 w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40"/></label>
   {form.invalid && <p role="alert" className="text-xs text-rose-400">{t('wallet.personal.invalid')}</p>}{phase === 'unknown' && <p role="alert" className="text-xs text-amber-400">{t('wallet.unknownOutcome')}</p>}{phase === 'conflict' && <p role="alert" className="text-xs text-amber-400">{t('wallet.conflict')}</p>}{phase === 'error' && <p role="alert" className="text-xs text-rose-400">{t('wallet.failed')} {state.command.error?.code}</p>}
   <div className="flex flex-wrap gap-2 justify-end"><button type="button" onClick={close} className="rounded-xl px-4 py-2.5 bg-slate-800 text-slate-300 text-xs font-bold">{t(['pending', 'unknown'].includes(phase) ? 'wallet.keepClose' : 'wallet.cancel')}</button>{phase === 'unknown' ? <button type="button" onClick={() => void workspace.retry()} className="rounded-xl px-4 py-2.5 bg-indigo-500 text-white text-xs font-bold">{t('wallet.retrySame')}</button> : phase === 'conflict' ? <button type="button" onClick={() => void workspace.reloadForm()} className="rounded-xl px-4 py-2.5 bg-indigo-500 text-white text-xs font-bold">{t('wallet.reloadDraft')}</button> : <button type="submit" disabled={blocked} className="rounded-xl px-4 py-2.5 bg-indigo-500 text-white text-xs font-bold disabled:opacity-50">{t(phase === 'pending' ? 'wallet.saving' : 'wallet.save')}</button>}</div>
  </form></div></div>;
}
