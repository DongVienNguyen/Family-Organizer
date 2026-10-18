import type { RecordFilter } from './contracts.js';
import type { ReportInput } from './reportContracts.js';
import { normalizeFilter } from './filter.js';
import { object, keys, text, choice, integer } from '../productivity/validation.js';
export const widgetKinds = ['summary', 'balanceTrend', 'cashflow', 'periodComparison', 'cashflowTrend', 'expenseStructure', 'expenseNature', 'recentRecords', 'accounts', 'currencyBalances', 'categorySpend', 'creditUtilization'] as const;
export type WidgetKind = typeof widgetKinds[number];
export type PreferenceKind = 'filter' | 'chart' | 'layout';
export interface WalletWidgetConfig {
    id: string;
    kind: string;
    width: 1 | 2;
    title: string;
    filter?: RecordFilter;
}
export interface WalletFilterConfig {
    version: 1;
    filter: RecordFilter;
}
export interface WalletChartConfig {
    version: 1;
    input: ReportInput;
    chart: 'line' | 'bar' | 'area';
}
export interface WalletLayoutConfig {
    version: 1;
    baseFilter: RecordFilter;
    widgets: WalletWidgetConfig[];
}
export type PreferenceConfig = WalletFilterConfig | WalletChartConfig | WalletLayoutConfig;
export interface WalletPreference {
    id: string;
    kind: PreferenceKind;
    name: string;
    revision: number;
    archivedAt: string | null;
    config: PreferenceConfig;
}
export interface WalletPreferences {
    filters: WalletPreference[];
    charts: WalletPreference[];
    layout: WalletPreference | null;
}
export interface PreferenceDraft {
    id?: string;
    name?: string;
    config?: PreferenceConfig;
    archived?: boolean;
}
export function normalizePreferenceConfig(kind: PreferenceKind, raw: unknown): PreferenceConfig {
    const v = object(raw);
    if (v.version !== 1 || JSON.stringify(v).length > 131072)
        throw Error('Unsupported preference configuration');
    if (kind === 'filter') {
        keys(v, ['version', 'filter']);
        return { version: 1, filter: normalizeFilter(v.filter) };
    }
    if (kind === 'chart') {
        keys(v, ['version', 'input', 'chart']);
        choice(v.chart, ['line', 'bar', 'area']);
        const input = object(v.input);
        keys(input, ['filter', 'metric', 'groupBy', 'granularity']);
        choice(input.metric, ['incomeExpense', 'balance', 'cashflow', 'cumulativeCashflow']);
        choice(input.groupBy, ['none', 'account', 'category', 'label', 'creator']);
        choice(input.granularity, ['day', 'week', 'month', 'year']);
        return { version: 1, chart: v.chart, input: { filter: normalizeFilter(input.filter), metric: input.metric, groupBy: input.groupBy, granularity: input.granularity } };
    }
    choice(kind, ['layout']);
    keys(v, ['version', 'baseFilter', 'widgets']);
    const baseFilter = normalizeFilter(v.baseFilter);
    if (!Array.isArray(v.widgets) || v.widgets.length > 24)
        throw Error('Invalid widget count');
    const ids = new Set<string>();
    const widgets = v.widgets.map(raw => { const w = object(raw); keys(w, ['id', 'kind', 'width', 'title', 'filter']); text(w.id, 128); text(w.kind, 64); text(w.title, 120, false); if (!/^[A-Za-z0-9_-]+$/.test(w.id) || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(w.kind) || ids.has(w.id))
        throw Error('Invalid widget identity'); ids.add(w.id); integer(w.width, 1, 2); return { id: w.id, kind: w.kind, width: w.width as 1 | 2, title: w.title, ...(w.filter === undefined ? {} : { filter: normalizeFilter(w.filter) }) }; });
    return { version: 1, baseFilter, widgets };
}
export function supportedWidget(kind: string): kind is WidgetKind { return (widgetKinds as readonly string[]).includes(kind); }
