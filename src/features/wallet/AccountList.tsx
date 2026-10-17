import { useTranslation } from 'react-i18next';
import type { AccessibleWalletAccount } from '../../../server/wallet/access.js';
export function AccountList({ accounts, selectedId, onSelect, disabled }: {
    accounts: AccessibleWalletAccount[];
    selectedId?: string;
    onSelect: (id: string) => void;
    disabled: boolean;
}) {
    const { t } = useTranslation();
    return <div className="space-y-2" aria-label={t('wallet.accounts')}>
  {!accounts.length && <p className="text-sm text-slate-500 py-6">{t('wallet.empty')}</p>}
  {accounts.map(account => <button key={account.id} type="button" disabled={disabled} aria-pressed={selectedId === account.id} onClick={() => onSelect(account.id)} className={`w-full rounded-xl p-3 text-left cursor-pointer disabled:opacity-60 ${selectedId === account.id ? 'bg-slate-950 neu-pressed-sm' : 'bg-slate-900 neu-raised-sm'} focus:outline-none focus:ring-2 focus:ring-sky-500/40`}>
   <span className="block font-bold text-sm text-slate-100 break-words">{account.name}</span>
   <span className="text-xs text-slate-400">{t('wallet.types.' + account.type)} · <span className="font-mono">{account.currency}</span> · {t('wallet.permissions.' + account.permission)}{account.archivedAt ? ' · ' + t('wallet.archived') : ''}</span>
  </button>)}
 </div>;
}
