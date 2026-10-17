import { createHash } from 'node:crypto';
import type { Actor, CommandContext, RecordFilter, Settlement } from '../../src/features/wallet/contracts.js';
import { normalizeFilter } from '../../src/features/wallet/filter.js';
import { object, keys, text, choice } from '../../src/features/productivity/validation.js';
import type { withAppWriteTransaction } from '../appStore.js';
import { AppStoreError } from '../appErrors.js';
import { walletAccountReadScope, type WalletReader } from './access.js';
import { selectionCommandContext, selectionReader, assertSelectionStorage, normalizeSelectionInput, normalizeSelectionIds, readSelection } from './selections.js';
import { selectionFilterHash } from './selectionSchema.js';
import { checkWalletCatalog } from './records.js';
export interface RecordMetadataPatch {
    categoryId?: string | null;
    labelIds?: string[];
    settlementStatus?: Exclude<Settlement, 'voided'>;
    payee?: string;
    note?: string;
}
export type BulkSelection = {
    ids: string[];
    revisions: Record<string, number>;
} | {
    selectionId: string;
    filter?: RecordFilter;
    excludeIds?: string[];
};
export interface BulkResult {
    matched: number;
    updated: number;
    unchanged: number;
    selectionId?: string;
    selectionRevision?: number;
}
const fail = (status: number, message: string, code = 'wallet-bulk'): never => { throw new AppStoreError(message, status, code); };
function patch(raw: unknown): RecordMetadataPatch { try {
    const value = object(raw);
    keys(value, ['categoryId', 'labelIds', 'settlementStatus', 'payee', 'note']);
    if (!Object.keys(value).length || Object.values(value).some(value => value === undefined))
        throw Error();
    const result: RecordMetadataPatch = {};
    if ('categoryId' in value) {
        if (value.categoryId !== null)
            text(value.categoryId, 256);
        result.categoryId = value.categoryId as string | null;
    }
    if ('labelIds' in value) {
        const ids = normalizeSelectionIds(value.labelIds, 20);
        result.labelIds = ids.sort();
    }
    if ('settlementStatus' in value) {
        choice(value.settlementStatus, ['uncleared', 'cleared', 'reconciled']);
        result.settlementStatus = value.settlementStatus;
    }
    for (const key of ['payee', 'note'] as const)
        if (key in value) {
            text(value[key], key === 'note' ? 100000 : 500, false);
            result[key] = value[key];
        }
    return result;
}
catch (error) {
    if (error instanceof AppStoreError)
        throw error;
    fail(400, 'Chỉ cho phép thay đổi metadata hợp lệ.');
} }
function target(raw: unknown): BulkSelection { try {
    const value = object(raw);
    if ('selectionId' in value) {
        keys(value, ['selectionId', 'filter', 'excludeIds']);
        text(value.selectionId, 256);
        const result: BulkSelection = { selectionId: value.selectionId };
        if ('filter' in value)
            result.filter = normalizeFilter(value.filter as RecordFilter);
        result.excludeIds = normalizeSelectionIds(value.excludeIds ?? []).sort();
        return result;
    }
    const result = normalizeSelectionInput(value);
    if ('filter' in result)
        throw Error();
    return result;
}
catch (error) {
    if (error instanceof AppStoreError)
        throw error;
    fail(400, 'Vùng chọn cập nhật không hợp lệ.');
} }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Bindings = Record<string, string | number | null>;
function bind(sql: string, values: Bindings): Bindings { return Object.fromEntries([...new Set(sql.match(/@[A-Za-z][A-Za-z0-9]*/g) ?? [])].map(key => [key.slice(1), values[key.slice(1)]])); }
function prepare(reader: WalletReader, actor: Actor, selection: BulkSelection, patch: RecordMetadataPatch, time: number, revision?: number) {
    assertSelectionStorage(reader, actor);
    const values: Bindings = { actor: actor.userId, labels: JSON.stringify(patch.labelIds ?? []), note: patch.note ?? null, payee: patch.payee ?? null, category: patch.categoryId ?? null, status: patch.settlementStatus ?? null, at: new Date(time).toISOString() }, scope = walletAccountReadScope(reader, actor).sql.replace(/\?/g, '@actor');
    let chosen: string;
    if ('selectionId' in selection) {
        const summary = readSelection(reader, actor, selection.selectionId, time);
        if (revision !== undefined && revision !== summary.revision)
            fail(409, 'Vùng chọn đã thay đổi.', 'edit-conflict');
        const source = reader.get('SELECT source_kind,filter_hash FROM wallet_selections WHERE id=?', selection.selectionId);
        if (source.source_kind === 'filter' ? !selection.filter || selectionFilterHash(selection.filter) !== source.filter_hash : selection.filter !== undefined)
            fail(400, 'Bộ lọc không khớp vùng chọn.');
        values.selection = selection.selectionId;
        values.exclusions = JSON.stringify(selection.excludeIds ?? []);
        if (reader.get('SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM wallet_selection_records s WHERE s.selection_id=? AND s.record_id=e.value) LIMIT 1', values.exclusions, selection.selectionId))
            fail(400, 'Chỉ được bỏ chọn ID trong vùng chọn.');
        chosen = 'SELECT record_id AS id,record_revision AS revision FROM wallet_selection_records WHERE selection_id=@selection AND record_id NOT IN(SELECT value FROM json_each(@exclusions))';
    }
    else {
        if (revision !== undefined && revision !== 0)
            fail(409, 'Phiên bản vùng chọn trực tiếp phải bằng 0.', 'edit-conflict');
        values.entries = JSON.stringify(selection.ids.map(id => ({ id, revision: selection.revisions[id] })));
        chosen = "SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.revision') AS revision FROM json_each(@entries)";
    }
    const prefix = 'WITH chosen AS(' + chosen + '),scope AS(SELECT a.id,(' + scope + ') AS permission FROM wallet_accounts a),targets AS(SELECT id FROM chosen UNION SELECT f.fee_record_id FROM wallet_transfer_fees f JOIN chosen c ON c.id=f.transfer_record_id) ';
    const get = (sql: string) => reader.get(prefix + sql, bind(prefix + sql, values));
    // Never disclose a private member of a selection or apply a visible subset.
    if (get("SELECT 1 FROM targets t LEFT JOIN wallet_records r ON r.id=t.id WHERE r.id IS NULL OR NOT EXISTS(SELECT 1 FROM wallet_postings p WHERE p.record_id=t.id) OR EXISTS(SELECT 1 FROM wallet_postings p LEFT JOIN scope s ON s.id=p.account_id WHERE p.record_id=t.id AND COALESCE(s.permission,'none') NOT IN('read','contribute','manage')) LIMIT 1"))
        fail(404, 'Không tìm thấy toàn bộ giao dịch có thể sửa.');
    if (get("SELECT 1 FROM targets t JOIN wallet_records r ON r.id=t.id WHERE EXISTS(SELECT 1 FROM wallet_postings p JOIN scope s ON s.id=p.account_id WHERE p.record_id=t.id AND(s.permission='read' OR r.creator_id!=@actor AND s.permission!='manage')) LIMIT 1"))
        fail(403, 'Không có quyền sửa toàn bộ vùng chọn.');
    if (get("SELECT 1 FROM chosen c JOIN wallet_records r ON r.id=c.id WHERE r.kind='trade' OR r.settlement_status='voided' OR r.occurrence_id IS NOT NULL OR EXISTS(SELECT 1 FROM wallet_transfer_fees f WHERE f.fee_record_id=r.id) OR EXISTS(SELECT 1 FROM wallet_allocations a WHERE a.record_id=r.id) LIMIT 1"))
        fail(409, 'Vùng chọn có giao dịch cần quy trình riêng.');
    if (get('SELECT 1 FROM chosen c JOIN wallet_records r ON r.id=c.id WHERE r.revision!=c.revision OR r.revision>=9007199254740991 LIMIT 1'))
        fail(409, 'Có giao dịch đã thay đổi; hãy chọn lại.', 'edit-conflict');
    if (get('SELECT 1 FROM chosen c JOIN wallet_records r ON r.id=c.id LEFT JOIN wallet_record_metadata m ON m.record_id=c.id LEFT JOIN users u ON u.id=r.creator_id WHERE m.record_id IS NULL OR u.id IS NULL LIMIT 1'))
        fail(422, 'Metadata giao dịch không đầy đủ.');
    if (get('SELECT 1 FROM chosen c JOIN wallet_record_metadata m ON m.record_id=c.id WHERE (m.created_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=m.created_by)) OR (m.updated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=m.updated_by)) LIMIT 1'))
        fail(422, 'Không tìm thấy tác giả metadata.');
    const metadata = (after: boolean) => "json_object('recordId',m.record_id,'createdAt',m.created_at,'updatedAt'," + (after ? '@at' : 'm.updated_at') + ",'createdBy',m.created_by,'updatedBy'," + (after ? '@actor' : 'm.updated_by') + ",'occurredAt',m.occurred_at,'payee'," + (after && 'payee' in patch ? '@payee' : 'm.payee') + ",'paymentMethod',m.payment_method,'reviewedAt',m.reviewed_at)";
    if (get('SELECT 1 FROM chosen c JOIN wallet_record_metadata m ON m.record_id=c.id WHERE fo_wallet_valid_record_metadata(' + metadata(false) + ')!=1 OR fo_wallet_valid_record_metadata(' + metadata(true) + ')!=1 LIMIT 1'))
        fail(422, 'Metadata giao dịch không hợp lệ.');
    const matched = get('SELECT count(*) AS n FROM chosen').n as number;
    if (patch.categoryId !== undefined && patch.categoryId !== null) {
        const retained = !get('SELECT 1 FROM chosen c JOIN wallet_records r ON r.id=c.id WHERE r.category_id IS NOT @category LIMIT 1');
        checkWalletCatalog(reader, patch.categoryId, [], retained ? { record: { categoryId: patch.categoryId }, labelIds: [] } : undefined);
    }
    if (patch.labelIds) {
        const retained = patch.labelIds.filter(label => !reader.get(prefix + 'SELECT 1 FROM chosen c WHERE NOT EXISTS(SELECT 1 FROM wallet_record_labels l WHERE l.record_id=c.id AND l.label_id=@label) LIMIT 1', bind(prefix + 'SELECT @label', { ...values, label })));
        checkWalletCatalog(reader, null, patch.labelIds, { record: {}, labelIds: retained });
    }
    const changed = [...('categoryId' in patch ? ['r.category_id IS NOT @category'] : []), ...('settlementStatus' in patch ? ['r.settlement_status IS NOT @status'] : []), ...('note' in patch ? ['r.note IS NOT @note'] : []), ...('payee' in patch ? ['m.payee IS NOT @payee'] : []), ...('labelIds' in patch ? ["EXISTS(SELECT 1 FROM wallet_record_labels l WHERE l.record_id=r.id AND l.label_id NOT IN(SELECT value FROM json_each(@labels))) OR EXISTS(SELECT 1 FROM json_each(@labels) j WHERE NOT EXISTS(SELECT 1 FROM wallet_record_labels l WHERE l.record_id=r.id AND l.label_id=j.value))"] : [])].map(sql => '(' + sql + ')').join(' OR ');
    const changedFrom = 'FROM chosen c JOIN wallet_records r ON r.id=c.id JOIN wallet_record_metadata m ON m.record_id=r.id WHERE ' + changed, updated = get('SELECT count(*) AS n ' + changedFrom).n as number;
    return { prefix, values, matched, updated, changedFrom };
}
function metadataState(after: boolean, patch: RecordMetadataPatch): string { const field = (key: keyof RecordMetadataPatch, before: string, param: string) => after && key in patch ? param : before, labels = after && 'labelIds' in patch ? '@labels' : "(SELECT json_group_array(label_id) FROM(SELECT label_id FROM wallet_record_labels WHERE record_id=r.id ORDER BY label_id))"; return "json_object('revision'," + (after ? 'r.revision+1' : 'r.revision') + ",'categoryId'," + field('categoryId', 'r.category_id', '@category') + ",'settlementStatus'," + field('settlementStatus', 'r.settlement_status', '@status') + ",'labelIds',json(" + labels + "),'textDigests',json_object('note',json(fo_wallet_text_metrics(" + field('note', 'r.note', '@note') + ")),'payee',json(fo_wallet_text_metrics(" + field('payee', 'm.payee', '@payee') + "))))"; }
export function createWalletBulk(options: {
    reader: WalletReader;
    write: typeof withAppWriteTransaction;
    now?: () => number;
}) {
    const now = options.now ?? Date.now;
    return {
        preview(actor: Actor, rawSelection: BulkSelection, rawPatch: RecordMetadataPatch) { const selection = target(rawSelection), value = patch(rawPatch), prepared = prepare(options.reader, actor, selection, value, now()), { prefix, values, matched, updated, changedFrom } = prepared, sql = prefix + 'SELECT r.id,r.revision,r.category_id,r.settlement_status,substr(r.note,1,500) AS note,length(r.note)>500 AS note_truncated,m.payee,(SELECT json_group_array(label_id) FROM(SELECT label_id FROM wallet_record_labels WHERE record_id=r.id ORDER BY label_id)) AS labels ' + changedFrom + ' ORDER BY r.id LIMIT 5'; const samples = options.reader.all(sql, bind(sql, values)).map(row => { const before = { revision: row.revision, categoryId: row.category_id, settlementStatus: row.settlement_status, note: row.note, payee: row.payee, labelIds: JSON.parse(row.labels), noteTruncated: !!row.note_truncated }; return { id: row.id, before, after: { ...before, ...value, ...('note' in value ? { note: value.note!.slice(0, 500), noteTruncated: value.note!.length > 500 } : {}), revision: row.revision + 1 } }; }); prepare(options.reader, actor, selection, value, now()); return { matched, updated, unchanged: matched - updated, intentHash: hash({ selection, patch: value }), samples }; },
        apply(ctx: CommandContext, rawSelection: BulkSelection, rawPatch: RecordMetadataPatch, onChanged?: (audience: Set<string>) => void): BulkResult {
            const selection = target(rawSelection), value = patch(rawPatch), editing = 'selectionId' in selection;
            selectionCommandContext(ctx, options.reader, editing);
            // The cache contains only this actor's counts/operation identity. Current
            // actor + activation gates run even for replay; no financial body is cached.
            return options.write({ actorId: ctx.actor.userId, command: 'wallet:record:bulk-metadata', requestId: ctx.idempotencyKey, payloadHash: hash({ selection, patch: value, revision: ctx.expectedRevision ?? 0 }) }, tx => {
                const reader = selectionReader(tx);
                selectionCommandContext(ctx, reader, editing);
                const time = now(), at = new Date(time).toISOString(), { prefix, values, matched, updated, changedFrom } = prepare(reader, ctx.actor, selection, value, time, ctx.expectedRevision ?? 0);
                values.at = at;
                tx.exec('CREATE TEMP TABLE fo_wallet_bulk_work(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL)');
                const stage = prefix + 'INSERT INTO temp.fo_wallet_bulk_work SELECT r.id,fo_wallet_uuid(),' + metadataState(false, value) + ',' + metadataState(true, value) + ' ' + changedFrom;
                tx.run(stage, bind(stage, values));
                tx.run("INSERT INTO wallet_audit SELECT audit_id,id,?,'wallet:record:bulk-metadata' FROM temp.fo_wallet_bulk_work ORDER BY id", ctx.actor.userId);
                tx.run('INSERT INTO wallet_audit_metadata SELECT audit_id,?,before_json,after_json FROM temp.fo_wallet_bulk_work', at);
                const sets = ['revision=revision+1', ...('categoryId' in value ? ['category_id=@category'] : []), ...('settlementStatus' in value ? ['settlement_status=@status'] : []), ...('note' in value ? ['note=@note'] : [])], records = 'UPDATE wallet_records SET ' + sets.join(',') + ' WHERE id IN(SELECT id FROM temp.fo_wallet_bulk_work)';
                tx.run(records, bind(records, values));
                const meta = 'UPDATE wallet_record_metadata SET updated_at=@at,updated_by=@actor' + ('payee' in value ? ',payee=@payee' : '') + ' WHERE record_id IN(SELECT id FROM temp.fo_wallet_bulk_work)';
                tx.run(meta, bind(meta, values));
                if (value.labelIds) {
                    tx.run('DELETE FROM wallet_record_labels WHERE record_id IN(SELECT id FROM temp.fo_wallet_bulk_work)');
                    tx.run('INSERT INTO wallet_record_labels SELECT w.id,j.value FROM temp.fo_wallet_bulk_work w CROSS JOIN json_each(?) j', JSON.stringify(value.labelIds));
                }
                if ('selectionId' in selection)
                    tx.run("UPDATE wallet_selections SET state='applied',revision=2,applied_at=?,applied_request_id=? WHERE id=?", at, ctx.idempotencyKey, selection.selectionId);
                if (onChanged && updated) {
                    const audience = new Set<string>();
                    for (const user of tx.legacy.users.filter(user => !user.isDeleted && ['admin', 'member'].includes(user.role))) {
                        const who: Actor = { userId: user.id, role: user.role }, scope = walletAccountReadScope(reader, who);
                        if (reader.get("SELECT 1 FROM temp.fo_wallet_bulk_work w JOIN wallet_postings p ON p.record_id=w.id JOIN wallet_accounts a ON a.id=p.account_id WHERE (" + scope.sql + ") IN('read','contribute','manage') LIMIT 1", ...scope.args))
                            audience.add(user.id);
                    }
                    tx.afterCommit(() => onChanged(audience));
                }
                tx.exec('DROP TABLE temp.fo_wallet_bulk_work');
                return { matched, updated, unchanged: matched - updated, ...('selectionId' in selection ? { selectionId: selection.selectionId, selectionRevision: 2 } : {}) };
            });
        },
    };
}
