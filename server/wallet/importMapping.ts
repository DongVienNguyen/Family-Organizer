import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { normalizeImportMapping, type ImportMapping, type ImportFormat } from '../../src/features/wallet/importContracts.js';
import { parseSignedMoney, minorInteger, currencyExponent } from '../../src/features/wallet/money.js';
import { parseEffectiveDate } from '../../src/features/wallet/dates.js';
import { normalizeWalletRecordDraft, type RecordDraft } from './records.js';
import type { ImportMatrix, RawImportCell } from './parsers/index.js';
export { normalizeImportMapping };
export interface ImportMappingContext {
    accountId: string;
    currency: string;
    batchId: string;
    format: ImportFormat;
    categories: {
        id: string;
        name: string;
        path?: string;
    }[];
    labels: {
        id: string;
        name: string;
    }[];
    ofx?: {
        namespace: string;
        rows: Record<number, {
            fitId: string;
            type: string;
            errors: string[];
        }>;
    };
}
export interface MappedImportRow {
    rowNumber: number;
    status: 'header' | 'valid' | 'error' | 'excluded';
    draft: RecordDraft | null;
    sourceKey: string;
    sourceFingerprint: string;
    errors: string[];
    warnings: string[];
    rawCells: string[];
}
const folded = (raw: string) => raw.normalize('NFKC').trim().toLowerCase(), hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function date(cell: RawImportCell | undefined, mapping: ImportMapping, date1904: boolean): string { if (!cell || cell.error)
    throw Error(); const raw = cell.value.trim(); if (mapping.dateFormat === 'excelSerial') {
    if (cell.type !== 'number' || !/^\d+(?:\.\d+)?$/.test(raw))
        throw Error();
    const result = XLSX.SSF.parse_date_code(Number(raw), { date1904 });
    if (!result)
        throw Error();
    return parseEffectiveDate(String(result.y).padStart(4, '0') + '-' + String(result.m).padStart(2, '0') + '-' + String(result.d).padStart(2, '0'));
} if (mapping.dateFormat === 'ofx') {
    if (!/^\d{8}/.test(raw))
        throw Error();
    return parseEffectiveDate(raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8));
} const padded = mapping.dateFormat === 'YYYY-MM-DD' ? raw : raw.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, a, b, y) => a.padStart(2, '0') + '/' + b.padStart(2, '0') + '/' + y); return parseEffectiveDate(padded, mapping.dateFormat); }
function money(cell: RawImportCell | undefined, currency: string, mapping: ImportMapping, format: ImportFormat): bigint {
    if (!cell || cell.error || !cell.value.trim())
        throw Error();
    let raw = cell.value.trim();
    if (format === 'ofx') {
        if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw))
            throw Error();
        raw = raw.replace(/^\+/, '');
        const [whole, fraction] = raw.split('.'), precision = currencyExponent(currency);
        if (fraction !== undefined) {
            if (fraction.slice(precision).split('').some(c => c !== '0'))
                throw Error();
            raw = whole + (precision ? '.' + fraction.slice(0, precision) : '');
        }
    }
    return minorInteger(parseSignedMoney(raw, currency, format === 'ofx' || cell.type === 'number' ? 'en-US' : mapping.locale).minor);
}
export function mapImportRows(matrix: ImportMatrix, mapping: ImportMapping, context: ImportMappingContext) {
    const excluded = new Set(mapping.excludedRows), seen = new Set<string>(), header = matrix.rows.find(row => row.rowNumber === mapping.headerRow)?.cells.map(c => c.value.trim()), rows: MappedImportRow[] = matrix.rows.map(row => {
        const errors: string[] = [], warnings: string[] = [], cell = (column: number | undefined) => column === undefined ? undefined : row.cells[column - 1], value = (column: number | undefined) => cell(column)?.value.trim() ?? '', source = context.ofx?.rows[row.rowNumber], sourceKey = context.format === 'ofx' && source ? 'import:ofx:' + hash([context.accountId, context.ofx!.namespace, source.fitId]) : 'import:batch:' + context.batchId + ':row:' + row.rowNumber, base = { rowNumber: row.rowNumber, draft: null as RecordDraft | null, sourceKey, sourceFingerprint: '', errors, warnings, rawCells: row.cells.map(c => c.value) };
        if (row.rowNumber === mapping.headerRow)
            return { ...base, status: 'header' as const };
        if (excluded.has(row.rowNumber))
            return { ...base, status: 'excluded' as const };
        const mappedColumns = [mapping.dateColumn, ...(mapping.amount.mode === 'signed' ? [mapping.amount.column] : [mapping.amount.debitColumn, mapping.amount.creditColumn]), mapping.payeeColumn, mapping.noteColumn, mapping.currencyColumn, mapping.categoryColumn, mapping.labelColumn];
        for (const column of mappedColumns) {
            const error = cell(column)?.error;
            if (error)
                errors.push(error);
        }
        if (header && row.cells.length === header.length && row.cells.every((c, i) => c.value.trim() === header[i]))
            errors.push('REPEATED_HEADER');
        if (source?.errors.length)
            errors.push(...source.errors);
        if (context.format === 'ofx' && (!source || !context.ofx?.namespace))
            errors.push('INVALID_SOURCE_ID');
        if (source && ['XFER', 'TRANSFER'].includes(source.type.toUpperCase()))
            errors.push('TRANSFER_REQUIRES_MAPPING');
        let effectiveDate = '';
        try {
            effectiveDate = date(cell(mapping.dateColumn), mapping, !!matrix.date1904);
        }
        catch {
            errors.push('INVALID_DATE');
        }
        let signed = 0n;
        try {
            if (mapping.amount.mode === 'signed')
                signed = money(cell(mapping.amount.column), context.currency, mapping, context.format);
            else {
                const debit = value(mapping.amount.debitColumn), credit = value(mapping.amount.creditColumn);
                if ((!debit && !credit) || (!!debit && !!credit))
                    throw Error();
                const n = money(cell(debit ? mapping.amount.debitColumn : mapping.amount.creditColumn), context.currency, mapping, context.format);
                if (n <= 0n)
                    throw Error();
                signed = debit ? -n : n;
            }
            if (signed === 0n)
                throw Error();
            minorInteger((signed < 0n ? -signed : signed).toString());
        }
        catch {
            errors.push('INVALID_AMOUNT');
        }
        const currency = value(mapping.currencyColumn).toUpperCase();
        if (mapping.currencyColumn !== undefined && currency !== context.currency)
            errors.push('MIXED_CURRENCY');
        let categoryId = mapping.defaultCategoryId;
        const category = value(mapping.categoryColumn);
        if (category) {
            const matches = [...new Set(context.categories.filter(c => folded(c.name) === folded(category) || c.path && folded(c.path) === folded(category)).map(c => c.id))];
            if (matches.length !== 1)
                errors.push(matches.length ? 'AMBIGUOUS_CATEGORY' : 'UNKNOWN_CATEGORY');
            else
                categoryId = matches[0];
        }
        if (categoryId !== null && !context.categories.some(c => c.id === categoryId))
            errors.push('UNKNOWN_CATEGORY');
        const labelIds = new Set(mapping.labelIds);
        for (const id of labelIds)
            if (!context.labels.some(l => l.id === id))
                errors.push('UNKNOWN_LABEL');
        for (const name of value(mapping.labelColumn).split(mapping.labelDelimiter).map(v => v.trim()).filter(Boolean)) {
            const matches = [...new Set(context.labels.filter(l => folded(l.name) === folded(name)).map(l => l.id))];
            if (matches.length !== 1)
                errors.push(matches.length ? 'AMBIGUOUS_LABEL' : 'UNKNOWN_LABEL');
            else
                labelIds.add(matches[0]);
        }
        if (labelIds.size > 20)
            errors.push('TOO_MANY_LABELS');
        let draft: RecordDraft | null = null;
        if (!errors.length) {
            try {
                draft = normalizeWalletRecordDraft({ kind: signed < 0n ? 'expense' : 'income', accountId: context.accountId, money: { minor: (signed < 0n ? -signed : signed).toString(), currency: context.currency }, effectiveDate, timezone: mapping.timezone, settlementStatus: mapping.status, note: cell(mapping.noteColumn)?.value ?? '', payee: value(mapping.payeeColumn), occurredAt: null, reviewedAt: null, categoryId, labelIds: [...labelIds].sort() });
            }
            catch {
                errors.push('INVALID_RECORD');
            }
        }
        const sourceFingerprint = hash(draft ? { kind: draft.kind, effectiveDate, money: draft.kind === 'transfer' ? null : draft.money, payee: draft.payee, note: draft.note } : row.cells.map(c => [c.type, c.value, c.error ?? null]));
        if (draft && seen.has(sourceFingerprint) && context.format !== 'ofx')
            warnings.push('POSSIBLE_DUPLICATE');
        if (draft)
            seen.add(sourceFingerprint);
        return { ...base, status: errors.length ? 'error' as const : 'valid' as const, draft: errors.length ? null : draft, sourceFingerprint, errors: [...new Set(errors)] };
    });
    return { rows, validCount: rows.filter(r => r.status === 'valid').length, errorCount: rows.filter(r => r.status === 'error').length, excludedCount: rows.filter(r => r.status === 'excluded').length };
}
