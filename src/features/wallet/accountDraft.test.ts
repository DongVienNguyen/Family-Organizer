import { describe, it, expect } from 'vitest';
import { accountDraft, accountInput, editableAmount } from './accountDraft.js';
describe('Wallet account money form', () => {
    it.each(['en-US', 'vi-VN', 'zh-CN'])('round trips signed64 money without Number in %s', locale => {
        for (const currency of ['VND', 'USD'])
            for (const minor of ['0', '1', '-1', '9007199254740993', '9223372036854775807', '-9223372036854775808']) {
                const draft = accountDraft(undefined, locale, '2026-10-17');
                draft.currency = currency;
                draft.opening = editableAmount(minor, currency, locale);
                expect(accountInput({ ...draft, name: 'Synthetic' }, locale).openingMinor).toBe(minor);
            }
    });
    it('retains negative fractional USD and localized separators', () => {
        const draft = { ...accountDraft(undefined, 'vi-VN', '2026-10-17'), name: 'Synthetic', currency: 'USD', opening: '-1.234,56' };
        expect(accountInput(draft, 'vi-VN').openingMinor).toBe('-123456');
    });
    it.each(['1.000', '1,00', '1e3', 'NaN', '', '-0', '--1'])('rejects ambiguous or invalid VND input %s', opening => {
        expect(() => accountInput({ ...accountDraft(undefined, 'en-US', '2026-10-17'), name: 'Synthetic', opening }, 'en-US')).toThrow();
    });
    it('validates account fields, calendar date, and nonnegative credit limit', () => {
        const draft = { ...accountDraft(undefined, 'en-US', '2026-10-17'), name: ' Synthetic ', type: 'credit' as const, creditLimit: '1,000', dueDay: '31' };
        expect(accountInput(draft, 'en-US')).toMatchObject({ name: 'Synthetic', creditLimitMinor: '1000', dueDay: 31 });
        for (const patch of [{ name: ' ' }, { openingDate: '2026-02-30' }, { currency: 'XXX' }, { dueDay: '32' }, { dueDay: '1e1' }, { creditLimit: '-1' }, { type: 'other' }, { accessMode: 'public' }])
            expect(() => accountInput({ ...draft, ...patch } as any, 'en-US')).toThrow();
    });
    it('preserves unknown limit and due day rather than inventing zero', () => {
        expect(accountInput({ ...accountDraft(undefined, 'en-US', '2026-10-17'), name: 'Synthetic' }, 'en-US')).toMatchObject({ creditLimitMinor: null, dueDay: null });
    });
});
