import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import * as db from '../db.js';
import { createAuth } from '../auth.js';
import { NativeSessionStore } from '../authStore.js';
import { createApp } from '../app.js';
import { syntheticDependencies } from '../../tests/app-fixture.js';
import { UserRole } from '../../src/types.js';
import { configureWalletStorage } from './integration.js';
import { walletTablesAt } from './snapshot.js';
import { configureWalletSql } from './sqlFunctions.js';
import { createWalletPorts } from './ports.js';
const who = (key = 'member') => ({ userId: 'synthetic-wallet-http-' + key, role: key === 'admin' ? UserRole.ADMIN : key === 'child' ? UserRole.CHILD : key === 'guest' ? UserRole.GUEST : UserRole.MEMBER }), ctx = (key = 'member', expectedRevision = 0) => ({ actor: who(key), idempotencyKey: randomUUID(), expectedRevision }), write = <T>(fn: Parameters<typeof gateway.withAppWriteTransaction<T>>[1]) => gateway.withAppWriteTransaction({ actorId: 'system:synthetic', command: 'synthetic:wallet-http', requestId: randomUUID(), payloadHash: 'synthetic' }, fn);
const common = { effectiveDate: '2026-10-17', timezone: 'Asia/Saigon', note: 'Synthetic HTTP note', settlementStatus: 'cleared' as const }, money = (minor: string, currency = 'VND') => ({ minor, currency }), filter = { period: { fromDate: '2026-10-01', toDateExclusive: '2026-11-01', timezone: 'Asia/Saigon' }, referenceCurrency: 'VND', statuses: ['cleared'] };
let initialized = false;
async function fixture(work: (f: any) => Promise<void>) {
    if (!initialized) {
        configureWalletStorage({ migrations, snapshot, version: 6 });
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => {
        for (const name of Object.keys(walletTablesAt(6)).reverse().filter(name => name !== 'wallet_currencies'))
            tx.run('DELETE FROM ' + name);
        tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','1')");
        tx.legacy.transactions = [];
        tx.legacy.users = ['member', 'other', 'admin', 'child', 'guest'].map(key => ({ id: who(key).userId, role: who(key).role, username: 'synthetic-wallet-http-' + key, fullName: 'Synthetic wallet ' + key, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: '2026-10-17T00:00:00.000Z' }));
    });
    configureWalletSql(sqlite.sqliteConnection());
    const ports = createWalletPorts(sqlite, gateway, { now: () => Date.parse('2026-10-17T03:00:00.000Z') }), make = (key: string, name: string, currency: string, openingMinor: string) => ports.accounts.createAccount(ctx(key), { name, type: 'bank', currency, openingMinor, openingDate: '2026-10-17', accessMode: 'private' }).account.id, cash = make('member', 'Synthetic visible cash', 'VND', '1000000'), bank = make('member', 'Synthetic visible bank', 'VND', '2000000'), hidden = make('other', 'SYNTHETIC_PRIVATE_HTTP_BANK', 'USD', '10000');
    const income = ports.records.createRecord(ctx(), { ...common, kind: 'income', accountId: cash, money: money('500000') }), expense = ports.records.createRecord(ctx(), { ...common, kind: 'expense', accountId: cash, money: money('200000') }), move = ports.records.createRecord(ctx(), { ...common, kind: 'transfer', fromAccountId: cash, toAccountId: bank, debit: money('300000'), credit: money('300000') }), secret = ports.records.createRecord(ctx('other'), { ...common, note: 'SYNTHETIC_PRIVATE_HTTP_RECORD', kind: 'expense', accountId: hidden, money: money('12345', 'USD') });
    const deps: any = syntheticDependencies({ phase: 'ready', storageWritable: true });
    deps.db = db;
    deps.sqlite = sqlite;
    deps.wallet = ports;
    deps.auth = createAuth({ store: new NativeSessionStore(), getUsers: () => db.FamilyDB.getUsers(), getSecret: () => 'synthetic-wallet-http-auth-key' });
    const tokens = Object.fromEntries(db.FamilyDB.getUsers().map(user => [user.id, deps.auth.issue(user)])), handle = await createApp({ production: true, codeRoot: process.cwd(), dataRoot: process.env.DATA_DIR! } as any, deps), server = http.createServer(handle.app).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const request = (path: string, method = 'GET', body?: unknown, key: string | null = 'member', nonce: string | undefined = undefined) => new Promise<any>((resolve, reject) => {
        const encoded = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: Record<string, string> = { ...(key ? { Authorization: 'Bearer ' + tokens[who(key).userId] } : {}), ...(nonce === undefined ? {} : { 'x-request-id': nonce }), ...(encoded === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(encoded)) }) }, req = http.request({ hostname: '127.0.0.1', port: (server.address() as any).port, path: '/api/wallet' + path, method, headers, agent: false }, res => {
            let text = '';
            res.on('data', chunk => text += String(chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(text), headers: res.headers });
                }
                catch {
                    reject(Error('Invalid synthetic HTTP response'));
                }
            });
        });
        req.on('error', reject);
        req.end(encoded);
    });
    try {
        await work({ request, ports, cash, bank, hidden, income, expense, move, secret, tokens, state: deps.state });
    }
    finally {
        handle.endStreams();
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
        await handle.drainHandlers();
        await handle.dispose();
    }
}
it('existing auth denies anonymous401 and Child/Guest403 on every bulk/snapshot route before input parsing', () => fixture(async (f) => { for (const [path, method] of [['/record-selections', 'POST'], ['/record-selections/synthetic/members', 'POST'], ['/record-selections/synthetic', 'DELETE'], ['/records/bulk-preview', 'POST'], ['/records/bulk-metadata', 'POST']])
    for (const [key, status] of [[null, 401], ['child', 403], ['guest', 403]]) {
        const result = await f.request(path, method, {}, key);
        expect(result.status).toBe(status);
        expect(result.body.requestId).toBe(result.headers['x-request-id']);
        expect(result.headers['cache-control']).toBe('no-store');
    } }));
