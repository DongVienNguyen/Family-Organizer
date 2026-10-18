import { object, keys, choice, integer, strings, text } from '../productivity/validation.js';
import { timezoneFormatter } from '../productivity/dates.js';
export type ImportFormat = 'csv' | 'xls' | 'xlsx' | 'ofx';
export type ImportDateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'excelSerial' | 'ofx';
export interface ImportMapping {
    headerRow: number | null;
    dateColumn: number;
    amount: {
        mode: 'signed';
        column: number;
    } | {
        mode: 'debitCredit';
        debitColumn: number;
        creditColumn: number;
    };
    dateFormat: ImportDateFormat;
    locale: 'vi-VN' | 'en-US' | 'zh-CN';
    timezone: string;
    status: 'uncleared' | 'cleared' | 'reconciled';
    payeeColumn?: number;
    noteColumn?: number;
    currencyColumn?: number;
    categoryColumn?: number;
    labelColumn?: number;
    labelDelimiter: string;
    defaultCategoryId: string | null;
    labelIds: string[];
    excludedRows: number[];
    sheet?: string;
    delimiter?: string;
    startRow?: number;
    endRow?: number;
    startColumn?: number;
    endColumn?: number;
}
export function normalizeImportMapping(raw: unknown): ImportMapping {
    const v = object(raw);
    keys(v, ['headerRow', 'dateColumn', 'amount', 'dateFormat', 'locale', 'timezone', 'status', 'payeeColumn', 'noteColumn', 'currencyColumn', 'categoryColumn', 'labelColumn', 'labelDelimiter', 'defaultCategoryId', 'labelIds', 'excludedRows', 'sheet', 'delimiter', 'startRow', 'endRow', 'startColumn', 'endColumn']);
    if (v.headerRow !== null)
        integer(v.headerRow, 1, 10001);
    integer(v.dateColumn, 1, 256);
    choice(v.dateFormat, ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'excelSerial', 'ofx']);
    choice(v.locale, ['vi-VN', 'en-US', 'zh-CN']);
    timezoneFormatter(v.timezone as string);
    choice(v.status, ['uncleared', 'cleared', 'reconciled']);
    const amount = object(v.amount);
    let normalized: ImportMapping['amount'];
    if (amount.mode === 'signed') {
        keys(amount, ['mode', 'column']);
        integer(amount.column, 1, 256);
        normalized = { mode: 'signed', column: amount.column };
    }
    else {
        keys(amount, ['mode', 'debitColumn', 'creditColumn']);
        choice(amount.mode, ['debitCredit']);
        integer(amount.debitColumn, 1, 256);
        integer(amount.creditColumn, 1, 256);
        if (amount.debitColumn === amount.creditColumn)
            throw Error('Distinct amount columns required');
        normalized = { mode: 'debitCredit', debitColumn: amount.debitColumn, creditColumn: amount.creditColumn };
    }
    const result: ImportMapping = { headerRow: v.headerRow as number | null, dateColumn: v.dateColumn, amount: normalized, dateFormat: v.dateFormat, locale: v.locale, timezone: v.timezone as string, status: v.status, labelDelimiter: (v.labelDelimiter ?? '|') as string, defaultCategoryId: (v.defaultCategoryId ?? null) as string, labelIds: [], excludedRows: [] };
    for (const field of ['payeeColumn', 'noteColumn', 'currencyColumn', 'categoryColumn', 'labelColumn', 'startRow', 'endRow', 'startColumn', 'endColumn'] as const)
        if (v[field] !== undefined) {
            integer(v[field], 1, field.endsWith('Column') ? 256 : 10001);
            result[field] = v[field];
        }
    if (result.endRow !== undefined && result.endRow < (result.startRow ?? 1) || result.endColumn !== undefined && result.endColumn < (result.startColumn ?? 1))
        throw Error('Invalid import range');
    text(result.labelDelimiter, 1);
    if (result.labelDelimiter.length !== 1 || /[\r\n\0]/.test(result.labelDelimiter))
        throw Error('Invalid label delimiter');
    if (result.defaultCategoryId !== null)
        text(result.defaultCategoryId, 256);
    if (v.labelIds !== undefined) {
        strings(v.labelIds);
        if (v.labelIds.length > 20)
            throw Error('Too many default labels');
        result.labelIds = [...new Set(v.labelIds)].sort();
    }
    if (v.excludedRows !== undefined) {
        if (!Array.isArray(v.excludedRows) || v.excludedRows.length > 10001)
            throw Error('Too many excluded rows');
        for (const n of v.excludedRows)
            integer(n, 1, 10001);
        result.excludedRows = [...new Set(v.excludedRows as number[])].sort((a, b) => a - b);
    }
    if (v.sheet !== undefined) {
        text(v.sheet, 256);
        result.sheet = v.sheet;
    }
    if (v.delimiter !== undefined) {
        text(v.delimiter, 1);
        if (v.delimiter.length !== 1 || /["\r\n\0]/.test(v.delimiter))
            throw Error('Invalid CSV delimiter');
        result.delimiter = v.delimiter;
    }
    return result;
}
export interface ImportBatch {
    mapping?: ImportMapping;
    jobId?: string;
    jobStatus?: string;
    errorCode?: string;
    id: string;
    accountId: string;
    fileName: string;
    format: ImportFormat;
    state: 'staged' | 'preview' | 'queued' | 'committed' | 'undone' | 'expired';
    revision: number;
    createdAt: string;
    expiresAt: string;
    validCount: number;
    errorCount: number;
    duplicateCount: number;
    excludedCount: number;
    importedCount: number;
    undoneCount: number;
    keptCount: number;
    sheetNames: string[];
}
export interface ImportPreviewRow {
    rowNumber: number;
    status: 'header' | 'valid' | 'error' | 'excluded' | 'duplicate';
    errors: string[];
    warnings: string[];
    rawCells: string[];
    draft: unknown;
}
export interface ImportPreviewPage {
    id: string;
    revision: number;
    total: number;
    offset: number;
    rows: ImportPreviewRow[];
}
export interface ImportUpload {
    accountId: string;
    fileName: string;
    format: ImportFormat;
    base64: string;
}
