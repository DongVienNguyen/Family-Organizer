import { useCallback, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import { FancySelect } from '../../components/FancySelect.js';
import type { AccountWorkspace, WalletAccountForm } from './accountWorkspace.js';
import type { AccountFormDraft } from './accountDraft.js';
import type { WalletCommandState } from './commandState.js';
const inputClass = 'w-full min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40';
export function AccountForm({ form, workspace, command }: {
    form: WalletAccountForm;
    workspace: AccountWorkspace;
    command: WalletCommandState<unknown>;
}) {
    const { t } = useTranslation(), id = useId(), ref = useRef<HTMLDivElement>(null), close = useCallback(() => { if (['pending', 'unknown'].includes(command.phase))
        workspace.hideForm();
    else
        workspace.cancel(); }, [workspace, command.phase]);
    useModalA11y(true, close, ref);
    const blocked = ['pending', 'unknown', 'conflict'].includes(command.phase), draft = form.draft;
    const change = (patch: Partial<AccountFormDraft>) => workspace.change(patch);
    const select = (key: 'type' | 'currency' | 'accessMode' | 'balanceDisplay', values: string[]) => <FancySelect id={id + '-' + key} ariaLabel={t('wallet.' + key)} value={draft[key]} onChange={value => change({ [key]: value })} options={values.map(value => ({ value, label: key === 'currency' ? value : t(`wallet.${key === 'type' ? 'types' : key === 'accessMode' ? 'access' : 'display'}.${value}`) }))}/>;
    const field = (key: 'name' | 'opening' | 'openingDate' | 'creditLimit' | 'dueDay', type = 'text') => <label className="space-y-1.5 block text-xs text-slate-400" htmlFor={id + '-' + key}>{t('wallet.' + key)}<input id={id + '-' + key} name={key} type={type} inputMode={['opening', 'creditLimit'].includes(key) ? 'decimal' : key === 'dueDay' ? 'numeric' : undefined} value={draft[key]} onChange={event => change({ [key]: event.target.value })} maxLength={key === 'name' ? 500 : 128} className={inputClass + (key === 'name' ? '' : ' font-mono')}/></label>;
    return <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={close}>
  <div role="dialog" aria-modal="true" aria-labelledby={id + '-title'} ref={ref} tabIndex={-1} onClick={event => event.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[90dvh] overflow-y-auto space-y-4 outline-none">
   <h3 id={id + '-title'} className="text-sm font-bold text-slate-100">{t(form.initial ? 'wallet.editAccount' : 'wallet.newAccount')}</h3>
   <form onSubmit={event => { event.preventDefault(); void workspace.save(); }} className="space-y-4">
    <fieldset disabled={blocked} className="space-y-3 disabled:opacity-60">
     {field('name')}
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="text-xs text-slate-400 space-y-1.5">{t('wallet.type')}{select('type', ['cash', 'bank', 'savings', 'credit', 'e_wallet', 'investment', 'asset', 'liability'])}</label>
      <label className="text-xs text-slate-400 space-y-1.5">{t('wallet.currency')}{select('currency', ['VND', 'USD'])}</label>
      {field('opening')}{field('openingDate', 'date')}
     </div>
     <p className="text-xs text-slate-500">{t('wallet.inputLocale', { locale: form.locale })}</p>
     <label className="block text-xs text-slate-400 space-y-1.5">{t('wallet.accessMode')}{select('accessMode', ['shared', 'private'])}</label>
     <label className="flex gap-2 text-xs text-slate-300 items-center"><input type="checkbox" checked={draft.excludedFromStats} onChange={event => change({ excludedFromStats: event.target.checked })}/>{t('wallet.excluded')}</label>
     {draft.type === 'credit' && <div className="space-y-3">{field('creditLimit')}{field('dueDay')}<label className="block text-xs text-slate-400 space-y-1.5">{t('wallet.balanceDisplay')}{select('balanceDisplay', ['book', 'available', 'both'])}</label></div>}
    </fieldset>
    {form.invalid && <p role="alert" className="text-xs text-rose-400">{t('wallet.invalid')}</p>}
    {command.phase === 'conflict' && <p role="alert" className="text-xs text-amber-400">{t('wallet.conflict')}</p>}
    {command.phase === 'unknown' && <p role="alert" className="text-xs text-amber-400">{t('wallet.unknownOutcome')}</p>}
    {command.phase === 'error' && <p role="alert" className="text-xs text-rose-400">{t('wallet.failed')} {command.error?.code}<span className="block font-mono break-all">{command.error?.requestId}</span></p>}
    <div className="flex flex-wrap justify-end gap-2">
     <button type="button" onClick={close} className="bg-slate-800 text-slate-300 rounded-xl px-4 py-2.5 font-bold text-xs cursor-pointer">{t(command.phase === 'pending' || command.phase === 'unknown' ? 'wallet.keepClose' : 'wallet.cancel')}</button>
     {command.phase === 'conflict' ? <button type="button" onClick={() => void workspace.reload()} className="bg-indigo-500 text-white rounded-xl px-4 py-2.5 font-bold text-xs cursor-pointer">{t('wallet.reloadDraft')}</button> : command.phase === 'unknown' ? <button type="button" onClick={() => void workspace.retry()} className="bg-indigo-500 text-white rounded-xl px-4 py-2.5 font-bold text-xs cursor-pointer">{t('wallet.retrySame')}</button> : <button type="submit" disabled={blocked} className="bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl px-4 py-2.5 font-bold text-xs cursor-pointer disabled:opacity-60">{t(command.phase === 'pending' ? 'wallet.saving' : 'wallet.save')}</button>}
    </div>
   </form>
  </div>
 </div>;
}
