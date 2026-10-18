import {createWalletSettingsWorkspace,type WalletSettingsWorkspace} from './settingsWorkspace.js';
import {createWalletIdleSession} from './idleSession.js';
import {endClientSession} from '../../utils/clientSession.js';
import {createPortfolioWorkspace,type PortfolioWorkspace} from './portfolioWorkspace.js';
import {createBudgetWorkspace,type BudgetWorkspace} from './budgetWorkspace.js';
import {createFinancialWorkspace,type FinancialWorkspace} from './financialWorkspace.js';
import {createPlanningWorkspace,type PlanningWorkspace} from './planningWorkspace.js';
import {createRuleWorkspace,type RuleWorkspace} from './ruleWorkspace.js';
import {createExportWorkspace,type ExportWorkspace} from './exportWorkspace.js';
import {createImportWorkspace,type ImportWorkspace} from './importWorkspace.js';
import { createDashboardWorkspace, type DashboardWorkspace } from './dashboardWorkspace.js';
import type { RecordFilter } from './contracts.js';
import type { WalletChartConfig } from './preferenceContracts.js';
import { createAnalyticsWorkspace, type AnalyticsWorkspace } from './analyticsWorkspace.js';
import { resolvePeriod } from './dates.js';
import { useEffect, useState, useRef } from 'react';
import { browserSession } from '../../utils/browserSession.js';
import { createWalletApi } from './api.js';
import { createAccountWorkspace } from './accountWorkspace.js';
import { effectiveDateAt } from './dates.js';
import { createCatalogWorkspace, type CatalogWorkspace } from './catalogWorkspace.js';
import { createRecordWorkspace } from './recordWorkspace.js';
import type { AccountWorkspace } from './accountWorkspace.js';
import type { RecordWorkspace } from './recordWorkspace.js';
export type WalletTab = 'accounts' | 'records' | 'catalog' | 'analytics' | 'dashboard' | 'imports'|'rules'|'planning'|'portfolio'|'settings';
export interface WalletWorkspace {
    settings:WalletSettingsWorkspace;
    applyDefaultPeriod:()=>Promise<void>;
    portfolio:PortfolioWorkspace;
    budgets:BudgetWorkspace;
    financial:FinancialWorkspace;
    openFinancial:(kind:'debt'|'goal',id:string,locale:string,linkId?:string)=>Promise<void>;
    planning:PlanningWorkspace;
    rules:RuleWorkspace;
    exports:ExportWorkspace;
    imports:ImportWorkspace;
    dashboard: DashboardWorkspace;
    navigation: {
        snapshot: () => {
            tab: WalletTab;
            chart: 'line' | 'bar' | 'area';
        };
        subscribe: (fn: () => void) => () => void;
        set: (tab: WalletTab, chart?: 'line' | 'bar' | 'area') => void;
    };
    openRecords: (filter: RecordFilter) => Promise<boolean>;
    openChart: (config: WalletChartConfig) => Promise<boolean>;
    accounts: AccountWorkspace;
    records: RecordWorkspace;
    catalog: CatalogWorkspace;
    analytics: AnalyticsWorkspace;
    refresh: () => Promise<void>;
    dispose: () => void;
}
/** App is keyed by BrowserSessionRoot's revision. StrictMode may replay effects,
 * so the resource is retired by the actual session boundary, not effect cleanup. */
