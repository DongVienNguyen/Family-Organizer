import { object, keys, text, integer, choice, strings, boolean } from '../productivity/validation.js';
import { recordDraftValue } from './recordDraftValue.js';
import { normalizeImportMapping } from './importContracts.js';
import type { ImportBatch, ImportPreviewPage } from './importContracts.js';
const counts = ['validCount', 'errorCount', 'duplicateCount', 'excludedCount', 'importedCount', 'undoneCount', 'keptCount'] as const;
export function importBatchValue(raw: unknown, id?: string, revision?: number, accountId?: string): ImportBatch { const v = object(raw), required = ['id', 'accountId', 'fileName', 'format', 'state', 'revision', 'createdAt', 'expiresAt', ...counts, 'sheetNames']; keys(v, [...required, 'jobId', 'jobStatus', 'errorCode', 'mapping']); if (required.some(k => !Object.hasOwn(v, k)))
    throw Error('Incomplete import batch'); for (const key of ['id', 'accountId'])
    text(v[key], 256); text(v.fileName, 240); choice(v.format, ['csv', 'xls', 'xlsx', 'ofx']); choice(v.state, ['staged', 'preview', 'queued', 'committed', 'undone', 'expired']); integer(v.revision, 1); if (id !== undefined && v.id !== id || revision !== undefined && v.revision !== revision + 1 || accountId !== undefined && v.accountId !== accountId)
    throw Error('Wrong import identity'); for (const key of counts)
    integer(v[key], 0, 10000); for (const key of ['createdAt', 'expiresAt'])
    if (typeof v[key] !== 'string' || new Date(v[key] as string).toISOString() !== v[key])
        throw Error('Invalid import time'); if (Date.parse(v.expiresAt as string) - Date.parse(v.createdAt as string) !== 86400000)
    throw Error('Invalid import lifetime'); strings(v.sheetNames); if (v.sheetNames.length > 64 || v.sheetNames.some(v => v.length > 256))
    throw Error('Invalid import sheets'); if (v.mapping !== undefined)
    v.mapping = normalizeImportMapping(v.mapping); if (v.jobId !== undefined)
    text(v.jobId, 256); if (v.jobStatus !== undefined)
    choice(v.jobStatus, ['pending', 'leased', 'completed', 'failed', 'unknown', 'dropped', 'unavailable']); if (v.errorCode !== undefined)
    text(v.errorCode, 80); if ((v.undoneCount as number) + (v.keptCount as number) > (v.importedCount as number))
    throw Error('Invalid import result counts'); return { ...v } as unknown as ImportBatch; }
export function importPageValue(raw: unknown, id: string, offset: number): ImportPreviewPage { const v = object(raw); keys(v, ['id', 'revision', 'total', 'offset', 'rows']); if (v.id !== id || v.offset !== offset)
    throw Error('Wrong import page'); integer(v.revision, 1); integer(v.total, 0, 10001); if (!Array.isArray(v.rows) || v.rows.length > 100)
    throw Error('Invalid import rows'); let last = 0; const rows = v.rows.map(raw => { const r = object(raw); keys(r, ['rowNumber', 'status', 'errors', 'warnings', 'rawCells', 'draft']); integer(r.rowNumber, 1, 10001); if (r.rowNumber <= last)
    throw Error('Unordered import rows'); last = r.rowNumber; choice(r.status, ['header', 'valid', 'error', 'excluded', 'duplicate']); strings(r.errors); strings(r.warnings); if (!Array.isArray(r.rawCells) || r.rawCells.length > 256)
    throw Error('Invalid raw cells'); for (const cell of r.rawCells)
    text(cell, 100000, false); const draft = r.draft === null ? null : recordDraftValue(r.draft); if (['valid', 'duplicate'].includes(r.status as string) && (!draft || r.errors.length) || r.status === 'error' && (draft !== null || !r.errors.length))
    throw Error('Invalid preview status'); return { ...r, draft }; }); if (rows.length > Math.max(0, (v.total as number) - offset))
    throw Error('Invalid import page total'); return { ...v, rows } as unknown as ImportPreviewPage; }
export function importHistoryValue(raw: unknown) { const v = object(raw); keys(v, ['batches', 'hasMore']); boolean(v.hasMore); if (!Array.isArray(v.batches) || v.batches.length > 50)
    throw Error('Invalid import history'); const batches = v.batches.map(v => importBatchValue(v)); if (new Set(batches.map(b => b.id)).size !== batches.length)
    throw Error('Duplicate import batch'); return { batches, hasMore: v.hasMore }; }
