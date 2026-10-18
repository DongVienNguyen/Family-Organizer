import {setImmediate as yieldPreview} from 'node:timers/promises';
import {prepareImportBatch,prepareImportBatchAsync,applyImportBatch,type PreparedImportBatch} from './importBatch.js';
import { importHash as hash } from './importHash.js';
import { createHash, randomUUID } from 'node:crypto';
import type { Actor, CommandContext } from '../../src/features/wallet/contracts.js';
import { normalizeImportMapping, type ImportMapping, type ImportFormat, type ImportBatch, type ImportPreviewPage } from '../../src/features/wallet/importContracts.js';
import { text, choice, integer } from '../../src/features/productivity/validation.js';
import { AppStoreError } from '../appErrors.js';
import { assertWalletActor, createWalletAccess, type WalletReader } from './access.js';
import { assertWalletCommandContext } from './accounts.js';
import { openWalletStore, type WalletTx } from './store.js';
import { createWalletRecords, validateWalletRecordDraft, checkWalletCatalog } from './records.js';
import { mapImportRows, type MappedImportRow } from './importMapping.js';
import { parseCsv, parseSpreadsheet, inspectSpreadsheet, parseOfx, type ImportMatrix } from './parsers/index.js';
import { inputBytes } from './parsers/common.js';
import type { withAppWriteTransaction } from '../appStore.js';
export interface ImportFiles {
    stage(bytes: Uint8Array): string;
    read(key: string): Buffer;
    remove(key: string, expected?: {
        size: number;
        sha256: string;
    }): boolean;
}
export interface ImportFile {
    accountId: string;
    fileName: string;
    format: ImportFormat;
    bytes: Uint8Array;
}
type PreviewRow = Omit<MappedImportRow, 'status'> & {
    status: MappedImportRow['status'] | 'duplicate';
};
const fail = (status: number, message: string, code = 'INVALID_INPUT'): never => { throw new AppStoreError(message, status, code); };
const digest = (raw: Uint8Array | string) => createHash('sha256').update(raw).digest('hex');
const txReader = (tx: WalletTx): WalletReader => ({ ...tx.sql, get legacy() { return tx.legacy; } });
const counts = { validCount: 0, errorCount: 0, duplicateCount: 0, excludedCount: 0, importedCount: 0, undoneCount: 0, keptCount: 0 };
function batchDto(row: any): ImportBatch { const p = JSON.parse(row.preview_json); return { id: row.id, accountId: row.account_id, fileName: row.file_name, format: row.format, state: row.state, revision: row.revision, createdAt: row.created_at, expiresAt: row.expires_at, ...counts, ...(p.mapping ? { mapping: normalizeImportMapping(p.mapping) } : {}), ...(p.jobId ? { jobId: p.jobId } : {}), ...(p.errorCode ? { errorCode: p.errorCode } : {}), ...Object.fromEntries(Object.keys(counts).map(k => [k, p[k] ?? 0])), sheetNames: p.sheetNames ?? [] }; }
/** File IO and parsing precede I01. The one synchronous writer owns preview,
 * provenance, ledger, audit and retry receipt. Import factories own no jobs or DB. */
