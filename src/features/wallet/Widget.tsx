import {formatCreditUtilization} from './widgetData.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WalletWidgetConfig } from './preferenceContracts.js';
import type { WidgetData } from './widgetData.js';
import type { RecordFilter } from './contracts.js';
import { formatMoney } from './money.js';
import { walletLocale } from './accountDraft.js';
import { Charts } from './Charts.js';
export function Widget({ config, data, loading, error, filter, onDrilldown, onAccounts }: {
    config: WalletWidgetConfig;
    data: WidgetData | null;
    loading: boolean;
    error?: string;
    filter: RecordFilter;
    onDrilldown: (filter: RecordFilter) => Promise<boolean>;
    onAccounts: () => void;
}) {
    const { t, i18n } = useTranslation(), locale = walletLocale(i18n.resolvedLanguage ?? i18n.language), [page, setPage] = useState(0), [blocked, setBlocked] = useState(false);
    useEffect(() => { setPage(0); setBlocked(false); }, [data]);
    const money = (minor: string, currency = filter.referenceCurrency) => formatMoney({ minor, currency }, locale), view = (f: RecordFilter) => { void onDrilldown(f).then(ok => setBlocked(!ok)); };
    if (loading)
        return <p role="status" className="text-xs text-slate-400">{t('wallet.loading')}</p>;
    if (error)
        return <p role="alert" className="text-xs text-rose-400">{t('wallet.loadFailed')} {error}</p>;
    if (!data)
        return null;
    if (data.kind === 'unsupported')
        return <p role="status" className="text-xs text-slate-400">{t('wallet.personal.unsupported')}</p>;
    const report = 'report' in data ? data.report : null;
    const expenseView=['expenseStructure','expenseNature','categorySpend'].includes(config.kind),series=report?report.series.map(point=>expenseView?{...point,valueMinor:point.expenseMinor}:point):[];

    return <div className="space-y-3 text-xs text-slate-300">
  {blocked && <p role="alert" className="text-amber-400">{t('wallet.analytics.finishDraft')}</p>}
  {report && <><p>{t('wallet.analytics.knownTotal')}: <strong className="font-mono text-slate-100">{money(expenseView?report.totals.expenseMinor:report.totals.valueMinor, report.referenceCurrency)}</strong></p>{!report.coverage.complete && <p role="alert" className="text-amber-400">{t('wallet.analytics.incomplete', { count: report.coverage.totalPostings - report.coverage.valuedPostings })}</p>}{report.coverage.matchedRecords === 0 && report.totals.valueMinor === '0' && <p role="status" className="text-slate-400">{t('wallet.analytics.empty')}</p>}{report.groupsOverlap && <p className="text-slate-400">{t('wallet.analytics.overlap')}</p>}{config.kind === 'summary' && <dl className="grid grid-cols-2 gap-2"><div><dt>{t('wallet.analytics.income')}</dt><dd className="font-mono">{money(report.totals.incomeMinor, report.referenceCurrency)}</dd></div><div><dt>{t('wallet.analytics.expense')}</dt><dd className="font-mono">{money(report.totals.expenseMinor, report.referenceCurrency)}</dd></div></dl>}
   {data.kind === 'comparison' && <dl className="grid grid-cols-2 gap-2"><div><dt>{t('wallet.personal.previousPeriod')}</dt><dd className="font-mono">{report.comparison.complete ? money(report.comparison.previous.valueMinor, report.referenceCurrency) : t('wallet.personal.unavailable')}</dd></div><div><dt>{t('wallet.personal.previousYear')}</dt><dd className="font-mono">{data.previousYear?.coverage.complete ? money(data.previousYear.totals.valueMinor, data.previousYear.referenceCurrency) : t('wallet.personal.unavailable')}</dd></div></dl>}
   {data.kind === 'nature' ? <dl>{data.groups.map(g => <div key={g.nature} className="flex justify-between gap-2"><dt>{t('wallet.catalogForm.natures.' + g.nature)}</dt><dd className="font-mono">{money(g.expenseMinor, report.referenceCurrency)}</dd></div>)}</dl> : config.kind !== 'summary' && config.kind !== 'periodComparison' && <Charts series={series} kind={['expenseStructure', 'categorySpend'].includes(config.kind) ? 'bar' : config.kind === 'cashflowTrend' ? 'area' : 'line'} label={config.title || t('wallet.personal.widgetKinds.' + config.kind)} groupName={id => id === null ? t('wallet.analytics.unassigned') : data.kind === 'report' ? data.names?.[id] ?? t('wallet.analytics.unavailableGroup') : t('wallet.analytics.unavailableGroup')}/>}
   {report.series.length > 0 && <details><summary className="cursor-pointer text-sky-400">{t('wallet.analytics.table')}</summary><div className="overflow-auto"><table className="w-full"><caption className="sr-only">{config.title || t('wallet.personal.widgetKinds.' + config.kind)}</caption><thead><tr><th scope="col">{t('wallet.analytics.period')}</th><th scope="col">{t('wallet.analytics.group')}</th><th scope="col">{t('wallet.analytics.value')}</th><th scope="col">{t('wallet.analytics.drilldown')}</th></tr></thead><tbody>{series.slice(page * 50, page * 50 + 50).map((p, i) => <tr key={i}><th scope="row" className="p-2 text-left font-mono whitespace-nowrap">{p.period.fromDate} – {p.period.toDateExclusive}</th><td className="p-2">{p.groupId === null ? t('wallet.analytics.unassigned') : data.kind === 'report' ? data.names?.[p.groupId] ?? t('wallet.analytics.unavailableGroup') : t('wallet.analytics.unavailableGroup')}</td><td className="p-2 font-mono whitespace-nowrap">{money(p.valueMinor, report.referenceCurrency)}</td><td><button type="button" onClick={() => view(p.drilldownFilter)} className="p-2.5 text-sky-400 rounded-xl neu-btn">{t('wallet.analytics.drilldown')}</button></td></tr>)}</tbody></table></div>{report.series.length > 50 && <div className="flex gap-2"><button type="button" disabled={!page} onClick={() => setPage(p => p - 1)} className="p-2.5 rounded-xl neu-btn disabled:opacity-50">{t('wallet.analytics.previous')}</button><span className="p-2.5">{page + 1}/{Math.ceil(report.series.length / 50)}</span><button type="button" disabled={(page + 1) * 50 >= report.series.length} onClick={() => setPage(p => p + 1)} className="p-2.5 rounded-xl neu-btn disabled:opacity-50">{t('wallet.analytics.next')}</button></div>}</details>}
   <button type="button" onClick={() => view(report.drilldownFilters.total)} className="p-2.5 text-sky-400 rounded-xl neu-btn">{t('wallet.analytics.drilldown')}</button>
  </>}
  {data.kind === 'records' && <>{data.items.length === 0 ? <p className="text-slate-400">{t('wallet.analytics.empty')}</p> : <ul className="space-y-2">{data.items.map(row => <li key={row.record.id} className="space-y-1"><span>{row.record.note || t('wallet.recordKinds.' + row.record.kind)}</span><span className="block font-mono text-slate-400">{row.record.effectiveDate} · {t('wallet.recordStatuses.'+row.record.settlementStatus)}</span>{row.postings.filter(p => row.matchedAccountIds.includes(p.accountId)).map(p => <span key={p.accountId} className="block font-mono">{money(p.deltaMinor, p.currency)}</span>)}</li>)}</ul>}<button type="button" onClick={() => view(filter)} className="p-2.5 text-sky-400 rounded-xl neu-btn">{t('wallet.analytics.drilldown')}</button></>}
  {data.kind === 'accounts' && <>{data.accounts.length === 0 ? <p className="text-slate-400">{t('wallet.analytics.empty')}</p> : <ul className="space-y-1">{data.accounts.slice(page * 10, page * 10 + 10).map(a => <li key={a.id}>{a.name} · {a.currency}</li>)}</ul>}{data.accounts.length > 10 && <p className="text-slate-400">{t('wallet.personal.firstAccounts', { count: Math.min(10, data.accounts.length), total: data.accounts.length })}</p>}<button type="button" onClick={onAccounts} className="p-2.5 text-sky-400 rounded-xl neu-btn">{t('wallet.accounts')}</button></>}
  {data.kind === 'currencies' && <>{data.balances.length === 0 && <p className="text-slate-400">{t('wallet.analytics.empty')}</p>}<dl className="space-y-2">{data.balances.map(m => <div key={m.currency} className="flex justify-between gap-2"><dt>{m.currency}</dt><dd className="font-mono">{money(m.minor, m.currency)}</dd></div>)}</dl></>}
  {data.kind === 'credit' && <><p className="text-slate-400">{t('wallet.analytics.asOf')}: {data.asOf}</p>{data.positions.length === 0 && <p className="text-slate-400">{t('wallet.analytics.empty')}</p>}<dl className="space-y-3">{data.positions.map(p => <div key={p.accountId}><dt>{p.name || t('wallet.personal.widgetKinds.creditUtilization')}</dt><dd className="font-mono">{t('wallet.personal.debt')}: {money(p.credit.debtMinor, p.credit.currency)}</dd><dd className="font-mono">{t('wallet.personal.limit')}: {p.credit.creditLimitMinor === null ? t('wallet.personal.unavailable') : money(p.credit.creditLimitMinor, p.credit.currency)}</dd><dd className="font-mono">{t('wallet.personal.available')}: {p.credit.availableMinor===null?t('wallet.personal.unavailable'):money(p.credit.availableMinor,p.credit.currency)}</dd><dd className="font-mono">{t('wallet.personal.utilization')}: {formatCreditUtilization(p.credit.utilization,locale)??t('wallet.personal.unavailable')}</dd></div>)}</dl>{data.total > 10 && <p className="text-slate-400">{t('wallet.personal.firstAccounts', { count: 10, total: data.total })}</p>}</>}
 </div>;
}
