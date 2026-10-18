import {WalletSettings} from './WalletSettings.js';
import {WalletPresentation} from './WalletPresentation.js';
import {Portfolio} from './Portfolio.js';
import {BudgetPlanning} from './BudgetPlanning.js';
import {FinancialLinks} from './FinancialLinks.js';
import {Planning} from './Planning.js';
import {Rules} from './Rules.js';
import {ImportWizard} from './ImportWizard.js';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Analytics } from './Analytics.js';
import { WalletDashboard } from './Dashboard.js';
import { SavedPreferences } from './SavedPreferences.js';
import { Wallet } from './Wallet.js';
import { Catalog } from './Catalog.js';
import { Records } from './Records.js';
import type { WalletWorkspace, WalletTab } from './useWallet.js';
export function WalletHome({workspace}:{workspace:WalletWorkspace}){return <WalletPresentation workspace={workspace.settings}><WalletHomeContent workspace={workspace}/></WalletPresentation>;}
function WalletHomeContent({ workspace }: {
    workspace: WalletWorkspace;
}) {
    const { t } = useTranslation(), records = useSyncExternalStore(workspace.records.subscribe, workspace.records.snapshot), accounts = useSyncExternalStore(workspace.accounts.subscribe, workspace.accounts.snapshot), view = useSyncExternalStore(workspace.navigation.subscribe, workspace.navigation.snapshot), analytics = useSyncExternalStore(workspace.analytics.subscribe, workspace.analytics.snapshot), personal = useSyncExternalStore(workspace.dashboard.subscribe, workspace.dashboard.snapshot);
    if (['inactive', 'disposed'].includes(accounts.phase))
        return null;
    const tab = view.tab, tabs: WalletTab[] = ['accounts', 'records', 'catalog', 'analytics','imports','rules','planning','portfolio','settings', ...(personal.phase === 'unavailable' ? [] : ['dashboard' as const])], label = (v: WalletTab) => t(v === 'accounts' ? 'wallet.accounts' : v === 'records' ? 'wallet.recordsForm.title' : v === 'catalog' ? 'wallet.catalogForm.tab' : v==='imports'?'wallet.imports.title':v==='rules'?'wallet.rulesForm.title':v==='planning'?'wallet.planning.title':v==='portfolio'?'wallet.portfolio.title':v==='settings'?'wallet.settings.title':v === 'analytics' ? 'wallet.analytics.title' : 'wallet.personal.title'), filter = tab === 'analytics' ? analytics.input.filter : records.filter;
    return <div className="space-y-4" data-testid="wallet-home"><div className="bg-slate-950 neu-pressed-sm rounded-xl p-1 flex gap-2 overflow-x-auto" role="group" aria-label={t('wallet.title')}>{tabs.map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => workspace.navigation.set(value)} className={'flex-1 shrink-0 rounded-xl px-2 py-2.5 text-xs font-bold cursor-pointer ' + (tab === value ? 'bg-slate-900 neu-raised-sm text-sky-400' : 'text-slate-400')}>{label(value)}</button>)}</div>
 {tab==='settings'?<WalletSettings workspace={workspace.settings} onApplyPeriod={()=>void workspace.applyDefaultPeriod()}/>:tab === 'accounts' ? <Wallet workspace={workspace.accounts}/> : tab === 'records' ? <Records workspace={workspace.records} exporter={workspace.exports}/> : tab === 'catalog' ? <Catalog workspace={workspace.catalog}/> : tab === 'dashboard' ? <WalletDashboard embedded workspace={workspace.dashboard} filter={records.filter} onDrilldown={workspace.openRecords} onAccounts={() => workspace.navigation.set('accounts')}/> :tab==='portfolio'?<Portfolio workspace={workspace.portfolio} onAccounts={()=>workspace.navigation.set('accounts')}/>:tab==='planning'?<><Planning workspace={workspace.planning}/><BudgetPlanning workspace={workspace.budgets}/><FinancialLinks workspace={workspace.financial}/></>:tab==='rules'?<Rules workspace={workspace.rules} filter={records.filter}/>:tab==='imports'?<ImportWizard workspace={workspace.imports}/> : <Analytics workspace={workspace.analytics} recordFilter={records.filter} chartKind={view.chart} onSaveChart={personal.phase === 'ready' ? config => workspace.dashboard.openSave('chart', config) : undefined} groupName={(group, id) => (group === 'account' ? records.accounts : group === 'category' ? records.catalog.categories : group === 'label' ? records.catalog.labels : records.filterOptions.creators).find(v => v.id === id)?.name ?? t('wallet.analytics.unavailableGroup')} onDrilldown={workspace.openRecords}/>}
 <SavedPreferences workspace={workspace.dashboard} filter={filter} onFilter={value => tab === 'analytics' ? workspace.analytics.apply({ ...analytics.input, filter: value }).then(() => true) : workspace.openRecords(value)} onChart={workspace.openChart}/>
 </div>;
}
