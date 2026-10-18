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
export type WalletTab = 'accounts' | 'records' | 'catalog' | 'analytics' | 'dashboard' | 'imports'|'rules';
export interface WalletWorkspace {
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
    const [owner] = useState(() => { const api = createWalletApi({ request: browserSession.request, authHeaders }), date = () => effectiveDateAt(new Date().toISOString(), 'Asia/Ho_Chi_Minh'), accounts = createAccountWorkspace(api, { date }), records = createRecordWorkspace(api, { actorId: () => currentActor.current, date, timezone: 'Asia/Ho_Chi_Minh' }), catalog = createCatalogWorkspace(api), analytics = createAnalyticsWorkspace(api, { filter: { period: resolvePeriod({ kind: 'month', anchorDate: date() }, 'Asia/Ho_Chi_Minh'), referenceCurrency: 'VND' }, metric: 'incomeExpense', groupBy: 'none', granularity: 'month' }), fileExports=createExportWorkspace(api),rules=createRuleWorkspace(api),imports=createImportWorkspace(api),dashboard = createDashboardWorkspace(api, { defaultFilter: () => ({ period: resolvePeriod({ kind: 'month', anchorDate: date() }, 'Asia/Ho_Chi_Minh'), referenceCurrency: 'VND' }), date }); let view: {
        tab: WalletTab;
        chart: 'line' | 'bar' | 'area';
    } = { tab: 'accounts', chart: 'line' }, retired = false; const listeners = new Set<() => void>(), navigation = { snapshot: () => view, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, set(tab: WalletTab, chart?: 'line' | 'bar' | 'area') { if (retired)
            return; view = { tab, chart: chart ?? view.chart }; for (const fn of listeners)
            fn(); } }; const workspace: WalletWorkspace = { accounts, records, catalog, analytics, dashboard,imports,exports:fileExports,rules, navigation, async openRecords(filter) { const blocked = () => records.isBusy() || !!records.snapshot().form || !!records.snapshot().allocationForm; if (blocked())
            return false; if (records.snapshot().phase !== 'ready')
            await records.refresh(); if (blocked() || records.snapshot().phase !== 'ready')
            return false; await records.applyFilter(filter); if (records.snapshot().phase !== 'ready' || records.snapshot().filterInvalid) {
            await dashboard.refresh();
            return false;
        } navigation.set('records'); return true; }, async openChart(config) { await analytics.apply(config.input); navigation.set('analytics', config.chart); return true; }, async refresh() {fileExports.invalidate(); await Promise.all([accounts.refresh(), records.refresh(), catalog.refresh(), analytics.refresh(), dashboard.refresh(),imports.refresh(),rules.refresh()]); }, dispose() { accounts.dispose(); records.dispose(); catalog.dispose(); analytics.dispose(); dashboard.dispose();imports.dispose();fileExports.dispose();rules.dispose(); retired = true; listeners.clear(); } }; return { session: browserSession.snapshot(), workspace }; });
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
    return owner.workspace;
}
