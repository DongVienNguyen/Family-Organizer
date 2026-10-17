import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet } from './Wallet.js';
import { Records } from './Records.js';
import type { WalletWorkspace } from './useWallet.js';
export function WalletHome({ workspace }: {
    workspace: WalletWorkspace;
}) {
    const { t } = useTranslation(), state = useSyncExternalStore(workspace.accounts.subscribe, workspace.accounts.snapshot), [tab, setTab] = useState<'accounts' | 'records'>('accounts');
    if (['inactive', 'disposed'].includes(state.phase))
        return null;
    return <div className="space-y-4" data-testid="wallet-home"><div className="bg-slate-950 neu-pressed-sm rounded-xl p-1 flex gap-2" role="group" aria-label={t('wallet.title')}>{(['accounts', 'records'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer ${tab === value ? 'bg-slate-900 neu-raised-sm text-sky-400' : 'text-slate-400'}`}>{t(value === 'accounts' ? 'wallet.accounts' : 'wallet.recordsForm.title')}</button>)}</div>{tab === 'accounts' ? <Wallet workspace={workspace.accounts}/> : <Records workspace={workspace.records}/>}</div>;
}
