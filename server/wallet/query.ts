import { createHash } from 'node:crypto';
import type { Actor, Money, Page, RecordFilter, FilterRecord } from '../../src/features/wallet/contracts.js';
import { normalizeFilter, matchesRecordFilter } from '../../src/features/wallet/filter.js';
import { parseEffectiveDate } from '../../src/features/wallet/dates.js';
import { minorInteger, currencyExponent } from '../../src/features/wallet/money.js';
import { object, keys, text, integer } from '../../src/features/productivity/validation.js';
import { AppStoreError } from '../appErrors.js';
import { walletAccountReadScope, type WalletReader } from './access.js';
import type { WalletRecord, WalletPosting } from './store.js';
import { decodeMetadata, validateMetadata, type WalletRecordMetadata } from './metadata.js';
export interface WalletRecordView {
    record: WalletRecord;
    metadata: WalletRecordMetadata;
    postings: (WalletPosting & {
        currency: string;
        accountName: string;
    })[];
    labelIds: string[];
    matchedAccountIds: string[];
    partial: boolean;
}
export interface WalletSelectionCapture {filter:RecordFilter;entries:{id:string;revision:number}[];total:number}
interface IndexedView extends WalletRecordView {
    searchText: string;
    accountRevisions: [
        string,
        number
    ][];
}
interface Cursor {
    v: 1;
    actor: string;
    filter: string;
    revision: string;
    after: [
        string,
        string,
        string
    ];
}
function fail(status: number, message: string, code = 'INVALID_INPUT'): never { throw new AppStoreError(message, status, code); }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : canonical(v)])) : value;
const key = (row: WalletRecordView): [
    string,
    string,
    string
] => [row.record.effectiveDate, row.metadata.occurredAt ?? '', row.record.id];
const compare = (a: readonly string[], b: readonly string[]) => { for (let i = 0; i < 3; i++) {
    const n = Buffer.compare(Buffer.from(b[i]), Buffer.from(a[i]));
    if (n)
        return n;
} return 0; };
function cursor(raw: string | null, actor: Actor, filter: string): Cursor | null {
    if (raw === null)
        return null;
    try {
        text(raw, 4096);
        const v = object(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
        keys(v, ['v', 'actor', 'filter', 'revision', 'after']);
        if (v.v !== 1 || v.actor !== actor.userId || v.filter !== filter || typeof v.revision !== 'string' || !/^[a-f0-9]{64}$/.test(v.revision) || !Array.isArray(v.after) || v.after.length !== 3)
            throw Error();
        for (const item of v.after)
            text(item, 256, false);
        parseEffectiveDate(v.after[0]);
        if (v.after[1] !== '' && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.after[1]) || !Number.isFinite(Date.parse(v.after[1])) || new Date(v.after[1]).toISOString() !== v.after[1]))
            throw Error();
        text(v.after[2], 256);
        return v as unknown as Cursor;
    }
    catch {
        fail(400, 'Con trỏ không khớp người dùng hoặc bộ lọc.');
    }
}
function categorySelection(reader: WalletReader, selected: string[] | undefined): Set<string> | null {
    if (selected === undefined)
        return null;
    const rows = reader.all('SELECT id,parent_id FROM wallet_categories'), parents = new Map<string, string | null>(rows.map(row => [row.id, row.parent_id])), complete = new Set<string>();
    for (const start of parents.keys()) {
        let id: string | null = start;
        const path = new Set<string>();
        while (id !== null && !complete.has(id)) {
            if (path.has(id) || !parents.has(id))
                throw Error('Invalid Wallet category ancestry');
            path.add(id);
            id = parents.get(id)!;
        }
        for (const id of path)
            complete.add(id);
    }
    const children = new Map<string, string[]>();
    for (const [id, parent] of parents)
        if (parent !== null) {
            const list = children.get(parent) ?? [];
            list.push(id);
            children.set(parent, list);
        }
    const allowed = new Set<string>(), queue = [...selected];
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        if (allowed.has(id))
            continue;
        allowed.add(id);
        for (const child of children.get(id) ?? [])
            queue.push(child);
    }
    return allowed;
}
/** Read-only facade: current SQL ACL before bodies/counts, no cache/writer/job.
 * Reference valuations are synchronous trusted offline projections, never a
 * provider request. Full note/payee/label bodies are fetched only for the page
 * unless text matching needs those already-authorized candidate fields. */
