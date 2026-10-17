import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as query from './query.js';
import { UserRole, type User } from '../../src/types.js';
import type { RecordFilter, Money } from '../../src/features/wallet/contracts.js';
import { convertMoney } from '../../src/features/wallet/money.js';
import { withAppWriteTransaction } from '../appStore.js';
import { sqliteConnection } from '../sqlite.js';
import { prepareWalletSchema, prepareWalletMetadata, prepareWalletFinancial } from './schema.js';
import { openWalletStore } from './store.js';
const actor = (id = 'viewer', role: UserRole = UserRole.MEMBER) => ({ userId: 'synthetic-query-' + id, role }), meta = () => ({ actorId: actor().userId, command: 'wallet:synthetic:query', requestId: randomUUID(), payloadHash: 'synthetic' }), write = <T>(fn: Parameters<typeof withAppWriteTransaction<T>>[1]) => withAppWriteTransaction(meta(), fn), store = openWalletStore({ write: withAppWriteTransaction });
const reader = { get: (sql: string, ...args: any[]): any => sqliteConnection().prepare(sql).get(...args), all: (sql: string, ...args: any[]): any[] => sqliteConnection().prepare(sql).all(...args) };
const account = (key: string) => 'synthetic-query-account-' + key, record = (key: string) => 'synthetic-query-record-' + key, category = (key: string) => 'synthetic-query-category-' + key, label = (key: string) => 'synthetic-query-label-' + key;
const filter = (patch: Partial<RecordFilter> = {}): RecordFilter => ({ period: { fromDate: '2026-10-10', toDateExclusive: '2026-11-01', timezone: 'Asia/Saigon' }, referenceCurrency: 'VND', statuses: ['cleared'], ...patch });
function setup() {
    write(tx => { prepareWalletSchema(tx); prepareWalletMetadata(tx); prepareWalletFinancial(tx); for (const name of ['wallet_transfer_fees', 'wallet_record_fx', 'wallet_audit_metadata', 'wallet_label_metadata', 'wallet_category_metadata', 'wallet_record_metadata', 'wallet_account_metadata', 'wallet_audit', 'wallet_allocations', 'wallet_record_labels', 'wallet_postings', 'wallet_records', 'wallet_occurrences', 'wallet_schedules', 'wallet_account_grants', 'wallet_accounts', 'wallet_categories', 'wallet_labels'])
        tx.run('DELETE FROM ' + name); tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','1')"); tx.legacy.users = ['viewer', 'other', 'admin', 'child', 'guest'].map(id => ({ id: actor(id).userId, role: id === 'admin' ? UserRole.ADMIN : id === 'child' ? UserRole.CHILD : id === 'guest' ? UserRole.GUEST : UserRole.MEMBER, username: 'synthetic-query-' + id, fullName: 'Synthetic query ' + id, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: '2026-10-17T00:00:00.000Z' } as User & {
        passwordHash: string;
    })); });
    store.transaction(meta(), tx => {
        for (const [key, currency, mode] of [['cash', 'VND', 'private'], ['bank', 'VND', 'private'], ['hidden', 'USD', 'private'], ['shared', 'VND', 'shared']] as const)
            tx.accounts.insert({ id: account(key), name: key === 'hidden' ? 'SYNTHETIC_HIDDEN_BANK' : 'Synthetic visible ' + key, type: key === 'cash' ? 'cash' : 'bank', currency, ownerUserId: actor(key === 'cash' ? 'viewer' : 'other').userId, accessMode: mode, openingMinor: '0', openingDate: '2026-10-10', revision: 1 });
        tx.sql.run('INSERT INTO wallet_account_grants VALUES(?,?,?)', account('bank'), actor().userId, 'read');
        for (const [key, parent] of [['utilities', null], ['utility-child', category('utilities')], ['food', null]] as const) {
            tx.sql.run('INSERT INTO wallet_categories VALUES(?,?,?,?,?)', category(key), parent, 'Synthetic ' + key, 'need', null);
            tx.metadata.categories.set({ categoryId: category(key), createdAt: null, updatedAt: null, createdBy: null, updatedBy: null, icon: '', color: 'slate', hidden: key === 'utilities', revision: 1 });
        }
        for (const key of ['one', 'two']) {
            tx.sql.run('INSERT INTO wallet_labels VALUES(?,?,?)', label(key), 'Synthetic label ' + key, null);
            tx.metadata.labels.set({ labelId: label(key), createdAt: null, updatedAt: null, createdBy: null, updatedBy: null, icon: '', color: 'slate', hidden: false, revision: 1 });
        }
        // Explicit rows keep the visible and inaccessible financial fixtures independent.
        const rows = [['income', 'income', '2026-10-10', 'food', 'Synthetic salary', '', null, 'cleared', [['cash', '500000']], []], ['utility', 'expense', '2026-10-11', 'utility-child', 'Dịch vụ điện nước', 'Điện lực', '2026-10-11T06:00:00.000Z', 'cleared', [['cash', '-200000']], ['one', 'two']], ['large', 'expense', '2026-10-11', 'food', 'Synthetic exact large', 'Synthetic shop', '2026-10-11T06:00:00.000Z', 'cleared', [['bank', '-9007199254740993']], ['one']], ['move', 'transfer', '2026-10-12', 'food', 'Synthetic internal move', '', null, 'cleared', [['cash', '-300000'], ['bank', '300000']], ['two']], ['partial', 'transfer', '2026-10-13', 'food', 'SYNTHETIC_PRIVATE_COUNTERPARTY', 'SYNTHETIC_PRIVATE_COUNTERPARTY', null, 'cleared', [['cash', '-2500000'], ['hidden', '10000']], ['one']], ['hidden', 'expense', '2026-10-14', 'food', 'SYNTHETIC_HIDDEN_ONLY', 'SYNTHETIC_HIDDEN_PAYEE', null, 'cleared', [['hidden', '-1234567']], []], ['voided', 'expense', '2026-10-15', 'food', 'Synthetic voided', '', null, 'voided', [['shared', '-50']], []]] as const;
        for (const [key, kind, date, cat, note, payee, time, status, legs, tags] of rows) {
            const id = record(key);
            tx.records.insert({ id, kind, effectiveDate: date, timezone: 'Asia/Saigon', source: 'manual', ...(key === 'partial' ? { externalKey: 'synthetic-private-source' } : {}), note, settlementStatus: status, creatorId: actor('admin', UserRole.ADMIN).userId, revision: 1, categoryId: category(cat) });
            for (const [which, deltaMinor] of legs)
                tx.postings.insert({ recordId: id, accountId: account(which), deltaMinor });
            tx.metadata.records.set({ recordId: id, createdAt: null, updatedAt: null, createdBy: null, updatedBy: null, occurredAt: time, payee, paymentMethod: key === 'utility' ? 'bank' : 'cash', reviewedAt: null });
            for (const which of tags)
                tx.sql.run('INSERT INTO wallet_record_labels VALUES(?,?)', id, label(which));
        }
        tx.financial.fx.insert({ recordId: record('partial'), fromCurrency: 'VND', toCurrency: 'USD', debitMinor: '2500000', creditMinor: '10000', numerator: '1', denominator: '25000', asOf: '2026-10-13', source: 'synthetic-fixed' });
        tx.sql.run("UPDATE wallet_accounts SET archived_at='2026-10-16T00:00:00.000Z' WHERE id=?", account('shared'));
    });
    return query.createWalletQueries({ reader });
}
const ids = (page: any) => page.items.map((item: any) => item.record.id);
it('lists and counts only current readable records, retains historical voided/archive rows when explicitly selected, and owns no writer/cache', () => {
    const q = setup(), before = reader.get('SELECT total_changes() AS n'), commands = reader.get('SELECT count(*) AS n FROM app_commands'), page = q.listRecords(actor(), filter(), null, 100);
    expect(page.total).toBe(5);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
    expect(ids(page)).not.toContain(record('hidden'));
    expect(q.listRecords(actor('admin', UserRole.ADMIN), filter(), null, 100).total).toBe(6);
    expect(ids(q.listRecords(actor(), filter({ statuses: ['voided'] }), null, 100))).toEqual([record('voided')]);
    expect(reader.get('SELECT total_changes() AS n')).toEqual(before);
    expect(reader.get('SELECT count(*) AS n FROM app_commands')).toEqual(commands);
});
it('ANDs dimensions, ORs values, matches hidden category descendants and preserves exact signed64 amounts', () => {
    const q = setup();
    expect(ids(q.listRecords(actor(), filter({ accountIds: [account('cash')], categoryIds: [category('utilities')], kinds: ['expense'], labelIds: [label('one'), label('two')], labelMatch: 'all', query: 'dien nuoc', paymentMethods: ['bank'] }), null, 100))).toEqual([record('utility')]);
    expect(q.listRecords(actor(), filter({ accountIds: [account('cash'), account('bank')], kinds: ['income', 'expense'] }), null, 100).total).toBe(3);
    const exact = q.listRecords(actor(), filter({ absoluteMin: '9007199254740993' }), null, 100);
    expect(ids(exact)).toEqual([record('large')]);
    expect(exact.items[0].postings[0].deltaMinor).toBe('-9007199254740993');
    expect(q.listRecords(actor(), filter({ absoluteMax: '9007199254740992' }), null, 100).total).toBe(4);
});
it.each([['any', ['two'], 2], ['all', ['one', 'two'], 1], ['any', [], 0], ['all', [], 0]] as const)('label %s/%j matches exactly%s readable records', (labelMatch, labels, total) => {
    const q = setup();
    expect(q.listRecords(actor(), filter({ labelMatch, labelIds: labels.map(label) }), null, 100).total).toBe(total);
});
it.each(['accountIds', 'categoryIds', 'currencies', 'kinds', 'statuses', 'creatorIds'] as const)('an explicit empty%s selects zero records', key => {
    const q = setup();
    expect(q.listRecords(actor(), filter({ [key]: [] }), null, 100).total).toBe(0);
});
it('period bounds are exclusive at the end and transfer modes keep one event even when both legs match', () => {
    const q = setup();
    expect(q.listRecords(actor(), filter({ period: { fromDate: '2026-10-11', toDateExclusive: '2026-10-12', timezone: 'Asia/Saigon' } }), null, 100).total).toBe(2);
    expect(q.listRecords(actor(), filter({ transferMode: 'only' }), null, 100).total).toBe(2);
    expect(q.listRecords(actor(), filter({ transferMode: 'exclude' }), null, 100).total).toBe(3);
});
it('partial transfers redact inaccessible bodies before search, amount/currency filters and returned JSON', () => {
    const q = setup(), value = q.listRecords(actor(), filter(), null, 100).items.find(row => row.record.id === record('partial'))!;
    expect(value.partial).toBe(true);
    expect(value.postings).toEqual([expect.objectContaining({ recordId: record('partial'), accountId: account('cash'), currency: 'VND', deltaMinor: '-2500000' })]);
    expect(value.record.note).toBe('');
    expect(value.record).not.toHaveProperty('externalKey');
    expect(value.metadata.payee).toBe('');
    expect(value.labelIds).toEqual([]);
    for (const hidden of ['SYNTHETIC_PRIVATE_COUNTERPARTY', 'synthetic-private-source', 'SYNTHETIC_HIDDEN_BANK', account('hidden'), 'USD'])
        expect(JSON.stringify(value)).not.toContain(hidden);
    expect(q.listRecords(actor(), filter({ query: 'SYNTHETIC_PRIVATE_COUNTERPARTY' }), null, 100).total).toBe(0);
    expect(q.listRecords(actor(), filter({ currencies: ['USD'] }), null, 100).total).toBe(0);
    expect(ids(q.listRecords(actor('admin', UserRole.ADMIN), filter({ query: 'SYNTHETIC_PRIVATE_COUNTERPARTY' }), null, 100))).toEqual([record('partial')]);
});
it('search uses authorized payee, accent-normalized note, category, label and readable account text', () => {
    const q = setup();
    for (const needle of ['dien luc', 'dien nuoc', 'utility-child'])
        expect(ids(q.listRecords(actor(), filter({ query: needle }), null, 100))).toEqual([record('utility')]);
    expect(q.listRecords(actor(), filter({ query: 'visible bank' }), null, 100).total).toBe(2);
    expect(q.listRecords(actor(), filter({ query: 'label two' }), null, 100).total).toBe(2);
});
it('a missing reference valuation fails explicitly only after other dimensions match, and a trusted offline valuation sees readable legs only', () => {
    setup();
    const calls: any[] = [], q = query.createWalletQueries({ reader, referenceValue: (input: any): Money => { calls.push(input); return convertMoney(input.money, input.targetCurrency, { numerator: '25000', denominator: '1' }); } });
    expect(ids(q.listRecords(actor('admin', UserRole.ADMIN), filter({ currencies: ['USD'], absoluteMin: '2500000', absoluteMax: '2500000' }), null, 100))).toEqual([record('partial')]);
    expect(calls).toHaveLength(2);
    expect(() => query.createWalletQueries({ reader }).listRecords(actor('admin', UserRole.ADMIN), filter({ currencies: ['USD'], absoluteMin: '1' }), null, 100)).toThrow(expect.objectContaining({ status: 422, code: 'RATE_UNAVAILABLE' }));
    calls.length = 0;
    expect(q.listRecords(actor(), filter({ currencies: ['USD'], absoluteMin: '1' }), null, 100).total).toBe(0);
    expect(calls).toEqual([]);
});
it('same-date cursors order by occurredAt and native binary ID without duplicates, including Unicode IDs', () => {
    const q = setup();
    store.transaction(meta(), tx => { for (const id of ['synthetic-query-🚀', 'synthetic-query-\uE000']) {
        tx.records.insert({ id, kind: 'expense', effectiveDate: '2026-10-11', timezone: 'Asia/Saigon', source: 'manual', note: 'Synthetic tied record', settlementStatus: 'cleared', creatorId: actor().userId, revision: 1 });
        tx.postings.insert({ recordId: id, accountId: account('cash'), deltaMinor: '-1' });
        tx.metadata.records.set({ recordId: id, createdAt: null, updatedAt: null, createdBy: null, updatedBy: null, occurredAt: '2026-10-11T06:00:00.000Z', payee: '', paymentMethod: '', reviewedAt: null });
    } });
    const f = filter({ period: { fromDate: '2026-10-11', toDateExclusive: '2026-10-12', timezone: 'Asia/Saigon' } }), expected = reader.all('SELECT id FROM wallet_records WHERE effective_date=? ORDER BY id DESC', '2026-10-11').map(row => row.id), seen: string[] = [];
    let cursor: string | null = null;
    do {
        const page = q.listRecords(actor(), f, cursor, 1);
        expect(page.total).toBe(4);
        seen.push(...ids(page));
        cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(4);
});
it('cursor binds actor/filter and visible revision; hidden writes do not invalidate an otherwise identical visible page', () => {
    const q = setup(), f = filter(), first = q.listRecords(actor(), f, null, 1);
    expect(first.nextCursor).not.toBeNull();
    expect(() => q.listRecords(actor(), filter({ query: 'changed' }), first.nextCursor, 1)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => q.listRecords(actor('admin', UserRole.ADMIN), f, first.nextCursor, 1)).toThrow(expect.objectContaining({ status: 400 }));
    write(tx => tx.run('UPDATE wallet_records SET revision=revision+1,note=? WHERE id=?', 'SYNTHETIC_HIDDEN_ONLY_CHANGED', record('hidden')));
    expect(() => q.listRecords(actor(), f, first.nextCursor, 1)).not.toThrow();
    write(tx => tx.run('UPDATE wallet_records SET revision=revision+1 WHERE id=?', record('income')));
    expect(() => q.listRecords(actor(), f, first.nextCursor, 1)).toThrow(expect.objectContaining({ status: 409 }));
});
it('revocation is effective for count, partial legs and old cursors without returning old financial bodies', () => {
    const q = setup(), first = q.listRecords(actor(), filter(), null, 1);
    write(tx => tx.run('DELETE FROM wallet_account_grants WHERE account_id=?', account('bank')));
    expect(() => q.listRecords(actor(), filter(), first.nextCursor, 1)).toThrow(expect.objectContaining({ status: 409 }));
    const fresh = q.listRecords(actor(), filter(), null, 100);
    expect(fresh.total).toBe(4);
    expect(ids(fresh)).not.toContain(record('large'));
    const move = fresh.items.find(row => row.record.id === record('move'))!;
    expect(move.partial).toBe(true);
    expect(move.postings.map(row => row.accountId)).toEqual([account('cash')]);
    expect(JSON.stringify(move)).not.toContain(account('bank'));
});
it.each([['child', UserRole.CHILD], ['guest', UserRole.GUEST]] as const)('%s never issues financial SQL even with a forged grant', (_id, role) => {
    setup();
    write(tx => tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)', account('cash'), actor(_id, role).userId, 'manage'));
    const sql: string[] = [], tracked = { get: (text: string, ...args: any[]) => { sql.push(text); return reader.get(text, ...args); }, all: (text: string, ...args: any[]) => { sql.push(text); return reader.all(text, ...args); } };
    expect(() => query.createWalletQueries({ reader: tracked }).listRecords(actor(_id, role), filter(), null, 100)).toThrow(expect.objectContaining({ status: 403 }));
    expect(sql.filter(text => text.includes('wallet_'))).toEqual([]);
});
it.each([0, 101, -1, 1.5, NaN])('rejects invalid page size%s before financial row reads', limit => { const q = setup(); expect(() => q.listRecords(actor(), filter(), null, limit)).toThrow(expect.objectContaining({ status: 400 })); });
it('refuses malformed cursors/filters and inactive storage without changing any SQLite row', () => {
    const q = setup(), before = reader.get('SELECT total_changes() AS n');
    expect(() => q.listRecords(actor(), filter(), 'synthetic-invalid', 10)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => q.listRecords(actor(), filter({ referenceCurrency: 'JPY' }), null, 10)).toThrow(expect.objectContaining({ status: 400 }));
    expect(reader.get('SELECT total_changes() AS n')).toEqual(before);
    write(tx => tx.run("UPDATE app_meta SET value='0' WHERE key='wallet_active'"));
    expect(() => q.listRecords(actor(), filter(), null, 10)).toThrow(expect.objectContaining({ status: 409 }));
});
it('fresh role/deletion checks precede a previously valid cursor and canonical bodies', () => {
    const q = setup(), first = q.listRecords(actor(), filter(), null, 1);
    write(tx => { tx.legacy.users.find(user => user.id === actor().userId)!.isDeleted = true; });
    expect(() => q.listRecords(actor(), filter(), first.nextCursor, 1)).toThrow(expect.objectContaining({ status: 403 }));
});
it('candidate indexing does not load note/payee/label bodies for an unsearched page and never decodes inaccessible financial rows', () => {
    setup();
    const batches: {
        sql: string;
        rows: any[];
    }[] = [], tracked = { get: reader.get, all: (sql: string, ...args: any[]) => { const rows = reader.all(sql, ...args); if (sql.includes('FROM scoped'))
            batches.push({ sql, rows }); return rows; } }, q = query.createWalletQueries({ reader: tracked }), page = q.listRecords(actor(), filter(), null, 2);
    expect(page.items).toHaveLength(2);
    expect(batches).toHaveLength(2);
    expect(batches[0].rows.every(row => row.note === '' && row.payee === '' && row.labels === '[]')).toBe(true);
    expect(new Set(batches[1].rows.map(row => row.id)).size).toBe(2);
    for (const batch of batches)
        for (const hidden of ['SYNTHETIC_PRIVATE_COUNTERPARTY', 'SYNTHETIC_HIDDEN_ONLY', 'SYNTHETIC_HIDDEN_BANK', account('hidden')])
            expect(JSON.stringify(batch.rows)).not.toContain(hidden);
});
it.each(['role', 'grant', 'inactive'])('rechecks %s between candidate index and full body read and never serves stale privileges', kind => {
    setup();
    let injected = false;
    const bodies: any[][] = [], tracked = { get: reader.get, all: (sql: string, ...args: any[]) => { const rows = reader.all(sql, ...args); if (sql.includes('FROM scoped')) {
            if (!injected) {
                injected = true;
                write(tx => { if (kind === 'role')
                    tx.legacy.users.find(user => user.id === actor().userId)!.role = UserRole.CHILD; if (kind === 'grant')
                    tx.run('DELETE FROM wallet_account_grants WHERE account_id=?', account('bank')); if (kind === 'inactive')
                    tx.run("UPDATE app_meta SET value='0' WHERE key='wallet_active'"); });
            }
            else
                bodies.push(rows);
        } return rows; } }, q = query.createWalletQueries({ reader: tracked });
    expect(() => q.listRecords(actor(), filter(), null, 100)).toThrow(expect.objectContaining({ status: kind === 'role' ? 403 : 409 }));
    if (kind !== 'grant')
        expect(bodies).toEqual([]);
    else {
        expect(bodies).toHaveLength(1);
        expect(JSON.stringify(bodies)).not.toContain('-9007199254740993');
        expect(JSON.stringify(bodies)).not.toContain(account('bank'));
    }
});
it.each(['metadata', 'creator'])('malformed visible %s is an integrity error without a partial page or mutation', kind => {
    const q = setup();
    write(tx => { if (kind === 'metadata')
        tx.run("UPDATE wallet_record_metadata SET occurred_at='synthetic-invalid-time' WHERE record_id=?", record('utility'));
    else
        tx.run("UPDATE wallet_records SET creator_id='synthetic-orphaned-user' WHERE id=?", record('utility')); });
    const changes = reader.get('SELECT total_changes() AS n');
    expect(() => q.listRecords(actor(), filter(), null, 100)).toThrow(expect.objectContaining({ status: 422 }));
    expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
it('wrong or imprecise trusted reference money is rejected instead of rounding or returning a partial list', () => {
    setup();
    for (const value of [{ minor: '100', currency: 'USD' }, { minor: 9007199254740992, currency: 'VND' }]) {
        const q = query.createWalletQueries({ reader, referenceValue: () => value as any });
        expect(() => q.listRecords(actor('admin', UserRole.ADMIN), filter({ currencies: ['USD'], absoluteMin: '1' }), null, 100)).toThrow(expect.objectContaining({ status: 422 }));
    }
});
it('deep historical category ancestry remains filterable without recursion or rechecking the whole tree for every posting', () => {
    const q = setup();
    write(tx => { tx.run("WITH RECURSIVE n(i) AS(SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<11999) INSERT INTO wallet_categories SELECT 'synthetic-query-deep-'||i,CASE WHEN i=0 THEN NULL ELSE 'synthetic-query-deep-'||(i-1) END,'Synthetic historical category '||i,'unspecified',NULL FROM n"); tx.run("INSERT INTO wallet_category_metadata(category_id) SELECT id FROM wallet_categories WHERE id LIKE 'synthetic-query-deep-%'"); tx.run('UPDATE wallet_records SET category_id=? WHERE id=?', 'synthetic-query-deep-11999', record('utility')); });
    expect(ids(q.listRecords(actor(), filter({ categoryIds: ['synthetic-query-deep-0'] }), null, 100))).toEqual([record('utility')]);
});
it.each(['wrong-sign', 'zero', 'multiple', 'income-wrong-sign'])('rejects malformed visible posting %s instead of displaying invalid income/expense', kind => {
    const q = setup();
    write(tx => { if (kind === 'multiple')
        tx.run('INSERT INTO wallet_postings VALUES(?,?,?,?)', record('utility'), account('bank'), '2026-10-11', -2n);
    else
        tx.run('UPDATE wallet_postings SET delta_minor=? WHERE record_id=?', kind === 'zero' ? 0n : kind === 'income-wrong-sign' ? -1n : 200000n, record(kind === 'income-wrong-sign' ? 'income' : 'utility')); });
    expect(() => q.listRecords(actor(), filter(), null, 100)).toThrow(expect.objectContaining({ status: 422 }));
});
it('10k readable records page without hidden-count inflation or duplicate IDs, and fetch full bodies only for the selected100', () => {
    setup();
    write(tx => {
        for (const [prefix, owner, accountId] of [['visible', actor().userId, account('cash')], ['hidden', actor('other').userId, account('hidden')]]) {
            tx.run("WITH RECURSIVE n(i) AS(SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<9999) INSERT INTO wallet_records SELECT ?||printf('%05d',i),'expense','2026-10-16','Asia/Saigon','import',NULL,?,'cleared',?,1,NULL,NULL FROM n", 'synthetic-query-load-' + prefix + '-', prefix === 'visible' ? 'Synthetic large readable note' : 'SYNTHETIC_HIDDEN_LARGE', owner);
            tx.run('INSERT INTO wallet_record_metadata(record_id) SELECT id FROM wallet_records WHERE id LIKE ?', 'synthetic-query-load-' + prefix + '-%');
            tx.run('INSERT INTO wallet_postings SELECT id,?,effective_date,-1 FROM wallet_records WHERE id LIKE ?', accountId, 'synthetic-query-load-' + prefix + '-%');
        }
    });
    const materialized: number[] = [], tracked = { get: reader.get, all: (sql: string, ...args: any[]) => { const rows = reader.all(sql, ...args); if (sql.includes('FROM scoped') && sql.includes('r.id IN('))
            materialized.push(new Set(rows.map(row => row.id)).size); return rows; } }, q = query.createWalletQueries({ reader: tracked }), first = q.listRecords(actor(), filter(), null, 100), second = q.listRecords(actor(), filter(), first.nextCursor, 100);
    expect(first.total).toBe(10005);
    expect(second.total).toBe(10005);
    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(100);
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(200);
    expect(materialized).toEqual([100, 100]);
    expect(JSON.stringify([...first.items, ...second.items])).not.toContain('SYNTHETIC_HIDDEN_LARGE');
});
it('separates matching account legs from readable display counterparts for report/drilldown consumers', () => {
    const q = setup(), page = q.listRecords(actor(), filter({ accountIds: [account('cash')], transferMode: 'only' }), null, 100), move = page.items.find(row => row.record.id === record('move'))!;
    expect(page.total).toBe(2);
    expect(move.postings).toHaveLength(2);
    expect(move.matchedAccountIds).toEqual([account('cash')]);
    expect(page.items.find(row => row.record.id === record('partial'))!.matchedAccountIds).toEqual([account('cash')]);
    const both = q.listRecords(actor(), filter({ transferMode: 'only' }), null, 100).items.find(row => row.record.id === record('move'))!;
    expect(both.matchedAccountIds).toEqual([account('bank'), account('cash')]);
});
it('requires valuation coverage for every otherwise matching readable leg even if another leg already meets the amount bound', () => {
    const q = setup();
    expect(() => q.listRecords(actor('admin', UserRole.ADMIN), filter({ transferMode: 'only', absoluteMin: '2500000', absoluteMax: '2500000' }), null, 100)).toThrow(expect.objectContaining({ status: 422, code: 'RATE_UNAVAILABLE' }));
    expect(ids(q.listRecords(actor('admin', UserRole.ADMIN), filter({ transferMode: 'only', currencies: ['VND'], absoluteMin: '2500000', absoluteMax: '2500000' }), null, 100))).toEqual([record('partial')]);
});
it('a changed valuation that changes matching legs invalidates a cursor even when record IDs and revisions stay the same', () => {
    setup();
    let usdValue = '3000000';
    const q = query.createWalletQueries({ reader, referenceValue: () => ({ minor: usdValue, currency: 'VND' }) }), f = filter({ transferMode: 'only', absoluteMin: '200000', absoluteMax: '4000000' }), who = actor('admin', UserRole.ADMIN), first = q.listRecords(who, f, null, 1);
    expect(first.total).toBe(2);
    expect(first.nextCursor).not.toBeNull();
    usdValue = '100000';
    expect(() => q.listRecords(who, f, first.nextCursor, 1)).toThrow(expect.objectContaining({ status: 409 }));
});

it('captures the exact scoped matching IDs/revisions beyond one page without hydrating every financial body',()=>{
 setup();store.transaction(meta(),tx=>{for(let i=0;i<150;i++){const id=record('capture-'+String(i).padStart(3,'0'));tx.records.insert({id,kind:'expense',effectiveDate:'2026-10-11',timezone:'Asia/Saigon',source:'manual',note:'Synthetic capture row',settlementStatus:'cleared',creatorId:actor().userId,revision:1});tx.postings.insert({recordId:id,accountId:account('cash'),deltaMinor:'-1'});}});
 let bodies=0;const q=query.createWalletQueries({reader:{...reader,all:(sql:string,...args:any[])=>{if(sql.includes('AND r.id IN('))bodies++;return reader.all(sql,...args);}}}),before=reader.get('SELECT count(*) AS n FROM app_commands'),captured=(q as any).captureSelection(actor(),filter());expect(bodies).toBe(0);expect(captured.total).toBe(155);const first=q.listRecords(actor(),filter(),null,100),second=q.listRecords(actor(),filter(),first.nextCursor,100);expect(captured.entries.map((row:any)=>row.id)).toEqual([...ids(first),...ids(second)]);expect(captured.entries.every((row:any)=>row.revision===1)).toBe(true);expect(JSON.stringify(captured)).not.toMatch(/deltaMinor|Synthetic capture row|SYNTHETIC_HIDDEN|9007199254740993/);expect(reader.get('SELECT count(*) AS n FROM app_commands')).toEqual(before);
});
it('a grant change during capture refuses the whole snapshot instead of persisting stale private IDs',()=>{setup();let changed=false;const q=query.createWalletQueries({reader:{...reader,all:(sql:string,...args:any[])=>{const rows=reader.all(sql,...args);if(!changed&&sql.includes('WITH visible')){changed=true;write(tx=>tx.run('DELETE FROM wallet_account_grants WHERE account_id=?',account('bank')));}return rows;}}});expect(()=>(q as any).captureSelection(actor(),filter())).toThrow(expect.objectContaining({status:409}));});
it.each([UserRole.CHILD,UserRole.GUEST])('selection capture retains the current finance role gate for %s',role=>{const q=setup();expect(()=>(q as any).captureSelection(actor(role,role),filter())).toThrow(expect.objectContaining({status:403}));});
