import type { AccountDraft, WalletAccountResult } from '../../../server/wallet/accounts.js';
import { parseMoney, parseSignedMoney, minorInteger, currencyExponent } from './money.js';
import { parseEffectiveDate } from './dates.js';
import { choice, text } from '../productivity/validation.js';
export interface AccountFormDraft {
    name: string;
    type: AccountDraft['type'];
    currency: string;
    opening: string;
    openingDate: string;
    accessMode: AccountDraft['accessMode'];
    excludedFromStats: boolean;
    creditLimit: string;
    dueDay: string;
    balanceDisplay: NonNullable<AccountDraft['balanceDisplay']>;
}
export function walletLocale(language: string): string { return language.startsWith('vi') ? 'vi-VN' : language.startsWith('zh') ? 'zh-CN' : 'en-US'; }
/** Editable decimal text without a currency symbol or a floating point conversion. */
export function editableAmount(minor: string, currency: string, locale: string): string {
    const value = minorInteger(minor), scale = currencyExponent(currency), absolute = value < 0n ? -value : value;
    const decimal = new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).formatToParts(1.1).find(p => p.type === 'decimal')?.value ?? '.';
    const digits = absolute.toString().padStart(scale + 1, '0');
    return (value < 0n ? '-' : '') + (scale ? digits.slice(0, -scale) + decimal + digits.slice(-scale) : digits);
}
export function accountDraft(initial: WalletAccountResult | undefined, locale: string, date: string): AccountFormDraft {
    if (!initial)
        return { name: '', type: 'cash', currency: 'VND', opening: '0', openingDate: date, accessMode: 'shared', excludedFromStats: false, creditLimit: '', dueDay: '', balanceDisplay: 'book' };
    const { account: a, metadata: m } = initial;
    return { name: a.name, type: a.type, currency: a.currency, opening: editableAmount(a.openingMinor, a.currency, locale), openingDate: a.openingDate, accessMode: a.accessMode, excludedFromStats: m.excludedFromStats, creditLimit: m.creditLimitMinor === null ? '' : editableAmount(m.creditLimitMinor, a.currency, locale), dueDay: m.dueDay === null ? '' : String(m.dueDay), balanceDisplay: m.balanceDisplay };
}
export function accountInput(draft: AccountFormDraft, locale: string): AccountDraft {
    const name = draft.name.trim();
    text(name, 500);
    choice(draft.type, ['cash', 'bank', 'savings', 'credit', 'e_wallet', 'investment', 'asset', 'liability']);
    choice(draft.accessMode, ['shared', 'private']);
    choice(draft.balanceDisplay, ['book', 'available', 'both']);
    parseEffectiveDate(draft.openingDate);
    const openingMinor = parseSignedMoney(draft.opening, draft.currency, locale).minor;
    const creditLimitMinor = draft.creditLimit.trim() === '' ? null : parseMoney(draft.creditLimit, draft.currency, locale).minor;
    let dueDay: number | null = null;
    if (draft.dueDay !== '') {
        if (!/^(?:[1-9]|[12]\d|3[01])$/.test(draft.dueDay))
            throw Error('Invalid due day');
        dueDay = Number(draft.dueDay);
    }
    return { name, type: draft.type, currency: draft.currency, openingMinor, openingDate: draft.openingDate, accessMode: draft.accessMode, excludedFromStats: draft.excludedFromStats, creditLimitMinor, dueDay, balanceDisplay: draft.balanceDisplay };
}
