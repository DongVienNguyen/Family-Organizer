import { createHash } from 'node:crypto';
import type { AppWriteTx } from '../appStore.js';
export const walletImportSql = `
CREATE TABLE IF NOT EXISTS wallet_import_batches(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES wallet_accounts(id),format TEXT NOT NULL CHECK(format IN('csv','xls','xlsx','ofx')),file_name TEXT NOT NULL,file_key TEXT NOT NULL,file_sha256 TEXT NOT NULL,file_retired_at TEXT,file_size INTEGER NOT NULL CHECK(typeof(file_size)='integer' AND file_size BETWEEN 1 AND 20971520),state TEXT NOT NULL CHECK(state IN('staged','preview','queued','committed','undone','expired')),revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),account_revision INTEGER NOT NULL CHECK(typeof(account_revision)='integer' AND account_revision>=1),created_at TEXT NOT NULL,expires_at TEXT NOT NULL,updated_at TEXT NOT NULL,preview_json TEXT NOT NULL CHECK(json_valid(preview_json) AND json_type(preview_json)='object'));
CREATE INDEX IF NOT EXISTS wallet_import_owner ON wallet_import_batches(owner_id,created_at,id);
CREATE INDEX IF NOT EXISTS wallet_import_expiry ON wallet_import_batches(state,expires_at,id);
CREATE TABLE IF NOT EXISTS wallet_import_rows(batch_id TEXT NOT NULL REFERENCES wallet_import_batches(id) ON DELETE CASCADE,row_number INTEGER NOT NULL CHECK(typeof(row_number)='integer' AND row_number BETWEEN 1 AND 10001),value_json TEXT NOT NULL CHECK(json_valid(value_json) AND json_type(value_json)='object'),PRIMARY KEY(batch_id,row_number));
CREATE TABLE IF NOT EXISTS wallet_import_entries(batch_id TEXT NOT NULL REFERENCES wallet_import_batches(id),row_number INTEGER NOT NULL CHECK(typeof(row_number)='integer' AND row_number BETWEEN 1 AND 10001),record_id TEXT NOT NULL UNIQUE REFERENCES wallet_records(id),record_revision INTEGER NOT NULL CHECK(typeof(record_revision)='integer' AND record_revision>=1),source_key TEXT NOT NULL,source_fingerprint TEXT NOT NULL,undone_revision INTEGER CHECK(undone_revision IS NULL OR(typeof(undone_revision)='integer' AND undone_revision>=2)),PRIMARY KEY(batch_id,row_number));
CREATE INDEX IF NOT EXISTS wallet_import_source ON wallet_import_entries(source_key,record_id);
`;
export const walletImportColumns = { wallet_import_batches: ['id', 'owner_id', 'account_id', 'format', 'file_name', 'file_key', 'file_sha256', 'file_retired_at', 'file_size', 'state', 'revision', 'account_revision', 'created_at', 'expires_at', 'updated_at', 'preview_json'], wallet_import_rows: ['batch_id', 'row_number', 'value_json'], wallet_import_entries: ['batch_id', 'row_number', 'record_id', 'record_revision', 'source_key', 'source_fingerprint', 'undone_revision'] } as const;
export const walletImportChecksum = createHash('sha256').update(walletImportSql + '\nwallet-local-file-import-v10').digest('hex');
export function prepareWalletImports(tx: AppWriteTx) { tx.exec(walletImportSql); }
import { normalizeImportMapping } from '../../src/features/wallet/importContracts.js';
import { object, keys, text, integer, choice, strings } from '../../src/features/productivity/validation.js';
import { recordDraftValue } from '../../src/features/wallet/recordDraftValue.js';
import { importHash } from './importHash.js';
export function validateWalletImportTables(tables: Record<string, Record<string, any>[]>, users?: Set<string>): void {
    const accounts = new Map(tables.wallet_accounts.map(row => [row.id, row])), records = new Map(tables.wallet_records.map(row => [row.id, row])), batches = new Map(tables.wallet_import_batches.map(row => [row.id, row])), entries = new Map<string, number>(), previewRows = new Map<string, any[]>(), seenRecords = new Set<string>();
    const time = (raw: unknown) => { if (typeof raw !== 'string' || new Date(raw).toISOString() !== raw)
        throw Error('Invalid import timestamp'); return Date.parse(raw); };
    for (const row of batches.values()) {
        if (!accounts.has(row.account_id) || users && !users.has(row.owner_id))
            throw Error('Invalid import owner/target');
        choice(row.format, ['csv', 'xls', 'xlsx', 'ofx']);
        choice(row.state, ['staged', 'preview', 'queued', 'committed', 'undone', 'expired']);
        text(row.file_name, 240);
        if (/[\\/\x00-\x1f\x7f]/.test(row.file_name) || !/^[a-f0-9]{64}$/.test(row.file_sha256) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.file_key))
            throw Error('Invalid import file identity');
        integer(row.file_size, 1, 20971520);
        integer(row.account_revision, 1);
        const created = time(row.created_at);
        if (row.file_retired_at !== null && time(row.file_retired_at) < time(row.expires_at))
            throw Error('Invalid import retirement');
        if (time(row.expires_at) - created !== 86400000 || time(row.updated_at) < created)
            throw Error('Invalid import chronology');
        const p = object(JSON.parse(row.preview_json));
        keys(p, ['validCount', 'errorCount', 'duplicateCount', 'excludedCount', 'importedCount', 'undoneCount', 'keptCount', 'sheetNames', 'mapping', 'rowsHash', 'jobId', 'errorCode']);
        for (const field of ['validCount', 'errorCount', 'duplicateCount', 'excludedCount', 'importedCount', 'undoneCount', 'keptCount'])
            integer(p[field], 0, 10000);
        strings(p.sheetNames);
        if (p.sheetNames.length > 64 || p.sheetNames.some(v => v.length > 256))
            throw Error('Invalid import sheets');
        if (p.jobId !== undefined)
            text(p.jobId, 256);
        if (p.errorCode !== undefined)
            text(p.errorCode, 80);
        if (p.mapping !== undefined)
            normalizeImportMapping(p.mapping);
        if (p.rowsHash !== undefined && !/^[a-f0-9]{64}$/.test(p.rowsHash as string))
            throw Error('Invalid import preview identity');
        if (['preview', 'queued', 'committed', 'undone'].includes(row.state) && (!p.mapping || !p.rowsHash))
            throw Error('Missing import preview identity');
        if ((p.undoneCount as number) > (p.importedCount as number) || (p.undoneCount as number) + (p.keptCount as number) > (p.importedCount as number))
            throw Error('Invalid undo totals');
        previewRows.set(row.id, []);
    }
    for (const row of tables.wallet_import_rows) {
        const batch = batches.get(row.batch_id);
        if (!batch || !['preview', 'queued'].includes(batch.state))
            throw Error('Unexpected import preview row');
        integer(row.row_number, 1, 10001);
        if (Buffer.byteLength(row.value_json) > 512000)
            throw Error('Oversized import row');
        const v = object(JSON.parse(row.value_json));
        keys(v, ['rowNumber', 'status', 'draft', 'sourceKey', 'sourceFingerprint', 'errors', 'warnings', 'rawCells']);
        if (v.rowNumber !== row.row_number)
            throw Error('Import row identity mismatch');
        choice(v.status, ['header', 'valid', 'error', 'excluded', 'duplicate']);
        strings(v.errors);
        strings(v.warnings);
        if (!Array.isArray(v.rawCells) || v.rawCells.length > 256)
            throw Error('Invalid import cells');
        for (const cell of v.rawCells)
            text(cell, 100000, false);
        text(v.sourceKey, 256);
        text(v.sourceFingerprint, 64, false);
        if (v.draft !== null) {
            const draft = recordDraftValue(v.draft);
            if (!['income', 'expense'].includes(draft.kind) || !('accountId' in draft) || draft.accountId !== batch.account_id || draft.money.currency !== accounts.get(batch.account_id)!.currency)
                throw Error('Invalid import draft target');
        }
        if (['valid', 'duplicate'].includes(v.status as string) && (v.draft === null || v.errors.length || !/^[a-f0-9]{64}$/.test(v.sourceFingerprint as string)) || v.status === 'error' && (v.draft !== null || !v.errors.length))
            throw Error('Invalid import row status');
        previewRows.get(batch.id)!.push(v);
    }
    for (const [id, values] of previewRows) {
        const batch = batches.get(id)!, p = JSON.parse(batch.preview_json);
        if (['preview', 'queued'].includes(batch.state)) {
            values.sort((a, b) => a.rowNumber - b.rowNumber);
            if (values.length > 10001 || importHash(values) !== p.rowsHash)
                throw Error('Import preview checksum mismatch');
            for (const [state, key] of [['valid', 'validCount'], ['error', 'errorCount'], ['duplicate', 'duplicateCount'], ['excluded', 'excludedCount']])
                if (values.filter(v => v.status === state).length !== p[key])
                    throw Error('Import preview count mismatch');
            if (values.reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v)), 0) > 50 * 1024 * 1024)
                throw Error('Import preview budget exceeded');
        }
    }
    for (const row of tables.wallet_import_entries) {
        const batch = batches.get(row.batch_id), record = records.get(row.record_id);
        if (!batch || !record || !['committed', 'undone'].includes(batch.state) || record.source !== 'import' || record.creator_id !== batch.owner_id || seenRecords.has(record.id) || !['income', 'expense'].includes(record.kind))
            throw Error('Invalid import provenance');
        seenRecords.add(record.id);
        integer(row.row_number, 1, 10001);
        integer(row.record_revision, 1);
        if (row.record_revision > record.revision || !/^[a-f0-9]{64}$/.test(row.source_fingerprint) || typeof row.source_key !== 'string' || !/^import:(?:ofx:[a-f0-9]{64}|batch:[a-f0-9-]{36}:row:\d+)$/.test(row.source_key))
            throw Error('Invalid import provenance identity');
        if (row.undone_revision !== null) {
            integer(row.undone_revision, row.record_revision + 1, record.revision);
            if (batch.state !== 'undone' || record.external_key !== null)
                throw Error('Invalid import undo provenance');
        }
        else if (record.external_key !== row.source_key)
            throw Error('Import active source key mismatch');
        entries.set(batch.id, (entries.get(batch.id) ?? 0) + 1);
    }
    for (const batch of batches.values()) {
        const p = JSON.parse(batch.preview_json), count = entries.get(batch.id) ?? 0;
        if (count !== p.importedCount)
            throw Error('Import manifest count mismatch');
        if (batch.state === 'undone' && tables.wallet_import_entries.filter(r => r.batch_id === batch.id && r.undone_revision !== null).length !== p.undoneCount)
            throw Error('Import undo count mismatch');
    }
}
