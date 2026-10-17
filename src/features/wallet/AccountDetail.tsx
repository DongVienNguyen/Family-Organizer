import { useTranslation } from 'react-i18next';
import type { AccountWorkspaceState } from './accountWorkspace.js';
import { formatMoney } from './money.js';
import { walletLocale } from './accountDraft.js';
export function AccountDetail({ account, balance, disabled, onEdit, onArchive, onRestore }: {
    account: NonNullable<AccountWorkspaceState['selected']>;
    balance: AccountWorkspaceState['balance'];
    disabled: boolean;
    onEdit: () => void;
    onArchive: () => void;
    onRestore: () => void;
}) {
    const { t, i18n } = useTranslation(), locale = walletLocale(i18n.resolvedLanguage ?? i18n.language), a = account.account;
    return <section aria-label={t('wallet.detail')} className="bg-slate-950/40 neu-pressed-sm rounded-xl p-4 space-y-4 min-w-0">
  <h3 className="text-sm font-bold text-slate-100 break-words">{a.name}</h3>
  <p className="text-xs text-slate-400">{t('wallet.access.' + a.accessMode)} · {t('wallet.permissions.' + a.permission)}</p>
  {balance && <dl className="space-y-3 text-xs text-slate-400">
   <div><dt>{t('wallet.book')}</dt><dd className="font-mono text-lg text-slate-100 break-words" data-testid="wallet-book">{formatMoney(balance.book, locale)}</dd></div>
   <div><dt>{t('wallet.cleared')}</dt><dd className="font-mono text-slate-200">{formatMoney(balance.cleared, locale)}</dd></div>
   <div><dt>{t('wallet.asOf')}</dt><dd className="font-mono text-slate-200">{balance.date}</dd></div>
   {balance.credit && <>
    <div><dt>{t('wallet.debt')}</dt><dd className="font-mono text-slate-200">{formatMoney({ minor: balance.credit.debtMinor, currency: a.currency }, locale)}</dd></div>
    <div><dt>{t('wallet.creditLimit')}</dt><dd className="font-mono text-slate-200">{balance.credit.creditLimitMinor === null ? t('wallet.unknown') : formatMoney({ minor: balance.credit.creditLimitMinor, currency: a.currency }, locale)}</dd></div>
    <div><dt>{t('wallet.available')}</dt><dd className="font-mono text-slate-200">{balance.credit.availableMinor === null ? t('wallet.unknown') : formatMoney({ minor: balance.credit.availableMinor, currency: a.currency }, locale)}</dd></div>
   </>}
  </dl>}
  <p className="text-xs text-slate-400">{account.metadata.excludedFromStats ? t('wallet.excluded') : t('wallet.included')}</p>
  {a.permission === 'manage' && <div className="flex flex-wrap gap-2">
   <button type="button" disabled={disabled} onClick={onEdit} className="bg-slate-900 neu-btn text-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60">{t('wallet.edit')}</button>
   {a.archivedAt ? <button type="button" disabled={disabled} onClick={onRestore} className="bg-sky-500/10 text-sky-400 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60">{t('wallet.restore')}</button> : <button type="button" disabled={disabled} onClick={onArchive} className="bg-rose-500/10 text-rose-400 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60">{t('wallet.archive')}</button>}
  </div>}
 </section>;
}
