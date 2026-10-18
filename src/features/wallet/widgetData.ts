import {WalletApiError,type WalletApi} from './api.js';
import type { RecordFilter, Period, Money } from './contracts.js';
import type { ReportInput, ReportResult } from './reportContracts.js';
import type { WalletWidgetConfig } from './preferenceContracts.js';
import { supportedWidget } from './preferenceContracts.js';
import { normalizeFilter } from './filter.js';
import { assertPeriod } from './dates.js';
import { minorInteger } from './money.js';
import type { WalletRecordView } from '../../../server/wallet/query.js';
import type { AccessibleWalletAccount } from '../../../server/wallet/access.js';
import type { WalletCreditPosition } from '../../../server/wallet/accounts.js';
export type WidgetData = {
    kind: 'unsupported';
} | {
    kind: 'report';
    report: ReportResult;
    names?: Record<string, string>;
} | {
    kind: 'comparison';
    report: ReportResult;
    previousYear: ReportResult | null;
} | {
    kind: 'nature';
    report: ReportResult;
    groups: {
        nature: string;
        expenseMinor: string;
    }[];
} | {
    kind: 'records';
    items: WalletRecordView[];
    total: number;
} | {
    kind: 'accounts';
    accounts: AccessibleWalletAccount[];
} | {
    kind: 'currencies';
    balances: Money[];
} | {
    kind: 'credit';asOf:string;
    positions: {
        accountId: string;
        name: string;
        credit: WalletCreditPosition;
    }[];
    total: number;
};
type Api = Pick<WalletApi, 'report' | 'query' | 'accounts' | 'catalog' | 'balance'>;
export function comparisonPeriods(period: Period): {
    previous: Period | null;
    previousYear: Period | null;
} {
    assertPeriod(period);
    const start = Date.parse(period.fromDate), end = Date.parse(period.toDateExclusive), from = start - (end - start), iso = (n: number) => new Date(n).toISOString().slice(0, 10), previous = from < Date.parse('1000-01-01') ? null : { ...period, fromDate: iso(from), toDateExclusive: period.fromDate };
    const shift = (raw: string) => {
        const d = new Date(raw + 'T00:00:00.000Z'), month = d.getUTCMonth();
        d.setUTCFullYear(d.getUTCFullYear() - 1);
        if (d.getUTCMonth() !== month)
            d.setUTCDate(0);
        return iso(d.getTime());
    };
    const previousYear = period.fromDate.slice(0, 4) === '1000' ? null : { ...period, fromDate: shift(period.fromDate), toDateExclusive: shift(period.toDateExclusive) };
    if (previousYear) {
        if (previousYear.toDateExclusive <= previousYear.fromDate)
            previousYear.toDateExclusive = iso(Date.parse(previousYear.fromDate) + (end - start));
        assertPeriod(previousYear);
    }
    return { previous, previousYear };
}
/** One loader belongs to one refresh generation of one authenticated session.
 * Its promise coalescing expires with that generation; no report cache survives
 * role/record/quote changes or crosses users. All authority remains in the API. */
