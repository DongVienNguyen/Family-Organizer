import { describe, it, expect } from 'vitest';
import { recordFormDraft, recordFormInput, recordFormPatch, impliedRecordFx } from './recordDraft.js';
const account = (id: string, currency = 'VND', patch: any = {}): any => ({ id, name: 'Synthetic ' + id, type: 'cash', currency, ownerUserId: 'adult', accessMode: 'private', openingMinor: '0', openingDate: '2026-10-17', revision: 1, archivedAt: null, permission: 'manage', ...patch });
const accounts = [account('cash'), account('bank'), account('usd', 'USD'), account('read', 'VND', { permission: 'read' }), account('archived', 'VND', { archivedAt: '2026-10-17T00:00:00.000Z' })];
const options = { locale: 'vi-VN', date: '2026-10-17', timezone: 'Asia/Ho_Chi_Minh' }, now = () => Date.parse('2026-10-17T03:04:05.006Z');
const detail = (patch: any = {}): any => ({ record: { id: 'record', kind: 'expense', effectiveDate: '2026-10-17', timezone: 'Asia/Ho_Chi_Minh', source: 'legacy', externalKey: 'legacy-id', note: 'Synthetic note', settlementStatus: 'cleared', creatorId: 'adult', revision: 3, categoryId: 'hidden-existing-category', ...patch.record }, metadata: { recordId: 'record', createdAt: null, updatedAt: null, createdBy: null, updatedBy: null, occurredAt: null, payee: 'Synthetic payee', paymentMethod: 'cash', reviewedAt: null, ...patch.metadata }, postings: [{ recordId: 'record', accountId: 'cash', accountName: 'Synthetic cash', deltaMinor: '-9007199254740993', currency: 'VND' }], labelIds: ['hidden-existing-label'], partial: false, matchedAccountIds: ['cash'], fx: null, feeRecordId: null, ...Object.fromEntries(Object.entries(patch).filter(([key]) => !['record', 'metadata'].includes(key))) });
const draft = () => ({ ...recordFormDraft(undefined, accounts, options), amount: '123', accountId: 'cash' });
describe('Wallet exact record form intent', () => {
    it('builds unsigned income/expense and signed adjustments without invented occurrence time', () => {
        for (const kind of ['income', 'expense'] as const)
            expect(recordFormInput({ ...draft(), kind, amount: '9.007.199.254.740.993' }, accounts, { now })).toMatchObject({ kind, accountId: 'cash', money: { minor: '9007199254740993', currency: 'VND' }, occurredAt: null, reviewedAt: null });
        expect(recordFormInput({ ...draft(), kind: 'adjustment', amount: '-9.223.372.036.854.775.808' }, accounts, { now })).toMatchObject({ money: { minor: '-9223372036854775808', currency: 'VND' } });
    });
    it.each(['0', '-1', '1,5', 'NaN', '1e3'])('rejects invalid positive VND amount %s', amount => { expect(() => recordFormInput({ ...draft(), amount }, accounts, { now })).toThrow(); });
    it('prevents selecting private/missing/read-only/archived accounts for a new record', () => {
        for (const accountId of ['missing', 'read', 'archived'])
            expect(() => recordFormInput({ ...draft(), accountId }, accounts, { now })).toThrow();
    });
    it('preserves historical nulls, labels and exact amount when editing, excluding provenance/source from command', () => {
        const initial = { detail: detail() }, form = recordFormDraft(initial, accounts, options), input = recordFormPatch({ ...form, note: 'Edited' }, accounts, { now, initial });
        expect(input).toMatchObject({ money: { minor: '9007199254740993', currency: 'VND' }, occurredAt: null, labelIds: ['hidden-existing-label'], categoryId: 'hidden-existing-category', note: 'Edited' });
        for (const key of ['source', 'externalKey', 'creatorId', 'createdAt', 'createdBy', 'id', 'revision'])
            expect(input).not.toHaveProperty(key);
    });
    it('retains the original input locale even when the surrounding display language changes', () => {
        const form = draft();
        expect(form.locale).toBe('vi-VN');
        expect(recordFormInput({ ...form, amount: '1.234' }, accounts, { now })).toMatchObject({ money: { minor: '1234', currency: 'VND' } });
    });
    it('preserves exact historical milliseconds/overlap and explicit reviewed state', () => {
        const initial = { detail: detail({ record: { timezone: 'America/New_York' }, metadata: { occurredAt: '2026-11-01T06:30:12.345Z', reviewedAt: '2026-10-17T00:00:00.001Z' } }) }, form = recordFormDraft(initial, accounts, options);
        expect(recordFormPatch(form, accounts, { now, initial })).toMatchObject({ occurredAt: '2026-11-01T06:30:12.345Z', reviewedAt: '2026-10-17T00:00:00.001Z' });
        expect(recordFormPatch({ ...form, reviewed: false }, accounts, { now, initial }).reviewedAt).toBeNull();
        expect(recordFormInput({ ...draft(), reviewed: true }, accounts, { now }).reviewedAt).toBe('2026-10-17T03:04:05.006Z');
    });
    it('keeps business date independent of the occurrence timestamp date', () => {
        expect(recordFormInput({ ...draft(), effectiveDate: '2026-10-16', occurredLocal: '2026-10-17T10:04:05.006' }, accounts, { now })).toMatchObject({ effectiveDate: '2026-10-16', occurredAt: '2026-10-17T03:04:05.006Z' });
    });
    it('retains signed correction and rejects a zero correction', () => {
        const initial = { detail: detail({ record: { kind: 'adjustment' }, postings: [{ recordId: 'record', accountId: 'cash', accountName: 'Synthetic cash', deltaMinor: '-123', currency: 'VND' }] }) }, form = recordFormDraft(initial, accounts, options);
        expect(form.amount).toBe('-123');
        expect(() => recordFormInput({ ...draft(), kind: 'adjustment', amount: '0' }, accounts, { now })).toThrow();
    });
    it('allows an existing archived posting target for edits but not a newly selected archived target', () => {
        const initial = { detail: detail({ postings: [{ recordId: 'record', accountId: 'archived', accountName: 'Synthetic archived', deltaMinor: '-123', currency: 'VND' }] }) };
        expect(recordFormPatch(recordFormDraft(initial, accounts, options), accounts, { now, initial })).toMatchObject({ accountId: 'archived' });
        const other = { detail: detail() };
        expect(() => recordFormPatch({ ...recordFormDraft(other, accounts, options), accountId: 'archived' }, accounts, { now, initial: other })).toThrow();
    });
    it.each(['partial', 'trade', 'voided', 'occurrence'])('refuses the ordinary editor for %s records', kind => {
        const value = detail(kind === 'partial' ? { partial: true } : kind === 'voided' ? { record: { settlementStatus: 'voided' } } : kind === 'occurrence' ? { record: { occurrenceId: 'owned' } } : { record: { kind: 'trade' } });
        expect(() => recordFormDraft({ detail: value }, accounts, options)).toThrow();
    });
    it('builds balanced internal and one-legged external transfers as one intent', () => {
        const form = { ...draft(), kind: 'transfer' as const, fromAccountId: 'cash', toAccountId: 'bank', debit: '100.000', credit: '100.000' };
        expect(recordFormInput(form, accounts, { now })).toMatchObject({ kind: 'transfer', fromAccountId: 'cash', toAccountId: 'bank', debit: { minor: '100000', currency: 'VND' }, credit: { minor: '100000', currency: 'VND' }, fx: null });
        expect(recordFormInput({ ...form, fromAccountId: '', externalCurrency: 'VND' }, accounts, { now })).toMatchObject({ fromAccountId: null, toAccountId: 'bank' });
        for (const patch of [{ fromAccountId: '', toAccountId: '' }, { toAccountId: 'cash' }, { credit: '99.999' }, { debit: '0' }, { debit: '-1' }])
            expect(() => recordFormInput({ ...form, ...patch }, accounts, { now })).toThrow();
    });
    it('derives a reduced explicit manual FX ratio from the two entered amounts, without floating point', () => {
        const form = { ...draft(), kind: 'transfer' as const, fromAccountId: 'usd', toAccountId: 'cash', debit: '100,00', credit: '2.500.000', fxAsOf: '2026-10-16' };
        expect(recordFormInput(form, accounts, { now })).toMatchObject({ debit: { minor: '10000', currency: 'USD' }, credit: { minor: '2500000', currency: 'VND' }, fx: { numerator: '25000', denominator: '1', asOf: '2026-10-16' } });
        expect(impliedRecordFx({ minor: '3', currency: 'VND' }, { minor: '1', currency: 'USD' }, '2026-10-17')).toEqual({ numerator: '1', denominator: '300', asOf: '2026-10-17' });
    });
    it('never recomputes a historical rounded quote just because the note changes', () => {
        const fx = { recordId: 'record', fromCurrency: 'USD', toCurrency: 'VND', debitMinor: '200', creditMinor: '1', numerator: '1', denominator: '3', asOf: '2026-10-16', source: 'synthetic-historical' };
        const initial = { detail: detail({ record: { kind: 'transfer' }, postings: [{ recordId: 'record', accountId: 'usd', accountName: 'Synthetic USD', deltaMinor: '-200', currency: 'USD' }, { recordId: 'record', accountId: 'cash', accountName: 'Synthetic cash', deltaMinor: '1', currency: 'VND' }], fx }) };
        expect(recordFormPatch({ ...recordFormDraft(initial, accounts, options), note: 'Changed note' }, accounts, { now, initial })).toMatchObject({ fx: { numerator: '1', denominator: '3', asOf: '2026-10-16' } });
    });
    it('preserves an external FX transfer with only the readable ledger leg', () => {
        const initial = { detail: detail({ record: { kind: 'transfer' }, postings: [{ recordId: 'record', accountId: 'usd', accountName: 'Synthetic USD', deltaMinor: '-10000', currency: 'USD' }], fx: { recordId: 'record', fromCurrency: 'USD', toCurrency: 'VND', debitMinor: '10000', creditMinor: '2500000', numerator: '25000', denominator: '1', asOf: '2026-10-17', source: 'manual' } }) };
        const form = recordFormDraft(initial, accounts, options);
        expect(form).toMatchObject({ fromAccountId: 'usd', toAccountId: '', externalCurrency: 'VND' });
        expect(recordFormPatch(form, accounts, { now, initial })).toMatchObject({ toAccountId: null, credit: { minor: '2500000', currency: 'VND' } });
    });
    it('never explicitly removes a potentially hidden fee during an unrelated edit', () => {
        const initial = { detail: detail() }, form = recordFormDraft(initial, accounts, options);
        expect(recordFormPatch(form, accounts, { now, initial })).not.toHaveProperty('fee');
    });
    it('loads a visible fee independently, omits unchanged fee patch and only removes on explicit uncheck', () => {
        const transfer = detail({ record: { kind: 'transfer' }, postings: [{ recordId: 'record', accountId: 'cash', deltaMinor: '-100', currency: 'VND', accountName: 'Synthetic cash' }, { recordId: 'record', accountId: 'bank', deltaMinor: '100', currency: 'VND', accountName: 'Synthetic bank' }], feeRecordId: 'fee' });
        expect(() => recordFormDraft({ detail: transfer }, accounts, options)).toThrow();
        const fee = detail({ record: { id: 'fee', note: 'Independent fee', categoryId: 'fee-cat' }, postings: [{ recordId: 'fee', accountId: 'cash', deltaMinor: '-10', currency: 'VND', accountName: 'Synthetic cash' }] }), initial = { detail: transfer, fee }, form = recordFormDraft(initial, accounts, options);
        expect(form).toMatchObject({ feeEnabled: true, feeAmount: '10', feeNote: 'Independent fee', feeCategoryId: 'fee-cat' });
        expect(recordFormPatch(form, accounts, { now, initial })).not.toHaveProperty('fee');
        expect(recordFormPatch({ ...form, feeEnabled: false }, accounts, { now, initial })).toHaveProperty('fee', null);
        expect(recordFormPatch({ ...form, feeAmount: '20' }, accounts, { now, initial })).toMatchObject({ fee: { accountId: 'cash', money: { minor: '20', currency: 'VND' }, note: 'Independent fee', categoryId: 'fee-cat' } });
    });
    it('rejects crossing transfer kind in the ordinary edit intent', () => {
        const initial = { detail: detail() }, form = recordFormDraft(initial, accounts, options);
        expect(() => recordFormPatch({ ...form, kind: 'transfer', fromAccountId: 'cash', toAccountId: 'bank', debit: '1', credit: '1' }, accounts, { now, initial })).toThrow();
    });
});
