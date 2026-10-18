import {Analytics} from './Analytics.js';
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet } from './Wallet.js';
import {Catalog} from './Catalog.js';
import { Records } from './Records.js';
import type { WalletWorkspace } from './useWallet.js';
export function WalletHome({ workspace }: {
    workspace: WalletWorkspace;
}) {
    useSyncExternalStore(workspace.records.subscribe,workspace.records.snapshot);
    const { t } = useTranslation(), state = useSyncExternalStore(workspace.accounts.subscribe, workspace.accounts.snapshot), [tab, setTab] = useState<'accounts' | 'records' | 'catalog' | 'analytics'>('accounts');
    if (['inactive', 'disposed'].includes(state.phase))
        return null;
    return <div className="space-y-4" data-testid="wallet-home"><div className="bg-slate-950 neu-pressed-sm rounded-xl p-1 flex gap-2" role="group" aria-label={t('wallet.title')}>{(['accounts', 'records', 'catalog', 'analytics'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-bold cursor-pointer ${tab === value ? 'bg-slate-900 neu-raised-sm text-sky-400' : 'text-slate-400'}`}>{t(value === 'accounts' ? 'wallet.accounts' : value==='records'?'wallet.recordsForm.title':value==='catalog'?'wallet.catalogForm.tab':'wallet.analytics.title')}</button>)}</div>{tab === 'accounts' ? <Wallet workspace={workspace.accounts}/> : tab==='records'?<Records workspace={workspace.records}/>:tab==='catalog'?<Catalog workspace={workspace.catalog}/>:<Analytics workspace={workspace.analytics} recordFilter={workspace.records.snapshot().filter} groupName={(group,id)=>{const s=workspace.records.snapshot();return (group==='account'?s.accounts:group==='category'?s.catalog.categories:group==='label'?s.catalog.labels:s.filterOptions.creators).find(v=>v.id===id)?.name??t('wallet.analytics.unavailableGroup');}} onDrilldown={async filter=>{const s=workspace.records.snapshot();if(s.phase!=='ready'||s.form||s.allocationForm||workspace.records.isBusy())return false;await workspace.records.applyFilter(filter);if(workspace.records.snapshot().filterInvalid)return false;setTab('records');return true;}}/>}</div>;
}
