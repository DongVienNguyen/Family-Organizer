import { createHash } from 'node:crypto';
import type { AppWriteTx } from '../appStore.js';
import { normalizeFilter } from '../../src/features/wallet/filter.js';
import type { RecordFilter } from '../../src/features/wallet/contracts.js';
export const walletSelectionSql = `
CREATE TABLE IF NOT EXISTS wallet_selections(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,source_kind TEXT NOT NULL CHECK(source_kind IN('filter','ids')),filter_json TEXT CHECK(filter_json IS NULL OR(json_valid(filter_json) AND json_type(filter_json)='object')),filter_hash TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,record_count INTEGER NOT NULL CHECK(typeof(record_count)='integer' AND record_count BETWEEN 0 AND 100000),revision INTEGER NOT NULL CHECK(revision IN(1,2)),state TEXT NOT NULL CHECK(state IN('ready','applied')),applied_at TEXT,applied_request_id TEXT);
CREATE INDEX IF NOT EXISTS wallet_selection_actor_expiry ON wallet_selections(actor_id,expires_at,id);
CREATE TABLE IF NOT EXISTS wallet_selection_records(selection_id TEXT NOT NULL REFERENCES wallet_selections(id) ON DELETE CASCADE,record_id TEXT NOT NULL REFERENCES wallet_records(id),record_revision INTEGER NOT NULL CHECK(typeof(record_revision)='integer' AND record_revision>=1),ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal>=0),PRIMARY KEY(selection_id,record_id),UNIQUE(selection_id,ordinal));
CREATE INDEX IF NOT EXISTS wallet_selection_record ON wallet_selection_records(record_id,selection_id);
`;
export const walletSelectionChecksum = createHash('sha256').update(walletSelectionSql + '\nwallet-selection-snapshots-v6').digest('hex');
export const walletSelectionColumns = { wallet_selections: ['id', 'actor_id', 'source_kind', 'filter_json', 'filter_hash', 'created_at', 'expires_at', 'record_count', 'revision', 'state', 'applied_at', 'applied_request_id'], wallet_selection_records: ['selection_id', 'record_id', 'record_revision', 'ordinal'] } as const;
export function prepareWalletSelections(tx: AppWriteTx): void { tx.exec(walletSelectionSql); }
function canonical(value: unknown): unknown { return Array.isArray(value) ? [...value].sort() : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value; }
export function selectionFilterHash(filter: RecordFilter): string { return createHash('sha256').update(JSON.stringify(canonical(normalizeFilter(filter)))).digest('hex'); }
function time(value: unknown): number { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    throw Error('Invalid selection time'); return Date.parse(value); }
export function validateWalletSelectionTables(tables: Record<string, Record<string, any>[]>, userIds?: Set<string>): void {
    const records = new Map(tables.wallet_records.map(row => [row.id, row])), selections = new Map(tables.wallet_selections.map(row => [row.id, row])), entries = new Map<string, Set<number>>();
    for (const row of selections.values()) {
        if (userIds && !userIds.has(row.actor_id))
            throw Error('Unknown selection actor');
        const created = time(row.created_at), expires = time(row.expires_at);
        if (expires <= created || expires - created > 86400000)
            throw Error('Invalid selection expiry');
        if (row.source_kind === 'filter') {
            if (typeof row.filter_json !== 'string' || typeof row.filter_hash !== 'string' || row.filter_hash !== selectionFilterHash(JSON.parse(row.filter_json)))
                throw Error('Invalid selection filter identity');
        }
        else if (row.source_kind !== 'ids' || row.filter_json !== null || row.filter_hash !== null)
            throw Error('Invalid selection source');
        if (row.state === 'ready') {
            if (row.revision !== 1 || row.applied_at !== null || row.applied_request_id !== null)
                throw Error('Invalid ready selection state');
        }
        else if (row.state === 'applied') {
            const applied = time(row.applied_at);
            if (row.revision !== 2 || applied < created || applied >= expires || typeof row.applied_request_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.applied_request_id))
                throw Error('Invalid applied selection state');
        }
        else
            throw Error('Unsupported selection state');
        entries.set(row.id, new Set());
    }
    for (const row of tables.wallet_selection_records) {
        const parent = selections.get(row.selection_id), record = records.get(row.record_id), ordinals = entries.get(row.selection_id);
        if (!parent || !record || !ordinals || row.record_revision > record.revision || ordinals.has(row.ordinal) || row.ordinal >= parent.record_count)
            throw Error('Invalid selection record reference');
        ordinals.add(row.ordinal);
    }
    for (const row of selections.values())
        if (entries.get(row.id)!.size !== row.record_count)
            throw Error('Incomplete selection snapshot');
}
