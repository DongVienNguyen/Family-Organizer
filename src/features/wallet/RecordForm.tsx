import {categorySelectability} from './catalogChoices.js';
import { useCallback, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FancySelect } from '../../components/FancySelect.js';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import type { RecordWorkspace, RecordWorkspaceState } from './recordWorkspace.js';
import type { RecordFormDraft } from './recordDraft.js';
const inputClass = 'w-full min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40';
export function RecordForm({ workspace, state }: {
    workspace: RecordWorkspace;
    state: RecordWorkspaceState;
}) {
    const { t } = useTranslation(), id = useId(), ref = useRef<HTMLDivElement>(null), phase = state.command.phase;
    const close = useCallback(() => { if (['pending', 'unknown'].includes(phase))
        workspace.hideForm();
    else
        workspace.cancel(); }, [workspace, phase]);
    useModalA11y(true, close, ref);
    const form = state.form!, draft = form.draft, blocked = ['pending', 'unknown', 'conflict'].includes(phase), initial = form.initial?.detail;
    const change = (patch: Partial<RecordFormDraft>) => workspace.change(patch);
    const input = (key: keyof RecordFormDraft, type = 'text', label = 'wallet.recordsForm.' + key) => <label htmlFor={id + '-' + key} className="text-xs text-slate-400 space-y-1.5 block">{t(label)}<input id={id + '-' + key} type={type} step={type === 'datetime-local' ? '0.001' : undefined} inputMode={['amount', 'debit', 'credit', 'feeAmount'].includes(key) ? 'decimal' : undefined} maxLength={key === 'note' || key === 'feeNote' ? 100000 : 500} value={String(draft[key])} onChange={event => change({ [key]: event.target.value })} className={inputClass + (['amount', 'debit', 'credit', 'feeAmount', 'effectiveDate', 'occurredLocal'].includes(key) ? ' font-mono' : '')}/></label>;
    const choices = (key: keyof RecordFormDraft, values: {
        value: string;
        label: string;
    }[], label = 'wallet.recordsForm.' + key) => <label className="text-xs text-slate-400 space-y-1.5 block">{t(label)}<FancySelect id={id + '-' + key} ariaLabel={t(label)} value={String(draft[key])} options={values} onChange={value => change({ [key]: value })}/></label>;
    const accountOptions = state.accounts.filter(account => account.permission !== 'read' && (account.archivedAt === null || initial?.postings.some(p => p.accountId === account.id) || form.initial?.fee?.postings.some(p => p.accountId === account.id))).map(account => ({ value: account.id, label: account.name + ' · ' + account.currency + (account.archivedAt ? ' · ' + t('wallet.archived') : '') }));
    const accountChoices = (key: 'accountId' | 'fromAccountId' | 'toAccountId' | 'feeAccountId', external = false) => choices(key, [...(external ? [{ value: '', label: t('wallet.recordsForm.outside') }] : []), ...accountOptions]);
    const visibleCategory=categorySelectability(state.catalog.categories);
    const categoryOptions = [{ value: '', label: t('wallet.recordsForm.uncategorized') }, ...state.catalog.categories.filter(category => visibleCategory(category.id) || category.id === initial?.record.categoryId || category.id === form.initial?.fee?.record.categoryId).map(category => ({ value: category.id, label: category.name + (!visibleCategory(category.id) ? ' · ' + t('wallet.recordsForm.historical') : '') }))];
    const currency = (accountId: string) => state.accounts.find(account => account.id === accountId)?.currency ?? draft.externalCurrency;
    return <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={close}>
  <div role="dialog" aria-modal="true" aria-labelledby={id + '-title'} ref={ref} tabIndex={-1} onClick={event => event.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-5 shadow-2xl max-h-[90dvh] overflow-y-auto space-y-4 outline-none">
   <h3 id={id + '-title'} className="text-sm font-bold text-slate-100">{t(initial ? 'wallet.recordsForm.edit' : 'wallet.recordsForm.create')}</h3>
   <form onSubmit={event => { event.preventDefault(); void workspace.save(); }} className="space-y-4">
    <fieldset disabled={blocked} className="space-y-3 disabled:opacity-60">
     {choices('kind', (initial?.record.kind === 'transfer' ? ['transfer'] : initial ? ['income', 'expense', 'adjustment'] : ['income', 'expense', 'transfer', 'adjustment']).map(value => ({ value, label: t('wallet.recordKinds.' + value) })))}
     {draft.kind === 'transfer' ? <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{accountChoices('fromAccountId', true)}{accountChoices('toAccountId', true)}{input('debit')}{input('credit')}</div>
      <p className="font-mono text-xs text-slate-400">{t('wallet.recordsForm.fromCurrency')}: {currency(draft.fromAccountId)} → {t('wallet.recordsForm.toCurrency')}: {currency(draft.toAccountId)}</p>
      {(!draft.fromAccountId || !draft.toAccountId) && choices('externalCurrency', ['VND', 'USD'].map(value => ({ value, label: value })))}
      {currency(draft.fromAccountId) !== currency(draft.toAccountId) && <><p className="text-xs text-slate-500">{t('wallet.recordsForm.impliedFx')}</p>{input('fxAsOf', 'date')}</>}
      <label className="flex gap-2 text-xs text-slate-300 items-center"><input type="checkbox" checked={draft.feeEnabled} onChange={event => change({ feeEnabled: event.target.checked })}/>{t('wallet.recordsForm.feeEnabled')}</label>
      {draft.feeEnabled && <div className="space-y-3 bg-slate-950/40 rounded-xl p-3">{accountChoices('feeAccountId')}{input('feeAmount')}{input('feeNote')}{choices('feeCategoryId', categoryOptions)}</div>}
     </div> : <div className="space-y-3">{accountChoices('accountId')}{input('amount')}<p className="font-mono text-xs text-slate-400">{currency(draft.accountId)}</p></div>}
     <p className="text-xs text-slate-500">{t('wallet.recordsForm.inputLocale', { locale: draft.locale })}</p>
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{input('effectiveDate', 'date')}{choices('settlementStatus', ['uncleared', 'cleared', 'reconciled'].map(value => ({ value, label: t('wallet.recordStatuses.' + value) })))}{input('occurredLocal', 'datetime-local')}{input('timezone')}{choices('timeChoice', ['', 'earlier', 'later'].map(value => ({ value, label: t('wallet.timeChoices.' + (value || 'none')) })))}</div>
     <p className="text-xs text-slate-500">{t('wallet.recordsForm.timeHint')}</p>
     {choices('categoryId', categoryOptions)}
     <fieldset className="space-y-2"><legend className="text-xs text-slate-400">{t('wallet.recordsForm.labels')}</legend><div className="flex flex-wrap gap-3">{state.catalog.labels.filter(label => !label.hidden && label.archivedAt === null || initial?.labelIds.includes(label.id)).map(label => <label key={label.id} className="text-xs text-slate-300 flex gap-2 items-center"><input type="checkbox" checked={draft.labelIds.includes(label.id)} onChange={event => change({ labelIds: event.target.checked ? [...draft.labelIds, label.id] : draft.labelIds.filter(id => id !== label.id) })}/>{label.name}</label>)}</div></fieldset>
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{input('payee')}{input('paymentMethod')}</div>
     <div className="block space-y-1.5 text-xs text-slate-400"><label htmlFor={id + '-note'}>{t('wallet.recordsForm.note')}</label><textarea id={id + '-note'} rows={3} maxLength={100000} value={draft.note} onChange={event => change({ note: event.target.value })} className={inputClass}/></div>
     <label className="flex gap-2 text-xs text-slate-300 items-center"><input type="checkbox" checked={draft.reviewed} onChange={event => change({ reviewed: event.target.checked })}/>{t('wallet.recordsForm.reviewed')}</label>
    </fieldset>
    {form.invalid && <p role="alert" className="text-xs text-rose-400">{t('wallet.recordErrors.' + form.invalid)}</p>}
    {['unknown', 'conflict', 'error'].includes(phase) && <p role="alert" className="text-xs text-amber-400">{t(phase === 'unknown' ? 'wallet.unknownOutcome' : phase === 'conflict' ? 'wallet.recordsForm.conflict' : 'wallet.failed')} <span className="font-mono">{state.command.error?.requestId}</span></p>}
    <div className="flex flex-wrap justify-end gap-2">
     <button type="button" onClick={close} className="rounded-xl px-4 py-2.5 bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer">{t(['pending', 'unknown'].includes(phase) ? 'wallet.keepClose' : 'wallet.cancel')}</button>
     {phase === 'unknown' ? <button type="button" onClick={() => void workspace.retry()} className="bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer">{t('wallet.retrySame')}</button> : phase === 'conflict' ? <button type="button" onClick={() => void workspace.reload()} className="bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer">{t('wallet.reloadDraft')}</button> : <>
      {!initial && <button type="button" disabled={blocked} onClick={() => void workspace.save(true)} className="bg-slate-800 text-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60">{t('wallet.recordsForm.saveAnother')}</button>}
      <button type="submit" disabled={blocked} className="bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60">{t(phase === 'pending' ? 'wallet.saving' : 'wallet.save')}</button>
     </>}
    </div>
   </form>
  </div>
 </div>;
}