export function useWallet(authHeaders: () => HeadersInit, actorId?: string) {
    const currentActor = useRef(actorId ?? '');
    currentActor.current = actorId ?? '';
    const [owner] = useState(() => { const api = createWalletApi({ request: browserSession.request, authHeaders }), settings=createWalletSettingsWorkspace(api),defaultPeriod=()=>settings.snapshot().value?.settings.defaultPeriod??'month',date = () => effectiveDateAt(new Date().toISOString(), 'Asia/Ho_Chi_Minh'), accounts = createAccountWorkspace(api, { date }), records = createRecordWorkspace(api, { actorId: () => currentActor.current,defaultPeriod, date, timezone: 'Asia/Ho_Chi_Minh' }), catalog = createCatalogWorkspace(api), analytics = createAnalyticsWorkspace(api, { filter: { period: resolvePeriod({ kind: defaultPeriod(), anchorDate: date() }, 'Asia/Ho_Chi_Minh'), referenceCurrency: 'VND' }, metric: 'incomeExpense', groupBy: 'none', granularity: 'month' }), portfolio=createPortfolioWorkspace(api,{date,timezone:'Asia/Ho_Chi_Minh',actorId:()=>currentActor.current}),budgets=createBudgetWorkspace(api,{date,timezone:'Asia/Ho_Chi_Minh'}),financial=createFinancialWorkspace(api,{date,timezone:'Asia/Ho_Chi_Minh'}),planning=createPlanningWorkspace(api,{date,timezone:'Asia/Ho_Chi_Minh'}),fileExports=createExportWorkspace(api),rules=createRuleWorkspace(api),imports=createImportWorkspace(api),dashboard = createDashboardWorkspace(api, { defaultFilter: () => ({ period: resolvePeriod({ kind: defaultPeriod(), anchorDate: date() }, 'Asia/Ho_Chi_Minh'), referenceCurrency: 'VND' }), date }); let view: {
        tab: WalletTab;
        chart: 'line' | 'bar' | 'area';
    } = { tab: 'accounts', chart: 'line' }, retired = false; const listeners = new Set<() => void>(), navigation = { snapshot: () => view, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, set(tab: WalletTab, chart?: 'line' | 'bar' | 'area') { if (retired)
            return; view = { tab, chart: chart ?? view.chart }; for (const fn of listeners)
            fn(); } }; const workspace: WalletWorkspace = {settings,async applyDefaultPeriod(){if(settings.snapshot().dirty||!settings.snapshot().value)return;if(records.isBusy()||records.snapshot().form||records.snapshot().allocationForm)return;await records.resetFilter();const input=analytics.snapshot().input;await analytics.apply({...input,filter:{...input.filter,period:resolvePeriod({kind:defaultPeriod(),anchorDate:date()},'Asia/Ho_Chi_Minh')}});navigation.set('records');}, portfolio,budgets,financial,async openFinancial(kind,id,locale,linkId){await financial.open(kind,id,locale,linkId);navigation.set('planning');},planning,accounts, records, catalog, analytics, dashboard,imports,exports:fileExports,rules, navigation, async openRecords(filter) { const blocked = () => records.isBusy() || !!records.snapshot().form || !!records.snapshot().allocationForm; if (blocked())
            return false; if (records.snapshot().phase !== 'ready')
            await records.refresh(); if (blocked() || records.snapshot().phase !== 'ready')
            return false; await records.applyFilter(filter); if (records.snapshot().phase !== 'ready' || records.snapshot().filterInvalid) {
            await dashboard.refresh();
            return false;
        } navigation.set('records'); return true; }, async openChart(config) { await analytics.apply(config.input); navigation.set('analytics', config.chart); return true; }, async refresh() {fileExports.invalidate(); await Promise.all([accounts.refresh(), records.refresh(), catalog.refresh(), analytics.refresh(), dashboard.refresh(),imports.refresh(),rules.refresh(),planning.refresh(),financial.refresh(),budgets.refresh(),portfolio.refresh()]); }, dispose() { settings.dispose();accounts.dispose(); records.dispose(); catalog.dispose(); analytics.dispose(); dashboard.dispose();imports.dispose();fileExports.dispose();rules.dispose();planning.dispose();financial.dispose();budgets.dispose();portfolio.dispose(); retired = true; listeners.clear(); } }; return { session: browserSession.snapshot(), workspace }; });
    useEffect(() => {
        const changed = () => {
            const current = browserSession.snapshot();
            if (current.status !== 'ready' || current.revision !== owner.session.revision || current.token !== owner.session.token)
                owner.workspace.dispose();
        };
        const unsubscribe = browserSession.subscribe(changed);
        changed();
        void owner.workspace.dashboard.refresh();
        const focus = () => {
            if (owner.workspace.accounts.snapshot().phase !== 'checking' && owner.workspace.accounts.snapshot().phase !== 'disposed')
                void owner.workspace.refresh();
        };
        window.addEventListener('focus', focus);
        return () => { unsubscribe(); window.removeEventListener('focus', focus); };
    }, [owner]);
    useEffect(()=>{if(!actorId)return;let idle:ReturnType<typeof createWalletIdleSession<ReturnType<typeof setTimeout>>>|undefined,lastPolicy:string|null=null,retired=false;
        const sync=()=>{const current=owner.workspace.settings.snapshot();if(retired||current.phase==='disposed'){idle?.dispose();return;}if(current.phase==='ready'&&current.value){owner.workspace.records.initializeDefaultPeriod();owner.workspace.analytics.initializeDefaultPeriod(resolvePeriod({kind:current.value.settings.defaultPeriod,anchorDate:effectiveDateAt(new Date().toISOString(),'Asia/Ho_Chi_Minh')},'Asia/Ho_Chi_Minh'));const policy=String(current.value.settings.sessionIdleMinutes);if(policy!==lastPolicy){idle?.dispose();idle=createWalletIdleSession({now:()=>Date.now(),setTimer:(fn,delay)=>setTimeout(fn,delay),clearTimer:id=>clearTimeout(id),expire:()=>{const token=browserSession.snapshot().token;void endClientSession(token,()=>{void browserSession.change(null).catch(()=>{});});}});idle.start(current.value.settings.sessionIdleMinutes);lastPolicy=policy;}}};
        const unsubscribe=owner.workspace.settings.subscribe(sync),activity=(event:Event)=>{if(event.isTrusted)idle?.activity();},check=()=>idle?.check();
        for(const event of ['pointerdown','keydown','wheel','touchstart'])window.addEventListener(event,activity,{passive:true});document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);void owner.workspace.settings.refresh().then(sync);
        return()=>{retired=true;unsubscribe();idle?.dispose();for(const event of ['pointerdown','keydown','wheel','touchstart'])window.removeEventListener(event,activity);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);};
    },[owner,actorId]);
    return owner.workspace;
}