export function createWalletImports(ports: {
    reader: WalletReader;
    write: typeof withAppWriteTransaction;
    files: ImportFiles;
    now?: () => number;
    enqueue?: (input: {
        key: string;
        payload: {
            batchId: string;
            revision: number;
            actorId: string;
        };
    }) => string;
}) {
    const now = ports.now ?? Date.now, store = openWalletStore({ write: ports.write }), records = createWalletRecords(ports), stamp = () => new Date(now()).toISOString();
    const guard = (reader: WalletReader, actor: Actor) => { assertWalletActor(reader, actor); if (reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value !== '1' || !reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_import_batches'"))
        fail(409, 'Kho nhập dữ liệu Wallet chưa sẵn sàng.'); };
    const target = (reader: WalletReader, actor: Actor, accountId: string, writing = false) => { guard(reader, actor); const value = createWalletAccess(reader).getAccount(actor, accountId); if (writing && (value.permission === 'read' || value.archivedAt !== null))
        fail(value.permission === 'read' ? 403 : 409, 'Tài khoản không cho phép nhập dữ liệu.'); return value; };
    const owned = (reader: WalletReader, actor: Actor, id: string, writing = false) => { guard(reader, actor); text(id, 256); const row = reader.get('SELECT * FROM wallet_import_batches WHERE id=? AND owner_id=?', id, actor.userId); if (!row)
        fail(404, 'Không tìm thấy bản nhập.'); target(reader, actor, row.account_id, writing); return row; };
    const pending = (row: any, queued = false) => { if (Date.parse(row.expires_at) <= now())
        fail(410, 'Bản nhập đã hết hạn.', 'IMPORT_EXPIRED'); if (!['staged', 'preview', ...(queued ? ['queued'] : [])].includes(row.state))
        fail(409, 'Trạng thái bản nhập đã thay đổi.', 'CONFLICT'); };
    const expected = (ctx: CommandContext, row: any) => { if (ctx.expectedRevision !== row.revision || row.revision >= Number.MAX_SAFE_INTEGER)
        fail(409, 'Bản nhập vừa thay đổi.', 'CONFLICT'); };
    const command = <T>(ctx: CommandContext, name: string, payload: unknown, fn: (tx: WalletTx) => T) => store.transaction({ actorId: ctx.actor.userId, command: 'wallet:import:' + name, requestId: ctx.idempotencyKey, payloadHash: hash(payload) }, fn);
    const audit = (tx: WalletTx, ctx: CommandContext, name: string, before: any, after: any) => { const id = randomUUID(); tx.audit.append({ id, recordId: null, actorId: ctx.actor.userId, action: 'wallet:import:' + name }); const compact = (r: any) => r ? { id: r.id, accountId: r.account_id, revision: r.revision, state: r.state, fileSha256: r.file_sha256, previewSha256: hash(r.preview_json) } : null; tx.metadata.audit.set({ auditId: id, occurredAt: stamp(), before: compact(before), after: compact(after) }); };
    const update = (tx: WalletTx, ctx: CommandContext, before: any, state: ImportBatch['state'], preview: any) => { tx.sql.run('UPDATE wallet_import_batches SET state=?,revision=revision+1,updated_at=?,preview_json=? WHERE id=?', state, stamp(), JSON.stringify(preview), before.id); const after = tx.sql.get('SELECT * FROM wallet_import_batches WHERE id=?', before.id); audit(tx, ctx, state, before, after); return batchDto(after); };
    const rows = (reader: WalletReader, id: string): PreviewRow[] => reader.all('SELECT value_json FROM wallet_import_rows WHERE batch_id=? ORDER BY row_number LIMIT 10002', id).map(row => JSON.parse(row.value_json));
    const duplicate = (reader: WalletReader, row: PreviewRow): 'new' | 'same' | 'changed' => { const record = reader.get("SELECT id FROM wallet_records WHERE source='import' AND external_key=?", row.sourceKey); if (!record)
        return 'new'; const entry = reader.get('SELECT source_fingerprint FROM wallet_import_entries WHERE record_id=?', record.id); return entry?.source_fingerprint === row.sourceFingerprint ? 'same' : 'changed'; };
    function queuedFailure(ctx:CommandContext,id:string,revision:number,signal:AbortSignal,error:unknown):ImportBatch {
        // Financial writes and their nonce have rolled back. Record only a compact
        // safe outcome in a separate short, lease-fenced I01 command for the owner.
        if (!signal.aborted)
            try {
                const failed = command({ ...ctx, idempotencyKey: ctx.idempotencyKey + '-failed' }, 'failure', { id, revision }, tx => { const reader = txReader(tx), before = owned(reader, ctx.actor, id, true); if (before.state !== 'queued' || before.revision !== revision)
                    return batchDto(before); const p = JSON.parse(before.preview_json); if (Date.parse(before.expires_at) <= now())
                    tx.sql.run('DELETE FROM wallet_import_rows WHERE batch_id=?', id); return update(tx, ctx, before, Date.parse(before.expires_at) <= now() ? 'expired' : 'preview', { ...p, errorCode: error instanceof AppStoreError ? 'IMPORT_REVIEW_REQUIRED' : 'IMPORT_APPLY_FAILED' }); });
                if (failed.state !== 'queued')
                    return failed;
            }
            catch { /* Lease/ACL revocation must never create a substitute write. */ }
        throw error;
    }
    const result = {
        getBatch(actor: Actor, id: string): ImportBatch { const row = owned(ports.reader, actor, id), value = batchDto(row); if (value.jobId && ports.reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='app_jobs'"))
            value.jobStatus = ports.reader.get('SELECT status FROM app_jobs WHERE id=?', value.jobId)?.status ?? 'unavailable'; return value; },
        history(actor: Actor, offset = 0) { guard(ports.reader, actor); integer(offset, 0, 100000); const ids = ports.reader.all('SELECT id,account_id FROM wallet_import_batches WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?', actor.userId, offset); const visible = ids.filter(row => { try {
            target(ports.reader, actor, row.account_id);
            return true;
        }
        catch (e) {
            if (e instanceof AppStoreError && [403, 404].includes(e.status))
                return false;
            throw e;
        } }); guard(ports.reader, actor); return { batches: visible.slice(0, 50).map(row => batchDto(owned(ports.reader, actor, row.id))), hasMore: ids.length > 50 }; },
        async stageImport(rawContext: CommandContext, raw: ImportFile): Promise<ImportBatch> {
            const ctx = structuredClone(rawContext);
            assertWalletCommandContext(ctx, ports.reader);
            text(raw.accountId, 256);
            target(ports.reader, ctx.actor, raw.accountId, true);
            choice(raw.format, ['csv', 'xls', 'xlsx', 'ofx']);
            text(raw.fileName, 240);
            if (/[\\/\x00-\x1f\x7f]/.test(raw.fileName))
                fail(400, 'Tên tệp không hợp lệ.');
            const bytes = Buffer.from(inputBytes(raw.bytes)), input = { accountId: raw.accountId, fileName: raw.fileName, format: raw.format, sha256: digest(bytes), size: bytes.length };
            // Cached I01 receipts must be recovered before creating another private file.
            if (ports.reader.get("SELECT 1 AS cached FROM app_commands WHERE actor_id=? AND command='wallet:import:stage' AND request_id=?", ctx.actor.userId, ctx.idempotencyKey))
                return command(ctx, 'stage', input, () => fail(409, 'Biên nhận bản nhập vừa thay đổi.'));
            const inspected = raw.format === 'xls' || raw.format === 'xlsx' ? await inspectSpreadsheet(bytes, raw.format) : { sheetNames: [] };
            target(ports.reader, ctx.actor, input.accountId, true);
            const key = ports.files.stage(bytes);
            try {
                return command(ctx, 'stage', input, tx => { const reader = txReader(tx); assertWalletCommandContext(ctx, reader); const account = target(reader, ctx.actor, input.accountId, true), quota = reader.get("SELECT count(*) AS n,COALESCE(sum(file_size),0) AS bytes FROM wallet_import_batches WHERE owner_id=? AND state IN('staged','preview','queued') AND expires_at>?", ctx.actor.userId, stamp()); if (quota.n >= 5 || quota.bytes + bytes.length > 100 * 1024 * 1024)
                    fail(413, 'Tối đa5 bản nhập đang chờ.', 'LIMIT_EXCEEDED'); const id = randomUUID(), at = stamp(); tx.sql.run('INSERT INTO wallet_import_batches VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, ctx.actor.userId, input.accountId, input.format, input.fileName, key, input.sha256, null, input.size, 'staged', 1, account.revision, at, new Date(Date.parse(at) + 86400000).toISOString(), at, JSON.stringify({ ...counts, sheetNames: inspected.sheetNames })); const after = reader.get('SELECT * FROM wallet_import_batches WHERE id=?', id); audit(tx, ctx, 'stage', null, after); return batchDto(after); });
            }
            catch (error) {
                if (!ports.reader.get('SELECT 1 AS claimed FROM wallet_import_batches WHERE file_key=?', key))
                    ports.files.remove(key);
                throw error;
            }
        },
        async previewImport(rawContext: CommandContext, id: string, rawMapping: ImportMapping): Promise<ImportBatch> {
            const ctx = structuredClone(rawContext);
            assertWalletCommandContext(ctx, ports.reader, true);
            const before = owned(ports.reader, ctx.actor, id, true);
            let mapping: ImportMapping;
            try {
                mapping = normalizeImportMapping(rawMapping);
            }
            catch {
                fail(400, 'Ánh xạ cột không hợp lệ.');
            }
            if (ports.reader.get("SELECT 1 AS cached FROM app_commands WHERE actor_id=? AND command='wallet:import:preview' AND request_id=?", ctx.actor.userId, ctx.idempotencyKey))
                return command(ctx, 'preview', { id, revision: ctx.expectedRevision, mapping, fileSha256: before.file_sha256 }, () => fail(409, 'Biên nhận preview vừa thay đổi.'));
            pending(before);
            expected(ctx, before);
            const bytes = ports.files.read(before.file_key);
            if (bytes.length !== before.file_size || digest(bytes) !== before.file_sha256)
                fail(422, 'Tệp nhập không còn khớp checksum.', 'IMPORT_INTEGRITY');
            let matrix: ImportMatrix, ofx: Parameters<typeof mapImportRows>[2]['ofx'];
            if (before.format === 'csv')
                matrix = parseCsv(bytes, { ...mapping, delimiter: mapping.delimiter ?? ',' });
            else if (before.format === 'xls' || before.format === 'xlsx')
                matrix = await parseSpreadsheet(bytes, { ...mapping, kind: before.format, sheet: mapping.sheet ?? '' });
            else {
                const statement = parseOfx(bytes);
                matrix = { totalRows: statement.rows.length, rows: statement.rows.map(row => ({ rowNumber: row.rowNumber, cells: [row.postedAt, row.amount, row.payee, row.note, statement.currency].map(value => ({ type: 'text' as const, value })) })) };
                ofx = { namespace: statement.namespace, rows: Object.fromEntries(statement.rows.map(row => [row.rowNumber, { fitId: row.fitId, type: row.type, errors: row.errors }])) };
                if (mapping.headerRow !== null || mapping.dateFormat !== 'ofx' || mapping.dateColumn !== 1 || mapping.amount.mode !== 'signed' || mapping.amount.column !== 2 || mapping.currencyColumn !== 5)
                    fail(400, 'OFX cần giữ các cột ngày/số tiền/tiền tệ nguồn.');
            }
            if (matrix.rows.filter(row => row.rowNumber !== mapping.headerRow).length > 10000)
                fail(413, 'Bản nhập hỗ trợ tối đa10.000 dòng dữ liệu.', 'LIMIT_EXCEEDED');
            const account = target(ports.reader, ctx.actor, before.account_id, true), categories = ports.reader.all('SELECT id,name,parent_id FROM wallet_categories WHERE archived_at IS NULL ORDER BY id LIMIT 10001'), labels = ports.reader.all('SELECT id,name FROM wallet_labels WHERE archived_at IS NULL ORDER BY id LIMIT 10001');
            if (categories.length > 10000 || labels.length > 10000)
                fail(413, 'Danh mục vượt giới hạn.', 'LIMIT_EXCEEDED');
            const byId = new Map(categories.map(row => [row.id, row]));
            const choices = categories.map(row => { const names = [row.name], seen = new Set([row.id]); let current = row; while (current.parent_id !== null) {
                current = byId.get(current.parent_id);
                if (!current || seen.has(current.id))
                    break;
                seen.add(current.id);
                names.unshift(current.name);
            } return { id: row.id, name: row.name, path: names.join(' / ') }; });
            const parsed = mapImportRows(matrix, mapping, { accountId: before.account_id, currency: account.currency, batchId: id, format: before.format, categories: choices, labels, ofx });
            let allRows: PreviewRow[] = parsed.rows;
            const seen = new Map<string, string>();
            const reviewed:PreviewRow[]=[];
            for(let index=0;index<allRows.length;index++){if(index%128===0)await yieldPreview();const row=allRows[index];reviewed.push((() => { if (row.status !== 'valid' || !row.draft)
                return row; try {
                validateWalletRecordDraft(ports.reader, ctx.actor, row.draft);
            }
            catch {
                return { ...row, status: 'error', draft: null, errors: [...row.errors, 'INVALID_RECORD'] };
            } if (before.format === 'ofx') {
                const prior = seen.get(row.sourceKey), existing = duplicate(ports.reader, row);
                if (prior !== undefined || existing !== 'new') {
                    if (prior !== undefined && prior !== row.sourceFingerprint || existing === 'changed')
                        return { ...row, status: 'error', draft: null, errors: [...row.errors, 'SOURCE_CONFLICT'] };
                    return { ...row, status: 'duplicate' };
                }
                seen.set(row.sourceKey, row.sourceFingerprint);
            } return row; })());}
            allRows=reviewed;
            const serial = allRows.map(row => JSON.stringify(row));
            if (serial.some(row => Buffer.byteLength(row) > 512000) || serial.reduce((n, row) => n + Buffer.byteLength(row), 0) > 50 * 1024 * 1024)
                fail(413, 'Preview vượt50MiB.', 'LIMIT_EXCEEDED');
            const summary = { ...counts, sheetNames: JSON.parse(before.preview_json).sheetNames ?? [], mapping, rowsHash: hash(allRows), validCount: allRows.filter(r => r.status === 'valid').length, errorCount: allRows.filter(r => r.status === 'error').length, duplicateCount: allRows.filter(r => r.status === 'duplicate').length, excludedCount: allRows.filter(r => r.status === 'excluded').length };
            return command(ctx, 'preview', { id, revision: ctx.expectedRevision, mapping, fileSha256: before.file_sha256 }, tx => { const reader = txReader(tx), current = owned(reader, ctx.actor, id, true); pending(current); expected(ctx, current); if (target(reader, ctx.actor, current.account_id, true).revision !== account.revision)
                fail(409, 'Tài khoản vừa thay đổi.', 'CONFLICT');
                const currentCategories=new Set<string>(),currentLabels=new Set<string>();for(const row of allRows)if(row.status==='valid'&&row.draft){if(row.draft.categoryId)currentCategories.add(row.draft.categoryId);for(const allocation of row.draft.allocations??[])currentCategories.add(allocation.categoryId);for(const label of row.draft.labelIds??[])currentLabels.add(label);}
                for(const category of currentCategories)checkWalletCatalog(reader,category,[]);checkWalletCatalog(reader,null,[...currentLabels]);
                tx.sql.run('DELETE FROM wallet_import_rows WHERE batch_id=?', id);tx.sql.run("INSERT INTO wallet_import_rows SELECT ?,CAST(json_extract(value,'$.rowNumber') AS INTEGER),value FROM json_each(?)",id,'['+serial.join(',')+']'); tx.sql.run('UPDATE wallet_import_batches SET account_revision=? WHERE id=?', account.revision, id); return update(tx, ctx, current, 'preview', summary); });
        },
        previewRows(actor: Actor, id: string, offset = 0): ImportPreviewPage { const batch = owned(ports.reader, actor, id); integer(offset, 0, 10001); const total = ports.reader.get('SELECT count(*) AS n FROM wallet_import_rows WHERE batch_id=?', id).n, values = ports.reader.all('SELECT value_json FROM wallet_import_rows WHERE batch_id=? ORDER BY row_number LIMIT 100 OFFSET ?', id, offset).map(row => { const v = JSON.parse(row.value_json); return { rowNumber: v.rowNumber, status: v.status, errors: v.errors, warnings: v.warnings, rawCells: v.rawCells, draft: v.draft }; }); owned(ports.reader, actor, id); return { id, revision: batch.revision, total, offset, rows: values }; },
        commitImport(ctx: CommandContext, id: string, previewRevision: number, onChanged?: () => void, queued = false, preparedBatch?:PreparedImportBatch): ImportBatch {
            assertWalletCommandContext(ctx, ports.reader, true);
            owned(ports.reader, ctx.actor, id, true);
            integer(previewRevision, 1);
            if (ctx.expectedRevision !== previewRevision)
                fail(409, 'Chọn đúng phiên bản preview.', 'CONFLICT');
            const prepared=preparedBatch??prepareImportBatch(rows(ports.reader,id),{actorId:ctx.actor.userId,batchId:id,at:stamp()});
            return command(ctx, 'commit', { id, previewRevision, queued }, tx => {
                const reader = txReader(tx), before = owned(reader, ctx.actor, id, true);
                pending(before, queued);
                expected(ctx, before);
                if (before.state !== (queued ? 'queued' : 'preview'))
                    fail(409, 'Cần xem preview trước.', 'CONFLICT');
                const p = JSON.parse(before.preview_json), values = rows(reader, id);
                if (hash(values) !== p.rowsHash || values.length > 10001 || target(reader, ctx.actor, before.account_id, true).revision !== before.account_revision)
                    fail(409, 'Preview hoặc tài khoản đã thay đổi.', 'CONFLICT');
                if (p.errorCount || !(p.validCount + p.duplicateCount))
                    fail(422, 'Sửa hoặc loại trừ dòng lỗi; cần ít nhất một dòng hợp lệ hoặc đã nhập.');
                const earlier = new Map<string, string>();
                for (const row of values) {
                    const current = duplicate(reader, row);
                    if (row.status === 'valid') {
                        if (current !== 'new' || earlier.has(row.sourceKey))
                            fail(409, 'Nguồn trùng đã thay đổi; cần preview lại.', 'CONFLICT');
                        earlier.set(row.sourceKey, row.sourceFingerprint);
                    }
                    else if (row.status === 'duplicate' && current !== 'same' && !(current === 'new' && earlier.get(row.sourceKey) === row.sourceFingerprint))
                        fail(409, 'Nguồn trùng đã thay đổi; cần preview lại.', 'CONFLICT');
                }
                const importedCount=applyImportBatch(tx,ctx,prepared,id,p.rowsHash);
                if (importedCount !== p.validCount)
                    fail(409, 'Số dòng preview không khớp.', 'CONFLICT');
                tx.sql.run('DELETE FROM wallet_import_rows WHERE batch_id=?', id);
                const value = update(tx, ctx, before, 'committed', { ...p, importedCount });
                if (onChanged)
                    tx.afterCommit(onChanged);
                return value;
            });
        },
        queueImport(ctx: CommandContext, id: string, previewRevision: number): ImportBatch {
            assertWalletCommandContext(ctx, ports.reader, true);
            owned(ports.reader, ctx.actor, id, true);
            integer(previewRevision, 1);
            if (ctx.expectedRevision !== previewRevision)
                fail(409, 'Chọn đúng phiên bản preview.', 'CONFLICT');
            if (!ports.enqueue)
                fail(503, 'Worker nhập dữ liệu chưa sẵn sàng.');
            return command(ctx, 'queue', { id, previewRevision }, tx => { const reader = txReader(tx), before = owned(reader, ctx.actor, id, true); pending(before); expected(ctx, before); if (before.state !== 'preview')
                fail(409, 'Cần xem preview trước.', 'CONFLICT'); const p = JSON.parse(before.preview_json); if (p.errorCount || !(p.validCount + p.duplicateCount))
                fail(422, 'Cần xử lý các dòng lỗi trước khi nhập.'); if (target(reader, ctx.actor, before.account_id, true).revision !== before.account_revision || hash(rows(reader, id)) !== p.rowsHash)
                fail(409, 'Preview vừa thay đổi.', 'CONFLICT'); const revision = before.revision + 1, jobId = ports.enqueue!({ key: id + ':' + revision, payload: { batchId: id, revision, actorId: ctx.actor.userId } }); return update(tx, ctx, before, 'queued', { ...p, jobId, errorCode: undefined }); });
        },
        async applyQueuedImportAsync(actorId:string,id:string,revision:number,signal:AbortSignal,onChanged?:()=>void):Promise<ImportBatch>{
            signal.throwIfAborted();const user=ports.reader.legacy?.users.find(u=>u.id===actorId)??JSON.parse(ports.reader.get('SELECT data FROM users WHERE id=?',actorId)?.data??'null');if(!user||user.isDeleted)fail(403,'Chủ bản nhập không còn quyền.');const subject={userId:actorId,role:user.role},ctx={actor:subject,idempotencyKey:'import-'+id+'-'+revision,expectedRevision:revision};owned(ports.reader,subject,id,true);let prepared:PreparedImportBatch;
            try{prepared=await prepareImportBatchAsync(rows(ports.reader,id),{actorId,batchId:id,at:stamp()},signal);signal.throwIfAborted();}catch(error){return queuedFailure(ctx,id,revision,signal,error);}
            return result.applyQueuedImport(actorId,id,revision,signal,onChanged,prepared);
        },
        applyQueuedImport(actorId: string, id: string, revision: number, signal: AbortSignal, onChanged?: () => void, preparedBatch?:PreparedImportBatch): ImportBatch {
            if (signal.aborted)
                fail(409, 'Tác vụ nhập đã dừng.');
            const user = ports.reader.legacy?.users.find(u => u.id === actorId) ?? JSON.parse(ports.reader.get('SELECT data FROM users WHERE id=?', actorId)?.data ?? 'null');
            if (!user || user.isDeleted)
                fail(403, 'Chủ bản nhập không còn quyền.');
            const ctx = { actor: { userId: actorId, role: user.role }, idempotencyKey: 'import-' + id + '-' + revision, expectedRevision: revision };
            try {
                return result.commitImport(ctx, id, revision, onChanged, true,preparedBatch);
            }
            catch(error){return queuedFailure(ctx,id,revision,signal,error); }
        },
        reopenImport(ctx: CommandContext, id: string): ImportBatch {
            assertWalletCommandContext(ctx, ports.reader, true);
            owned(ports.reader, ctx.actor, id, true);
            return command(ctx, 'reopen', { id, revision: ctx.expectedRevision }, tx => { const reader = txReader(tx), before = owned(reader, ctx.actor, id, true); expected(ctx, before); pending(before, true); if (before.state !== 'queued')
                fail(409, 'Bản nhập không chờ worker.', 'CONFLICT'); const p = JSON.parse(before.preview_json), job = reader.get('SELECT status FROM app_jobs WHERE id=?', p.jobId); if (job && !['failed', 'dropped', 'unknown'].includes(job.status))
                fail(409, 'Worker vẫn đang xử lý bản nhập.', 'CONFLICT'); return update(tx, ctx, before, 'preview', { ...p, errorCode: 'IMPORT_REVIEW_REQUIRED' }); });
        },
        expireImports(): number {
            if (!ports.reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_import_batches'"))
                return 0;
            const expired = ports.reader.all("SELECT id,file_key,file_size,file_sha256 FROM wallet_import_batches WHERE file_retired_at IS NULL AND expires_at<=? AND state IN('staged','preview','queued','expired','committed','undone') ORDER BY expires_at,id LIMIT 100", stamp());
            if (!expired.length)
                return 0;
            store.transaction({ actorId: 'system:wallet-imports', command: 'wallet:import:expire', requestId: randomUUID(), payloadHash: hash(expired.map(r => r.id)) }, tx => { for (const row of expired) {
                const current = tx.sql.get('SELECT state,expires_at FROM wallet_import_batches WHERE id=?', row.id);
                if (!current || Date.parse(current.expires_at) > now())
                    continue;
                tx.sql.run('DELETE FROM wallet_import_rows WHERE batch_id=?', row.id);
                if (['staged', 'preview', 'queued'].includes(current.state))
                    tx.sql.run("UPDATE wallet_import_batches SET state='expired',revision=revision+1,updated_at=? WHERE id=?", stamp(), row.id);
            } });
            const retired = expired.filter(row => ports.files.remove(row.file_key, { size: row.file_size, sha256: row.file_sha256 }));
            if (retired.length)
                store.transaction({ actorId: 'system:wallet-imports', command: 'wallet:import:retire-file', requestId: randomUUID(), payloadHash: hash(retired.map(r => r.id)) }, tx => { for (const row of retired)
                    tx.sql.run('UPDATE wallet_import_batches SET file_retired_at=? WHERE id=? AND file_retired_at IS NULL', stamp(), row.id); });
            return retired.length;
        },
        undoImport(ctx: CommandContext, id: string, policy: 'onlyUnmodified' | 'rejectIfModified', onChanged?: () => void): ImportBatch {
            assertWalletCommandContext(ctx, ports.reader, true);
            owned(ports.reader, ctx.actor, id, true);
            choice(policy, ['onlyUnmodified', 'rejectIfModified']);
            return command(ctx, 'undo', { id, revision: ctx.expectedRevision, policy }, tx => { const reader = txReader(tx), before = owned(reader, ctx.actor, id, true); expected(ctx, before); if (before.state !== 'committed')
                fail(409, 'Chỉ hoàn tác bản đã nhập.', 'CONFLICT'); const entries = reader.all('SELECT * FROM wallet_import_entries WHERE batch_id=? ORDER BY row_number LIMIT 10001', id), eligible = entries.map(entry => ({ entry, can: records.canUndoImportedWithin(tx, ctx, entry.record_id, entry.record_revision, entry.source_key) })); if (policy === 'rejectIfModified' && eligible.some(row => !row.can))
                fail(409, 'Có giao dịch đã sửa hoặc được liên kết.', 'CONFLICT'); let undoneCount = 0; for (const { entry, can } of eligible) {
                if (!can)
                    continue;
                const saved = records.undoImportedWithin(tx, ctx, entry.record_id, entry.record_revision, entry.source_key);
                tx.sql.run('UPDATE wallet_import_entries SET undone_revision=? WHERE batch_id=? AND row_number=?', saved.record.revision, id, entry.row_number);
                undoneCount++;
            } const value = update(tx, ctx, before, 'undone', { ...JSON.parse(before.preview_json), undoneCount, keptCount: entries.length - undoneCount }); if (undoneCount && onChanged)
                tx.afterCommit(onChanged); return value; });
        }
    };
    return result;
}
