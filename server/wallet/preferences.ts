import { createHash, randomUUID } from 'node:crypto';
import type { Actor, CommandContext } from '../../src/features/wallet/contracts.js';
import { normalizePreferenceConfig, type PreferenceKind, type PreferenceDraft, type WalletPreference, type WalletPreferences } from '../../src/features/wallet/preferenceContracts.js';
import { object, keys, text, boolean, choice, integer } from '../../src/features/productivity/validation.js';
import { assertWalletActor, type WalletReader } from './access.js';
import { assertWalletCommandContext } from './accounts.js';
import { openWalletStore } from './store.js';
import type { withAppWriteTransaction } from '../appStore.js';
import { AppStoreError } from '../appErrors.js';
const fail = (status: number, message: string, code = 'INVALID_INPUT'): never => { throw new AppStoreError(message, status, code); };
const canonical = (raw: unknown): unknown => Array.isArray(raw) ? raw.map(canonical) : raw && typeof raw === 'object' ? Object.fromEntries(Object.entries(raw).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)])) : raw;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function normalize(kind: PreferenceKind, raw: PreferenceDraft): PreferenceDraft { try {
    choice(kind, ['filter', 'chart', 'layout']);
    const v = object(raw);
    keys(v, ['id', 'name', 'config', 'archived']);
    if (!Object.keys(v).length || Object.values(v).some(x => x === undefined))
        throw Error();
    if (v.id !== undefined)
        text(v.id, 256);
    else if (v.name === undefined || v.config === undefined)
        throw Error();
    if (v.id !== undefined && Object.keys(v).length === 1)
        throw Error();
    if (v.name !== undefined)
        text(v.name, 120);
    if (v.archived !== undefined)
        boolean(v.archived);
    return { ...v, ...(v.config === undefined ? {} : { config: normalizePreferenceConfig(kind, v.config) }) } as PreferenceDraft;
}
catch {
    fail(400, 'Cấu hình cá nhân không hợp lệ.');
} }
function result(row: any): WalletPreference { try {
    text(row.id, 256);
    text(row.name, 120);
    integer(row.revision, 1);
    choice(row.kind, ['filter', 'chart', 'layout']);
    if (row.archived_at !== null && new Date(row.archived_at).toISOString() !== row.archived_at)
        throw Error();
    return { id: row.id, kind: row.kind, name: row.name, revision: row.revision, archivedAt: row.archived_at, config: normalizePreferenceConfig(row.kind, JSON.parse(row.value_json)) };
}
catch {
    fail(422, 'Cấu hình đã lưu không hợp lệ.');
} }
/** Personal configurations hold filters/layout only. They confer no financial
 * authority and never cache balances, report data or provider responses. */
export function createWalletPreferences(ports: {
    reader: WalletReader;
    write: typeof withAppWriteTransaction;
    now?: () => number;
}) {
    const store = openWalletStore({ write: ports.write }), stamp = () => new Date((ports.now ?? Date.now)()).toISOString();
    const guard = (reader: WalletReader, actor: Actor) => { assertWalletActor(reader, actor); if (reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value !== '1' || !reader.get("SELECT name FROM sqlite_master WHERE name='wallet_preferences' AND type='table'"))
        fail(409, 'Kho cấu hình Wallet chưa sẵn sàng.'); };
    return { getPreferences(actor: Actor): WalletPreferences { guard(ports.reader, actor); const rows = ports.reader.all('SELECT * FROM wallet_preferences WHERE owner_id=? ORDER BY id LIMIT 66', actor.userId); if (rows.length > 65)
            fail(413, 'Kho cấu hình cá nhân vượt giới hạn.', 'LIMIT_EXCEEDED'); const values = rows.map(result); guard(ports.reader, actor); return { filters: values.filter(v => v.kind === 'filter'), charts: values.filter(v => v.kind === 'chart'), layout: values.find(v => v.kind === 'layout') ?? null }; },
        savePreference(rawContext: CommandContext, kind: PreferenceKind, raw: PreferenceDraft, onChanged?: () => void): WalletPreference {
            const ctx = structuredClone(rawContext);
            guard(ports.reader, ctx.actor);
            const input = normalize(kind, raw);
            assertWalletCommandContext(ctx, ports.reader, !!input.id);
            return store.transaction({ actorId: ctx.actor.userId, command: 'wallet:preference:save', requestId: ctx.idempotencyKey, payloadHash: hash({ kind, revision: ctx.expectedRevision ?? 0, input }) }, tx => {
                const reader: WalletReader = { ...tx.sql, get legacy() { return tx.legacy; } };
                guard(reader, ctx.actor);
                assertWalletCommandContext(ctx, reader, !!input.id);
                const before = input.id ? tx.sql.get('SELECT * FROM wallet_preferences WHERE id=? AND owner_id=? AND kind=?', input.id, ctx.actor.userId, kind) : null;
                if (input.id && !before)
                    fail(404, 'Không tìm thấy cấu hình.');
                if (before && (before.revision !== ctx.expectedRevision || before.revision >= Number.MAX_SAFE_INTEGER))
                    fail(409, 'Cấu hình vừa thay đổi.', 'CONFLICT');
                const id = before?.id ?? randomUUID(), at = stamp(), name = input.name ?? before!.name, value = input.config === undefined ? before!.value_json : JSON.stringify(input.config), archived = input.archived === undefined ? before?.archived_at ?? null : input.archived ? before?.archived_at ?? at : null;
                if (before && name === before.name && value === before.value_json && archived === before.archived_at)
                    return result(before);
                const entries = tx.sql.all('SELECT id,kind,length(CAST(value_json AS BLOB)) AS bytes FROM wallet_preferences WHERE owner_id=? AND id!=?', ctx.actor.userId, id);
                if (!before && kind === 'layout' && entries.some(r => r.kind === 'layout'))
                    fail(409, 'Dashboard cá nhân đã tồn tại.', 'CONFLICT');
                if (entries.filter(r => r.kind === kind).length >= (kind === 'layout' ? 1 : 32) || entries.reduce((n, r) => n + r.bytes, 0) + Buffer.byteLength(value) > 1024 * 1024)
                    fail(413, 'Kho cấu hình cá nhân vượt giới hạn.', 'LIMIT_EXCEEDED');
                const revision = before ? before.revision + 1 : 1;
                if (before)
                    tx.sql.run('UPDATE wallet_preferences SET name=?,value_json=?,archived_at=?,revision=?,updated_at=?,updated_by=? WHERE id=? AND owner_id=?', name, value, archived, revision, at, ctx.actor.userId, id, ctx.actor.userId);
                else
                    tx.sql.run('INSERT INTO wallet_preferences VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, ctx.actor.userId, kind, name, value, archived, revision, at, at, ctx.actor.userId, ctx.actor.userId);
                const after = { id, kind, name, value_json: value, archived_at: archived, revision }, compact = (r: any) => ({ id: r.id, kind: r.kind, ownerId: ctx.actor.userId, nameSha256: hash(r.name), configSha256: hash(r.value_json), revision: r.revision, archivedAt: r.archived_at }), auditId = randomUUID();
                tx.audit.append({ id: auditId, recordId: null, actorId: ctx.actor.userId, action: 'wallet:preference:' + (before ? 'update' : 'create') });
                tx.metadata.audit.set({ auditId, occurredAt: at, before: before ? compact(before) : null, after: compact(after) });
                if (onChanged)
                    tx.afterCommit(onChanged);
                return result(after);
            });
        } };
}