export function createWidgetLoader(api: Api, options: {
    date: () => string;
}) {
    const reports = new Map<string, Promise<ReportResult>>(),readAccountIds=new Set<string>();
    let accountRead: ReturnType<Api['accounts']> | null = null, catalogRead: ReturnType<Api['catalog']> | null = null;
    const report = (input: ReportInput) => {
        const key = JSON.stringify(input);
        let pending = reports.get(key);
        if (!pending) {
            pending = api.report(input).then(result=>{for(const id of result.drilldownFilters.total.accountIds??[])readAccountIds.add(id);return result;});
            reports.set(key, pending);
        }
        return pending;
    };
    const accounts = () => accountRead ??= api.accounts(), cohort = (all: AccessibleWalletAccount[], filter: RecordFilter) => all.filter(a => (filter.accountIds === undefined || filter.accountIds.includes(a.id)) && (filter.currencies === undefined || filter.currencies.includes(a.currency)));
    return {async verify(){if(!accountRead&&reports.size===0&&readAccountIds.size===0)return;const fresh=await api.accounts(),ids=new Set(fresh.map(a=>a.id));if([...readAccountIds].some(id=>!ids.has(id))||accountRead&&JSON.stringify(await accountRead)!==JSON.stringify(fresh))throw new WalletApiError(409,'Quyền hoặc tài khoản vừa thay đổi.','CONFLICT',undefined);}, async load(config: WalletWidgetConfig, baseFilter: RecordFilter): Promise<WidgetData> {
            if (!supportedWidget(config.kind))
                return { kind: 'unsupported' };
            const filter = normalizeFilter(config.filter ?? baseFilter), input: ReportInput = { filter, metric: 'incomeExpense', groupBy: 'none', granularity: 'month' };
            if (config.kind === 'recentRecords') {
                const result = await api.query(filter, null, 10);for(const row of result.items)for(const p of row.postings)readAccountIds.add(p.accountId);
                return { kind: 'records', items: result.items, total: result.total };
            }
            if (config.kind === 'accounts')
                return { kind: 'accounts', accounts: cohort(await accounts(), filter) };
            if (config.kind === 'creditUtilization') {
                const visible = cohort(await accounts(), filter).filter(a => a.type === 'credit'), date = options.date(), positions = await Promise.all(visible.slice(0, 10).map(async (a) => {
                    const result = await api.balance(a.id, date);
                    if (!result.credit)
                        throw Error('Credit position unavailable');
                    return { accountId: a.id, name: a.name, credit: result.credit };
                }));
                return { kind: 'credit',asOf:date, positions, total: visible.length };
            }
            if (config.kind === 'currencyBalances') {
                const currencies = [...new Set(cohort(await accounts(), filter).map(a => a.currency))].sort(), balances = await Promise.all(currencies.map(async (currency) => ({ currency, minor: (await report({ ...input, metric: 'balance', filter: { ...filter, currencies: [currency], referenceCurrency: currency } })).totals.valueMinor })));
                return { kind: 'currencies', balances };
            }
            if (config.kind === 'balanceTrend')
                input.metric = 'balance';
            if (config.kind === 'cashflow' || config.kind === 'cashflowTrend')
                input.metric = 'cashflow';
            if (config.kind === 'cashflowTrend')
                input.granularity = 'day';
            if (['expenseStructure', 'expenseNature', 'categorySpend'].includes(config.kind)) {
                input.groupBy = 'category';
                input.filter = { ...filter, kinds: filter.kinds === undefined ? ['expense'] : filter.kinds.filter(kind => kind === 'expense') };
            }
            const current = await report(input);
            if (config.kind === 'periodComparison') {
                const period = comparisonPeriods(filter.period).previousYear;
                return { kind: 'comparison', report: current, previousYear: period ? await report({ ...input, filter: { ...filter, period } }) : null };
            }
            if (config.kind === 'expenseNature') {
                const catalog = await (catalogRead ??= api.catalog()), natures = new Map(catalog.categories.map(c => [c.id, c.nature])), groups = new Map<string, bigint>();
                for (const point of current.series) {
                    const nature = point.groupId === null ? 'unspecified' : natures.get(point.groupId) ?? 'unspecified';
                    groups.set(nature, (groups.get(nature) ?? 0n) + minorInteger(point.expenseMinor));
                }
                return { kind: 'nature', report: current, groups: [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([nature, amount]) => ({ nature, expenseMinor: minorInteger(amount.toString()).toString() })) };
            }
            const names = input.groupBy === 'category' ? Object.fromEntries((await (catalogRead ??= api.catalog())).categories.map(c => [c.id, c.name])) : undefined;
            return { kind: 'report', report: current, ...(names ? { names } : {}) };
        } };
}

export function formatCreditUtilization(value:{numerator:string;denominator:string}|null,locale:string):string|null {
 if(value===null)return null;const n=minorInteger(value.numerator),d=minorInteger(value.denominator);if(n<0n||d<=0n)throw Error('Invalid credit utilization');const hundredths=(n*10000n+d/2n)/d,whole=hundredths/100n,fraction=(hundredths%100n).toString().padStart(2,'0'),decimal=new Intl.NumberFormat(locale,{numberingSystem:'latn'}).formatToParts(1.1).find(p=>p.type==='decimal')?.value??'.';return new Intl.NumberFormat(locale,{numberingSystem:'latn'}).format(whole)+decimal+fraction+'%';
}
