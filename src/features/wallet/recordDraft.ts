import {allocationRows,assertAllocationTotal,type AllocationDraft} from './allocations.js';
import {recordDraftValue} from './recordDraftValue.js';
import type { RecordDraft, RecordPatch } from '../../../server/wallet/records.js';
import type { WalletRecordDetail } from '../../../server/wallet/read.js';
import type { AccessibleWalletAccount } from '../../../server/wallet/access.js';
import type { Money } from './contracts.js';
import { parseMoney, parseSignedMoney, minorInteger, currencyExponent, convertMoney } from './money.js';
import { editableAmount } from './accountDraft.js';
import { parseEffectiveDate } from './dates.js';
import { localRecordTime, resolveRecordTime } from './recordTime.js';
import { text, choice, strings } from '../productivity/validation.js';
import { utcInstant, timezoneFormatter } from '../productivity/dates.js';
export interface RecordFormInitial {
    detail: WalletRecordDetail;
    fee?: WalletRecordDetail;
}
export interface RecordFormDraft {
    allocations?:AllocationDraft[];
    allocationInputs?:{categoryId:string;amount:string}[];
    seedInstant?:{instant:string;timezone:string};
    seedFx?:{fromCurrency:string;toCurrency:string;debitMinor:string;creditMinor:string;numerator:string;denominator:string};
    locale: string;
    kind: RecordDraft['kind'];
    effectiveDate: string;
    timezone: string;
    occurredLocal: string;
    timeChoice: '' | 'earlier' | 'later';
    reviewed: boolean;
    accountId: string;
    amount: string;
    fromAccountId: string;
    toAccountId: string;
    debit: string;
    credit: string;
    externalCurrency: string;
    fxAsOf: string;
    note: string;
    payee: string;
    paymentMethod: string;
    settlementStatus: 'uncleared' | 'cleared' | 'reconciled';
    categoryId: string;
    labelIds: string[];
    feeEnabled: boolean;
    feeAccountId: string;
    feeAmount: string;
    feeNote: string;
    feeCategoryId: string;
}
interface InputOptions {
    now?: () => number;
    initial?: RecordFormInitial;
}
const absolute = (value: string) => { const amount = minorInteger(value); return (amount < 0n ? -amount : amount).toString(); };
function feeInitial(initial: RecordFormInitial) {
    if (!initial.detail.feeRecordId)
        return null;
    const fee = initial.fee;
    if (!fee || fee.partial || fee.record.id !== initial.detail.feeRecordId || fee.record.kind !== 'expense' || fee.postings.length !== 1 || minorInteger(fee.postings[0].deltaMinor) >= 0n)
        throw Error('FEE_DETAIL_REQUIRED');
    return { accountId: fee.postings[0].accountId, money: { minor: absolute(fee.postings[0].deltaMinor), currency: fee.postings[0].currency }, note: fee.record.note, categoryId: fee.record.categoryId ?? null };
}
export function recordFormDraft(initial: RecordFormInitial | undefined, accounts: AccessibleWalletAccount[], options: {
    locale: string;
    date: string;
    timezone: string;
}): RecordFormDraft {
    const target = accounts.find(a => a.archivedAt === null && a.permission !== 'read');
    const form: RecordFormDraft = { locale: options.locale, kind: 'expense', effectiveDate: options.date, timezone: options.timezone, occurredLocal: '', timeChoice: '', reviewed: false, accountId: target?.id ?? '', amount: '', fromAccountId: target?.id ?? '', toAccountId: '', debit: '', credit: '', externalCurrency: target?.currency ?? 'VND', fxAsOf: options.date, note: '', payee: '', paymentMethod: '', settlementStatus: 'cleared', categoryId: '', labelIds: [], feeEnabled: false, feeAccountId: target?.id ?? '', feeAmount: '', feeNote: '', feeCategoryId: '' };
    if (!initial)
        return form;
    const value = initial.detail, r = value.record;
    if (value.partial || r.kind === 'trade' || r.settlementStatus === 'voided' || r.occurrenceId)
        throw Error('SPECIALIZED_RECORD_EDITOR_REQUIRED');
    Object.assign(form, { kind: r.kind, effectiveDate: r.effectiveDate, timezone: r.timezone, occurredLocal: localRecordTime(value.metadata.occurredAt, r.timezone), reviewed: value.metadata.reviewedAt !== null, note: r.note, payee: value.metadata.payee, paymentMethod: value.metadata.paymentMethod, settlementStatus: r.settlementStatus, categoryId: r.categoryId ?? '', labelIds: [...value.labelIds], fxAsOf: value.fx?.asOf ?? r.effectiveDate });
    if (r.kind !== 'transfer') {
        if (value.postings.length !== 1)
            throw Error('INVALID_RECORD_POSTINGS');
        const p = value.postings[0], amount = minorInteger(p.deltaMinor);
        if (amount === 0n || r.kind === 'income' && amount < 0n || r.kind === 'expense' && amount > 0n)
            throw Error('INVALID_RECORD_POSTINGS');
        form.accountId = p.accountId;
        form.amount = editableAmount(r.kind === 'expense' ? absolute(p.deltaMinor) : p.deltaMinor, p.currency, options.locale);
    }
    else {
        const outgoing = value.postings.filter(p => minorInteger(p.deltaMinor) < 0n), incoming = value.postings.filter(p => minorInteger(p.deltaMinor) > 0n);
        if (outgoing.length > 1 || incoming.length > 1 || value.postings.length !== outgoing.length + incoming.length || value.postings.length === 0)
            throw Error('INVALID_TRANSFER_POSTINGS');
        const from = outgoing[0], to = incoming[0], one = from ?? to;
        form.fromAccountId = from?.accountId ?? '';
        form.toAccountId = to?.accountId ?? '';
        if (value.fx) {
            const fx = value.fx;
            if (from && (from.currency !== fx.fromCurrency || absolute(from.deltaMinor) !== fx.debitMinor) || to && (to.currency !== fx.toCurrency || to.deltaMinor !== fx.creditMinor))
                throw Error('INVALID_TRANSFER_FX');
            form.debit = editableAmount(fx.debitMinor, fx.fromCurrency, options.locale);
            form.credit = editableAmount(fx.creditMinor, fx.toCurrency, options.locale);
            form.externalCurrency = from ? fx.toCurrency : fx.fromCurrency;
        }
        else {
            if (from && to && (from.currency !== to.currency || absolute(from.deltaMinor) !== to.deltaMinor))
                throw Error('INVALID_TRANSFER_FX');
            form.debit = editableAmount(absolute(one.deltaMinor), one.currency, options.locale);
            form.credit = form.debit;
            form.externalCurrency = one.currency;
        }
        const fee = feeInitial(initial);
        if (fee)
            Object.assign(form, { feeEnabled: true, feeAccountId: fee.accountId, feeAmount: editableAmount(fee.money.minor, fee.money.currency, options.locale), feeNote: fee.note, feeCategoryId: fee.categoryId ?? '' });
    }
    return form;
}
/** Apply a server-validated draft to a new form, without inventing an editing ID. */
export function recordFormFromInput(raw:RecordDraft,accounts:AccessibleWalletAccount[],options:{locale:string;date:string;timezone:string}):RecordFormDraft {
 const input=recordDraftValue(raw),form=recordFormDraft(undefined,accounts,options);if(input.allocations){form.allocations=structuredClone(input.allocations);form.allocationInputs=input.allocations.map(row=>({categoryId:row.categoryId,amount:editableAmount(row.amountMinor,input.kind==='transfer'?input.debit.currency:input.money.currency,options.locale,true)}));}
 Object.assign(form,{kind:input.kind,effectiveDate:input.effectiveDate,timezone:input.timezone,note:input.note,payee:input.payee,paymentMethod:input.paymentMethod,occurredLocal:localRecordTime(input.occurredAt??null,input.timezone),reviewed:input.reviewedAt!==null&&input.reviewedAt!==undefined,settlementStatus:input.settlementStatus,categoryId:input.categoryId??'',labelIds:[...input.labelIds??[]]});
 if(input.occurredAt)form.seedInstant={instant:input.occurredAt,timezone:input.timezone};
 if(input.kind!=='transfer'){form.accountId=input.accountId;form.amount=editableAmount(input.money.minor,input.money.currency,options.locale,true);}
 else {Object.assign(form,{fromAccountId:input.fromAccountId??'',toAccountId:input.toAccountId??'',debit:editableAmount(input.debit.minor,input.debit.currency,options.locale,true),credit:editableAmount(input.credit.minor,input.credit.currency,options.locale,true),externalCurrency:input.fromAccountId?input.credit.currency:input.debit.currency,fxAsOf:input.fx?.asOf??input.effectiveDate});
  if(input.fx)form.seedFx={fromCurrency:input.debit.currency,toCurrency:input.credit.currency,debitMinor:input.debit.minor,creditMinor:input.credit.minor,numerator:input.fx.numerator,denominator:input.fx.denominator};
  if(input.fee)Object.assign(form,{feeEnabled:true,feeAccountId:input.fee.accountId,feeAmount:editableAmount(input.fee.money.minor,input.fee.money.currency,options.locale,true),feeNote:input.fee.note??'',feeCategoryId:input.fee.categoryId??''});
 }
 return form;
}
/** The two explicitly entered amounts define a manual implied quote. Preserve an
 * existing rounded historical quote when neither amount/currency changed. */