export function createWalletQueries(ports: {
    reader: WalletReader;
    referenceValue?: (input: {
        recordId: string;
        accountId: string;
        effectiveDate: string;
        money: Money;
        targetCurrency: string;
    }) => Money | undefined;
}) {
    const authority = (actor: Actor) => { const scope = walletAccountReadScope(ports.reader, actor); if (ports.reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value !== '1')
        fail(409, 'Kho Wallet chưa được kích hoạt.', 'wallet-storage-inactive'); return scope; };
    function evaluate(actor: Actor, raw: RecordFilter, rawCursor: string | null, limit: number, selectionOnly=false): Page<WalletRecordView>|WalletSelectionCapture {
            authority(actor);
            let f: RecordFilter;
            try {
                integer(limit, 1, 100);
                f = normalizeFilter(raw);
            }
            catch {
                fail(400, 'Bộ lọc hoặc kích thước trang không hợp lệ.');
            }
            const fingerprint = hash(canonical(f!)), position = cursor(rawCursor, actor, fingerprint), search = !!f!.query?.trim(), needsLabels = search || f!.labelIds !== undefined;
            const users = new Set<string>(ports.reader.legacy ? ports.reader.legacy.users.map(user => user.id) : ports.reader.all('SELECT id FROM users').map(row => row.id));
            const read = (full: boolean, ids?: string[]): IndexedView[] => {
                const scope = authority(actor), body = full || search, labelBodies = full || needsLabels;
                const sql = `WITH visible AS MATERIALIZED(SELECT a.id,a.name,a.currency,a.revision FROM wallet_accounts a WHERE (${scope.sql}) IN('read','contribute','manage')),
     scoped AS(SELECT r.id,r.effective_date,EXISTS(SELECT 1 FROM wallet_postings hidden WHERE hidden.record_id=r.id AND NOT EXISTS(SELECT 1 FROM visible a WHERE a.id=hidden.account_id)) AS partial FROM wallet_records r WHERE r.effective_date>=? AND r.effective_date<? AND EXISTS(SELECT 1 FROM wallet_postings p JOIN visible a ON a.id=p.account_id WHERE p.record_id=r.id)${ids ? ' AND r.id IN(' + ids.map(() => '?').join(',') + ')' : ''})
     SELECT r.id,r.kind,r.effective_date,r.timezone,r.source,CASE WHEN s.partial THEN NULL ELSE r.external_key END AS external_key,${body ? "CASE WHEN s.partial THEN '' ELSE r.note END" : "''"} AS note,r.settlement_status,r.creator_id,r.revision,r.category_id,r.occurrence_id,s.partial,
     m.record_id AS meta_id,m.created_at,m.updated_at,m.created_by,m.updated_by,m.occurred_at,${body ? "CASE WHEN s.partial THEN '' ELSE m.payee END" : "''"} AS payee,CASE WHEN s.partial THEN '' ELSE m.payment_method END AS payment_method,m.reviewed_at,
     ${body ? "CASE WHEN s.partial THEN '' ELSE COALESCE(c.name,'') END" : "''"} AS category_name,
     ${labelBodies ? "CASE WHEN s.partial THEN '[]' ELSE (SELECT json_group_array(json_object('id',id,'name',name)) FROM(SELECT l.id,l.name FROM wallet_record_labels rl JOIN wallet_labels l ON l.id=rl.label_id WHERE rl.record_id=r.id ORDER BY l.id)) END" : "'[]'"} AS labels,
     p.account_id,CAST(p.delta_minor AS TEXT) AS delta_minor,a.currency,a.name AS account_name,a.revision AS account_revision
     FROM scoped s JOIN wallet_records r ON r.id=s.id JOIN wallet_postings p ON p.record_id=r.id JOIN visible a ON a.id=p.account_id LEFT JOIN wallet_record_metadata m ON m.record_id=r.id LEFT JOIN wallet_categories c ON c.id=r.category_id
     ORDER BY r.effective_date DESC,COALESCE(m.occurred_at,'') DESC,r.id DESC,p.account_id ASC LIMIT 100001`;
                const rows = ports.reader.all(sql, ...scope.args, f!.period.fromDate, f!.period.toDateExclusive, ...(ids ?? []));
                if (rows.length > 100000)
                    fail(422, 'Phạm vi truy vấn vượt giới hạn; hãy thu hẹp thời gian.', 'LIMIT_EXCEEDED');
                const views = new Map<string, IndexedView>();
                for (const row of rows) {
                    let view = views.get(row.id);
                    if (!view) {
                        if (row.meta_id !== row.id)
                            throw Error('Missing Wallet record metadata');
                        text(row.id, 256);
                        integer(row.revision, 1);
                        if (!users.has(row.creator_id))
                            throw Error('Unknown Wallet record creator');
                        const metadata = decodeMetadata('wallet_record_metadata', { record_id: row.id, created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by, updated_by: row.updated_by, occurred_at: row.occurred_at, payee: row.payee, payment_method: row.payment_method, reviewed_at: row.reviewed_at }) as unknown as WalletRecordMetadata;
                        validateMetadata('wallet_record_metadata', metadata, users);
                        const labels: unknown = JSON.parse(row.labels);
                        if (!Array.isArray(labels))
                            throw Error('Invalid Wallet labels');
                        for (const item of labels) {
                            text(item.id, 256);
                            text(item.name, 500);
                        }
                        const record: WalletRecord = { id: row.id, kind: row.kind, effectiveDate: row.effective_date, timezone: row.timezone, source: row.source, note: row.note, settlementStatus: row.settlement_status, creatorId: row.creator_id, revision: row.revision, ...(row.external_key === null ? {} : { externalKey: row.external_key }), ...(row.category_id === null ? {} : { categoryId: row.category_id }), ...(row.occurrence_id === null ? {} : { occurrenceId: row.occurrence_id }) };
                        text(record.note, 100000, false);
                        view = { record, metadata, postings: [], labelIds: labels.map(item => item.id), matchedAccountIds: [], partial: !!row.partial, searchText: [record.note, metadata.payee, metadata.paymentMethod, row.category_name, ...labels.map(item => item.name)].join(' '), accountRevisions: [] };
                        views.set(row.id, view);
                    }
                    minorInteger(row.delta_minor);
                    currencyExponent(row.currency);
                    text(row.account_name, 500);
                    integer(row.account_revision, 1);
                    view.postings.push({ recordId: row.id, accountId: row.account_id, deltaMinor: row.delta_minor, currency: row.currency, accountName: row.account_name });
                    view.accountRevisions.push([row.account_id, row.account_revision]);
                    view.searchText += ' ' + row.account_name;
                }
                const result = [...views.values()];
                for (const view of result)
                    if (view.record.kind === 'income' || view.record.kind === 'expense') {
                        if (view.partial || view.postings.length !== 1 || minorInteger(view.postings[0].deltaMinor) * (view.record.kind === 'income' ? 1n : -1n) <= 0n)
                            throw Error('Invalid Wallet income/expense postings');
                    }
                return result;
            };
            try {
                const allowed = categorySelection(ports.reader, f!.categoryIds), selected = read(false), base = { ...f! };
                delete base.categoryIds;
                delete base.absoluteMin;
                delete base.absoluteMax;
                const withBounds = { ...f! };
                delete withBounds.categoryIds;
                const matches = selected.filter(view => { if (allowed && !allowed.has(view.record.categoryId ?? ''))
                    return false; view.matchedAccountIds = view.postings.filter(posting => { const record: FilterRecord = { id: view.record.id, effectiveDate: view.record.effectiveDate, accountIds: [posting.accountId], categoryId: view.record.categoryId ?? null, labelIds: view.labelIds, currency: posting.currency, kind: view.record.kind, status: view.record.settlementStatus, paymentMethod: view.metadata.paymentMethod, creatorId: view.record.creatorId, searchText: view.searchText, minor: posting.deltaMinor }; if (!matchesRecordFilter(record, base, []))
                    return false; if (f!.absoluteMin === undefined && f!.absoluteMax === undefined)
                    return true; const reference = posting.currency === f!.referenceCurrency ? { minor: posting.deltaMinor, currency: posting.currency } : ports.referenceValue?.({ recordId: record.id, accountId: posting.accountId, effectiveDate: record.effectiveDate, money: { minor: posting.deltaMinor, currency: posting.currency }, targetCurrency: f!.referenceCurrency }); if (!reference)
                    fail(422, 'Chưa có tỷ giá định giá cho bộ lọc số tiền.', 'RATE_UNAVAILABLE'); return matchesRecordFilter(record, withBounds, [], reference); }).map(posting => posting.accountId); return view.matchedAccountIds.length > 0; });
                const signature = (view: IndexedView) => [key(view), view.record.revision, view.partial, view.accountRevisions, view.postings.map(p => [p.accountId, p.currency, p.deltaMinor])], revision = hash(matches.map(view => [signature(view), view.matchedAccountIds]));
                if(selectionOnly){
                    const rechecked=read(false);
                    if(hash(selected.map(signature))!==hash(rechecked.map(signature)))fail(409,'Quyền hoặc danh sách vừa thay đổi.','CONFLICT');
                    authority(actor);return {filter:f!,entries:matches.map(view=>({id:view.record.id,revision:view.record.revision})),total:matches.length};
                }
                if (position && position.revision !== revision)
                    fail(409, 'Danh sách đã thay đổi; hãy tải lại từ đầu.', 'CONFLICT');
                const after = matches.filter(view => !position || compare(key(view), position.after) > 0), page = after.slice(0, limit), bodies = page.length ? read(true, page.map(view => view.record.id)) : [], byId = new Map(bodies.map(view => [view.record.id, view]));
                const items = page.map(index => { const full = byId.get(index.record.id); if (!full || hash(signature(full)) !== hash(signature(index)))
                    fail(409, 'Quyền hoặc giao dịch vừa thay đổi.', 'CONFLICT'); const { searchText: _search, accountRevisions: _revisions, ...value } = full; return { ...value, matchedAccountIds: [...index.matchedAccountIds] }; });
                const last = page.at(-1), nextCursor = after.length > limit && last ? Buffer.from(JSON.stringify({ v: 1, actor: actor.userId, filter: fingerprint, revision, after: key(last) })).toString('base64url') : null;
                return { items, total: matches.length, nextCursor };
            }
            catch (error) {
                if (error instanceof AppStoreError)
                    throw error;
                fail(422, 'Dữ liệu hoặc định giá Wallet không hợp lệ.', 'INVALID_INPUT');
            }
    }
    return {
        listRecords:(actor:Actor,filter:RecordFilter,cursor:string|null,limit:number)=>evaluate(actor,filter,cursor,limit) as Page<WalletRecordView>,
        captureSelection:(actor:Actor,filter:RecordFilter)=>evaluate(actor,filter,null,100,true) as WalletSelectionCapture,
    };
}
