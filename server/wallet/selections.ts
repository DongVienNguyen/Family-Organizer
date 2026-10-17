import { createHash, randomUUID } from 'node:crypto';
import type { Actor, CommandContext, RecordFilter } from '../../src/features/wallet/contracts.js';
import { normalizeFilter } from '../../src/features/wallet/filter.js';
import { object, keys, text, integer } from '../../src/features/productivity/validation.js';
import type { AppWriteTx, withAppWriteTransaction } from '../appStore.js';
import { AppStoreError } from '../appErrors.js';
import { assertWalletCommandContext } from './accounts.js';
import { assertWalletActor, createWalletAccess, type WalletReader } from './access.js';
import { createWalletQueries } from './query.js';
import { selectionFilterHash } from './selectionSchema.js';
export interface SelectionEntry {
    id: string;
    revision: number;
}
export type SelectionInput = {
    filter: RecordFilter;
} | {
    ids: string[];
    revisions: Record<string, number>;
};
export interface SelectionSummary {
    id: string;
    count: number;
    revision: number;
    state: 'ready' | 'applied';
    sourceKind: 'filter' | 'ids';
    createdAt: string;
    expiresAt: string;
}
const fail = (status: number, message: string, code = 'wallet-selection'): never => { throw new AppStoreError(message, status, code); };
export const selectionReader = (tx: AppWriteTx): WalletReader => ({ get: tx.get, all: tx.all, get legacy() { return tx.legacy; } });
export function assertSelectionStorage(reader: WalletReader, actor: Actor): void {
    assertWalletActor(reader, actor);
    if (reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value !== '1' || !reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_selection_records'"))
        fail(409, 'Cần kích hoạt kho Wallet hỗ trợ vùng chọn.', 'wallet-storage-inactive');
}
export function selectionCommandContext(ctx: CommandContext, reader: WalletReader, editing = false): void {
    assertWalletCommandContext(ctx, reader, editing);
    assertSelectionStorage(reader, ctx.actor);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ctx.idempotencyKey))
        fail(400, 'Mã thao tác không hợp lệ.');
}
export function normalizeSelectionIds(value: unknown, max = 100000): string[] { try {
    if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length)
        throw Error();
    for (const id of value)
        text(id, 256);
    return [...value];
}
catch {
    fail(400, 'Danh sách giao dịch không hợp lệ.');
} }
export function normalizeSelectionInput(input: unknown): SelectionInput {
    try {
        const value = object(input);
        if ('filter' in value) {
            keys(value, ['filter']);
            return { filter: normalizeFilter(value.filter as RecordFilter) };
        }
        keys(value, ['ids', 'revisions']);
        const ids = normalizeSelectionIds(value.ids), idSet = new Set(ids), revisions = object(value.revisions);
        if (!ids.length || Object.keys(revisions).length !== ids.length || Object.keys(revisions).some(id => !idSet.has(id)))
            throw Error();
        for (const id of ids)
            integer(revisions[id], 1);
        return { ids, revisions: Object.fromEntries(ids.map(id => [id, revisions[id]])) } as SelectionInput;
    }
    catch (error) {
        if (error instanceof AppStoreError)
            throw error;
        fail(400, 'Điều kiện vùng chọn không hợp lệ.');
    }
}
export function readSelection(reader: WalletReader, actor: Actor, id: string, now: number, ready = true): SelectionSummary {
    assertSelectionStorage(reader, actor);
    try {
        text(id, 256);
    }
    catch {
        fail(400, 'Mã vùng chọn không hợp lệ.');
    }
    const row = reader.get('SELECT id,record_count AS count,revision,state,source_kind AS sourceKind,created_at AS createdAt,expires_at AS expiresAt FROM wallet_selections WHERE id=? AND actor_id=?', id, actor.userId);
    if (!row)
        fail(404, 'Không tìm thấy vùng chọn.');
    if (!Number.isFinite(now) || now < Date.parse(row.createdAt) || now >= Date.parse(row.expiresAt) || ready && row.state !== 'ready')
        fail(409, 'Vùng chọn đã hết hạn hoặc được áp dụng.', 'wallet-selection-expired');
    return row;
}
/** Internal operation IDs are never access credentials. Every read/write uses
 * current actor/record ACL; all durable entries retain their captured revisions. */