it('captures/filter-binds a durable snapshot, previews without a nonce/write and applies metadata with exact compact replay', () => fixture(async (f) => { const before = sqlite.sqliteConnection().prepare('SELECT * FROM wallet_postings ORDER BY record_id,account_id').all(), capture = await f.request('/record-selections', 'POST', { expectedRevision: 0, input: { filter } }, 'member', randomUUID()); expect(capture.status).toBe(200); expect(capture.body).toMatchObject({ count: 3, revision: 1, sourceKind: 'filter' }); const selection = { selectionId: capture.body.id, filter }, patch = { note: 'Synthetic bulk HTTP' }, preview = await f.request('/records/bulk-preview', 'POST', { selection, patch }); expect(preview.status).toBe(200); expect(preview.body).toMatchObject({ matched: 3, updated: 3, unchanged: 0 }); expect(JSON.stringify(preview.body)).not.toContain('SYNTHETIC_PRIVATE'); const nonce = randomUUID(), first = await f.request('/records/bulk-metadata', 'POST', { expectedRevision: 1, selection, patch }, 'member', nonce), again = await f.request('/records/bulk-metadata', 'POST', { expectedRevision: 1, selection, patch }, 'member', nonce); expect(first.status).toBe(200); expect(first.body).toEqual({ matched: 3, updated: 3, unchanged: 0, selectionId: capture.body.id, selectionRevision: 2 }); expect(again.body).toEqual(first.body); expect(sqlite.sqliteConnection().prepare('SELECT * FROM wallet_postings ORDER BY record_id,account_id').all()).toEqual(before); expect((await f.request('/records/' + f.expense.record.id)).body.record.note).toBe(patch.note); expect((await f.request('/records/' + f.secret.record.id)).status).toBe(404); }));
it('requires a caller nonce, rejects stale rows atomically and never accepts financial bulk fields', () => fixture(async (f) => { const selection = { ids: [f.income.record.id, f.expense.record.id], revisions: { [f.income.record.id]: 1, [f.expense.record.id]: 1 } }, patch = { note: 'Synthetic forbidden' }; expect((await f.request('/records/bulk-metadata', 'POST', { expectedRevision: 0, selection, patch })).status).toBe(400); f.ports.records.updateRecord(ctx('member', 1), f.expense.record.id, { note: 'Synthetic independent edit' }); const conflict = await f.request('/records/bulk-metadata', 'POST', { expectedRevision: 0, selection, patch }, 'member', randomUUID()); expect(conflict.status).toBe(409); expect(conflict.body.code).toBe('CONFLICT'); expect((await f.request('/records/' + f.income.record.id)).body.record.note).toBe(common.note); const bad = await f.request('/records/bulk-metadata', 'POST', { expectedRevision: 0, selection, patch: { money: money('999') } }, 'member', randomUUID()); expect(bad.status).toBe(400); expect(bad.body.code).toBe('INVALID_INPUT'); }));
it('snapshot membership/release remain actor-owned and every requested page ID needs current read permission', () => fixture(async (f) => { const nonce = randomUUID(), capture = await f.request('/record-selections', 'POST', { expectedRevision: 0, input: { ids: [f.expense.record.id], revisions: { [f.expense.record.id]: 1 } } }, 'member', nonce), path = '/record-selections/' + capture.body.id; expect(capture.status).toBe(200); const members = await f.request(path + '/members', 'POST', { ids: [f.expense.record.id, f.income.record.id] }); expect(members.status).toBe(200); expect(members.body).toEqual({ ids: [f.expense.record.id] }); expect((await f.request(path + '/members', 'POST', { ids: [f.secret.record.id] })).status).toBe(404); expect((await f.request(path + '/members', 'POST', { ids: [] }, 'other')).status).toBe(404); expect((await f.request(path, 'DELETE', { expectedRevision: 0 }, 'other', randomUUID())).status).toBe(404); expect((await f.request(path, 'DELETE', { expectedRevision: 0 }, 'member', randomUUID())).body).toEqual({ released: true }); expect((await f.request(path + '/members', 'POST', { ids: [f.expense.record.id] })).status).toBe(404); }));
it('native bulk errors retain safe requestId and never echo SQL, payloads or internal obstruction text', () => fixture(async (f) => { const nonce = randomUUID(), selection = { ids: [f.expense.record.id], revisions: { [f.expense.record.id]: 1 } }; sqlite.sqliteConnection().exec("CREATE TRIGGER synthetic_bulk_http_failure BEFORE INSERT ON wallet_audit BEGIN SELECT RAISE(ABORT,'SYNTHETIC_PRIVATE_BULK_NATIVE_DETAIL');END"); try {
    const result = await f.request('/records/bulk-metadata', 'POST', { expectedRevision: 0, selection, patch: { note: 'SYNTHETIC_PRIVATE_BULK_NOTE' } }, 'member', nonce);
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'Không xử lý được yêu cầu Wallet.', code: 'INTERNAL_ERROR', requestId: nonce });
    expect(result.headers['x-request-id']).toBe(nonce);
    expect(JSON.stringify(result.body)).not.toContain('SYNTHETIC_PRIVATE');
    expect((await f.request('/records/' + f.expense.record.id)).body.record.note).toBe(common.note);
}
finally {
    sqlite.sqliteConnection().exec('DROP TRIGGER synthetic_bulk_http_failure');
} }));