export function impliedRecordFx(debit: Money, credit: Money, asOf: string): NonNullable<Extract<RecordDraft, {
    kind: 'transfer';
}>['fx']> {
    parseEffectiveDate(asOf);
    let numerator = minorInteger(credit.minor) * 10n ** BigInt(currencyExponent(debit.currency)), denominator = minorInteger(debit.minor) * 10n ** BigInt(currencyExponent(credit.currency));
    if (numerator <= 0n || denominator <= 0n || debit.currency === credit.currency)
        throw Error('INVALID_MANUAL_FX');
    let a = numerator, b = denominator;
    while (b) {
        [a, b] = [b, a % b];
    }
    numerator /= a;
    denominator /= a;
    const result = { numerator: minorInteger(numerator.toString()).toString(), denominator: minorInteger(denominator.toString()).toString(), asOf };
    if (convertMoney(debit, credit.currency, result).minor !== credit.minor)
        throw Error('INVALID_MANUAL_FX');
    return result;
}
export function recordFormInput(form: RecordFormDraft, accounts: AccessibleWalletAccount[], options: InputOptions = {}): RecordDraft {
    const initial = options.initial, old = initial?.detail;
    choice(form.kind, ['income', 'expense', 'adjustment', 'transfer']);
    parseEffectiveDate(form.effectiveDate);
    timezoneFormatter(form.timezone);
    choice(form.settlementStatus, ['uncleared', 'cleared', 'reconciled']);
    text(form.note, 100000, false);
    text(form.payee, 500, false);
    text(form.paymentMethod, 256, false);
    strings(form.labelIds);
    if (form.categoryId !== '')
        text(form.categoryId, 256);
    const originalIds = new Set(old?.postings.map(p => p.accountId) ?? []), fee = initial ? feeInitial(initial) : null;
    const account = (id: string, isFee = false) => { const target = accounts.find(a => a.id === id); if (!target || target.permission === 'read' || target.archivedAt !== null && !(isFee ? fee?.accountId === id : originalIds.has(id)))
        throw Error('ACCOUNT_NOT_WRITABLE'); return target; };
    const amount = (value: string, currency: string, signed = false) => { const money = signed ? parseSignedMoney(value, currency, form.locale) : parseMoney(value, currency, form.locale); if (minorInteger(money.minor) === 0n)
        throw Error('ZERO_RECORD_AMOUNT'); return money; };
    const previous = old?.metadata.occurredAt ? { instant: old.metadata.occurredAt, timezone: old.record.timezone } : form.seedInstant;
    const occurredAt = resolveRecordTime(form.occurredLocal, form.timezone, form.timeChoice || undefined, previous);
    const reviewedAt = form.reviewed ? old?.metadata.reviewedAt ?? new Date((options.now ?? Date.now)()).toISOString() : null;
    if (reviewedAt !== null)
        utcInstant(reviewedAt);
    const allocationCurrency=form.kind==='transfer'?(accounts.find(row=>row.id===form.fromAccountId)?.currency??form.externalCurrency):accounts.find(row=>row.id===form.accountId)?.currency;
    const allocations=form.allocationInputs===undefined?form.allocations:form.allocationInputs.map(row=>({categoryId:row.categoryId,amountMinor:parseMoney(row.amount,allocationCurrency!,form.locale).minor}));
    const common = { ...(allocations===undefined?{}:{allocations:allocationRows(allocations)}),effectiveDate: form.effectiveDate, timezone: form.timezone, note: form.note, payee: form.payee, paymentMethod: form.paymentMethod, settlementStatus: form.settlementStatus, categoryId: form.categoryId || null, labelIds: [...new Set(form.labelIds)], occurredAt, reviewedAt };
    if (form.kind !== 'transfer') {
        const target = account(form.accountId);
        const result={ ...common, kind: form.kind, accountId: target.id, money: amount(form.amount, target.currency, form.kind === 'adjustment') };if(common.allocations)assertAllocationTotal(common.allocations,result,[{deltaMinor:(form.kind==='expense'?-minorInteger(result.money.minor):minorInteger(result.money.minor)).toString()}]);return result;
    }
    if(common.allocations?.length)throw Error('SPLIT_REQUIRES_INCOME_OR_EXPENSE');
    if (!form.fromAccountId && !form.toAccountId || form.fromAccountId && form.fromAccountId === form.toAccountId)
        throw Error('INVALID_TRANSFER_TARGETS');
    const from = form.fromAccountId ? account(form.fromAccountId) : null, to = form.toAccountId ? account(form.toAccountId) : null;
    const debit = amount(form.debit, from?.currency ?? form.externalCurrency), credit = amount(form.credit, to?.currency ?? form.externalCurrency);
    let fx: Extract<RecordDraft, {
        kind: 'transfer';
    }>['fx'] = null;
    if (debit.currency === credit.currency) {
        if (debit.minor !== credit.minor)
            throw Error('UNBALANCED_TRANSFER');
    }
    else {
        const prior = old?.fx??form.seedFx;
        fx = prior && prior.fromCurrency === debit.currency && prior.toCurrency === credit.currency && prior.debitMinor === debit.minor && prior.creditMinor === credit.minor ? { numerator: prior.numerator, denominator: prior.denominator, asOf: form.fxAsOf } : impliedRecordFx(debit, credit, form.fxAsOf);
        parseEffectiveDate(form.fxAsOf);
    }
    const result: Extract<RecordDraft, {
        kind: 'transfer';
    }> = { ...common, kind: 'transfer', fromAccountId: from?.id ?? null, toAccountId: to?.id ?? null, debit, credit, fx };
    if (form.feeEnabled) {
        const target = account(form.feeAccountId, true);
        text(form.feeNote, 100000, false);
        if (form.feeCategoryId !== '')
            text(form.feeCategoryId, 256);
        result.fee = { accountId: target.id, money: amount(form.feeAmount, target.currency), note: form.feeNote, categoryId: form.feeCategoryId || null };
    }
    return result;
}
export function recordFormPatch(form: RecordFormDraft, accounts: AccessibleWalletAccount[], options: InputOptions & {
    initial: RecordFormInitial;
}): RecordPatch {
    const prior = options.initial.detail;
    if ((prior.record.kind === 'transfer') !== (form.kind === 'transfer'))
        throw Error('SPECIALIZED_KIND_CHANGE_REQUIRED');
    const result: RecordPatch = recordFormInput(form, accounts, options);
    if (form.kind === 'transfer') {
        const before = feeInitial(options.initial), after = result.fee ?? null;
        if (JSON.stringify(before) === JSON.stringify(after))
            delete result.fee;
        else if (!form.feeEnabled && before)
            result.fee = null;
    }
    return result;
}