export function createWalletSelections(options: {
    reader: WalletReader;
    write: typeof withAppWriteTransaction;
    now?: () => number;
}) {
    const now = options.now ?? Date.now, clock = () => { const value = now(); if (!Number.isFinite(value))
        throw Error('Invalid selection clock'); return value; };
    const run = <T>(ctx: CommandContext, action: string, input: unknown, fn: (tx: AppWriteTx) => T) => options.write({ actorId: ctx.actor.userId, command: 'wallet:selection:' + action, requestId: ctx.idempotencyKey, payloadHash: createHash('sha256').update(JSON.stringify(input)).digest('hex') }, fn);
    return {
        create(ctx: CommandContext, raw: SelectionInput): SelectionSummary {
            selectionCommandContext(ctx, options.reader);
            const input = normalizeSelectionInput(raw);
            return run(ctx, 'create', input, tx => {
                const reader = selectionReader(tx);
                selectionCommandContext(ctx, reader);
                const time = clock(), createdAt = new Date(time).toISOString(), expiresAt = new Date(time + 900000).toISOString();
                // Capture and persist under the same I01 owner. The shared query evaluates
                // exactly the same matching predicate, without hydrating unsearched bodies.
                const entries: SelectionEntry[] = 'filter' in input ? createWalletQueries({ reader }).captureSelection(ctx.actor, input.filter).entries : input.ids.map(id => { const value = createWalletAccess(reader).getRecord(ctx.actor, id); if (value.record.revision !== input.revisions[id])
                    fail(409, 'Giao dịch đã thay đổi.', 'edit-conflict'); return { id, revision: value.record.revision }; });
                tx.run('DELETE FROM wallet_selections WHERE expires_at<=?', createdAt);
                if (reader.get('SELECT count(*) AS n FROM wallet_selections').n >= 100000 || entries.length + reader.get('SELECT count(*) AS n FROM wallet_selection_records').n > 100000)
                    fail(413, 'Kho vùng chọn đã đầy; hãy hủy vùng chọn cũ.', 'wallet-selection-capacity');
                const id = randomUUID(), sourceKind = 'filter' in input ? 'filter' : 'ids';
                tx.run('INSERT INTO wallet_selections VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, ctx.actor.userId, sourceKind, 'filter' in input ? JSON.stringify(input.filter) : null, 'filter' in input ? selectionFilterHash(input.filter) : null, createdAt, expiresAt, entries.length, 1, 'ready', null, null);
                tx.run("INSERT INTO wallet_selection_records(selection_id,record_id,record_revision,ordinal) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.revision'),CAST(key AS INTEGER) FROM json_each(?)", id, JSON.stringify(entries));
                return { id, count: entries.length, revision: 1, state: 'ready', sourceKind, createdAt, expiresAt };
            });
        },
        members(actor: Actor, id: string, rawIds: string[]): string[] { const ids = normalizeSelectionIds(rawIds, 100), reader = options.reader; readSelection(reader, actor, id, clock()); const access = createWalletAccess(reader); for (const recordId of ids)
            access.getRecord(actor, recordId); const members = new Set(reader.all('SELECT record_id AS id FROM wallet_selection_records WHERE selection_id=? AND record_id IN(SELECT value FROM json_each(?))', id, JSON.stringify(ids)).map(row => row.id)); return ids.filter(id => members.has(id)); },
        release(ctx: CommandContext, id: string): {
            released: true;
        } { selectionCommandContext(ctx, options.reader); try {
            text(id, 256);
        }
        catch {
            fail(400, 'Mã vùng chọn không hợp lệ.');
        } return run(ctx, 'release', { id }, tx => { const reader = selectionReader(tx); selectionCommandContext(ctx, reader); const row = reader.get('SELECT actor_id FROM wallet_selections WHERE id=?', id); if (!row || row.actor_id !== ctx.actor.userId)
            fail(404, 'Không tìm thấy vùng chọn.'); tx.run('DELETE FROM wallet_selections WHERE id=?', id); return { released: true }; }); },
    };
}
