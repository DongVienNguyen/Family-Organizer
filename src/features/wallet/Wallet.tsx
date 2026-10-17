import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw } from 'lucide-react';
import { useConfirm } from '../../components/ConfirmDialog.js';
import { AccountList } from './AccountList.js';
import { AccountDetail } from './AccountDetail.js';
import { AccountForm } from './AccountForm.js';
import { walletLocale } from './accountDraft.js';
import type { AccountWorkspace } from './accountWorkspace.js';
export function Wallet({ workspace }: {
    workspace: AccountWorkspace;
}) {
    const { t, i18n } = useTranslation(), state = useSyncExternalStore(workspace.subscribe, workspace.snapshot), { confirm, ConfirmDialog } = useConfirm();
    useEffect(() => { void workspace.refresh(); }, [workspace]);
    const locked = state.phase !== 'ready' || ['pending', 'unknown'].includes(state.command.phase), locale = walletLocale(i18n.resolvedLanguage ?? i18n.language);
    async function archive(restoring = false) { const account = state.selected?.account; if (!account)
        return; const accepted = await confirm({ title: t(restoring ? 'wallet.restore' : 'wallet.archive'), message: t(restoring ? 'wallet.restoreConfirm' : 'wallet.archiveConfirm', { name: account.name }), tone: restoring ? 'default' : 'danger' }); if (accepted)
        await (restoring ? workspace.restore(account.id, account.revision) : workspace.archive(account.id, account.revision)); }
    if (state.phase === 'inactive' || state.phase === 'disposed')
        return null;
    return <section aria-label={t('wallet.title')} className="bg-slate-900 neu-raised rounded-2xl p-5 space-y-4" data-testid="wallet-workspace">
  <div className="flex items-center justify-between gap-2 flex-wrap">
   <h2 className="text-sm font-bold text-slate-100">{t('wallet.accounts')}</h2>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={state.phase === 'checking' || state.command.phase === 'pending'} aria-label={t('wallet.refresh')} onClick={() => void workspace.refresh()} className="p-2.5 rounded-xl bg-slate-950 neu-btn text-slate-300 cursor-pointer disabled:opacity-60"><RefreshCw className="w-4 h-4"/></button>
    <button type="button" disabled={locked || !!state.form} onClick={() => workspace.openCreate(locale)} className="bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl px-4 py-2.5 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"><Plus className="w-4 h-4"/>{t('wallet.newAccount')}</button>
   </div>
  </div>
  {state.phase === 'checking' && <p role="status" className="text-xs text-slate-400">{t('wallet.loading')}</p>}
  {state.phase === 'error' && <p role="alert" className="text-xs text-rose-400">{t('wallet.loadFailed')} {state.error?.code}</p>}
  {state.command.phase === 'success' && !state.form && <p role="status" className="text-xs text-emerald-400">{t('wallet.saved')}</p>}
  {!state.form && state.command.phase === 'pending' && <p role="status" className="text-xs text-slate-400">{t('wallet.saving')}</p>}
  {!state.form && state.command.phase === 'unknown' && <div className="space-y-2"><p role="alert" className="text-xs text-amber-400">{t('wallet.unknownOutcome')}</p><button type="button" disabled={state.phase !== 'ready'} onClick={() => void workspace.retry()} className="rounded-xl bg-indigo-500 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-60">{t('wallet.retrySame')}</button><button type="button" onClick={() => workspace.resumeForm()} className="rounded-xl bg-slate-800 text-slate-300 px-4 py-2.5 text-xs font-bold">{t('wallet.resumeDraft')}</button></div>}
  {!state.form && ['error', 'conflict'].includes(state.command.phase) && <p role="alert" className="text-xs text-rose-400">{t(state.command.phase === 'conflict' ? 'wallet.conflict' : 'wallet.failed')} {state.command.error?.code}</p>}
  {state.phase === 'ready' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
   <AccountList accounts={state.accounts} selectedId={state.selected?.account.id} onSelect={id => void workspace.select(id)} disabled={locked || !!state.form}/>
   {state.selected && <AccountDetail account={state.selected} balance={state.balance} disabled={locked || !!state.form} onEdit={() => workspace.edit(locale)} onArchive={() => void archive()} onRestore={() => void archive(true)}/>}
  </div>}
  {state.form && <AccountForm form={state.form} workspace={workspace} command={state.command}/>}
  {ConfirmDialog}
 </section>;
}
