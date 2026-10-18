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
        configureWalletStorage({ migrations, snapshot, version: 10 });
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => {
        for (const name of Object.keys(walletTablesAt(10)).reverse().filter(name => name !== 'wallet_currencies'))
            tx.run('DELETE FROM ' + name);
        tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','1')");
        tx.legacy.transactions = [];
        tx.legacy.users = ['member', 'other', 'admin', 'child', 'guest'].map(key => ({ id: who(key).userId, role: who(key).role, username: 'synthetic-wallet-http-' + key, fullName: 'Synthetic wallet ' + key, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: '2026-10-17T00:00:00.000Z' }));
    });
    configureWalletSql(sqlite.sqliteConnection());
    const ports = createWalletPorts(sqlite, gateway, { now: () => Date.parse('2026-10-17T03:00:00.000Z'), enqueueImport: input => { const tx = gateway.currentAppWriteTx()!; const jobId = randomUUID(); tx.run("INSERT INTO app_meta VALUES(?,?)", 'synthetic-import-job:' + jobId, JSON.stringify(input)); return jobId; } }), make = (key: string, name: string, currency: string, openingMinor: string) => ports.accounts.createAccount(ctx(key), { name, type: 'bank', currency, openingMinor, openingDate: '2026-10-17', accessMode: 'private' }).account.id, cash = make('member', 'Synthetic visible cash', 'VND', '1000000'), bank = make('member', 'Synthetic visible bank', 'VND', '2000000'), hidden = make('other', 'SYNTHETIC_PRIVATE_HTTP_BANK', 'USD', '10000');
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
const mapping = { headerRow: 1, dateColumn: 1, amount: { mode: 'signed', column: 2 }, dateFormat: 'DD/MM/YYYY', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', status: 'cleared', payeeColumn: 3, noteColumn: 4, labelDelimiter: '|', defaultCategoryId: null, labelIds: [], excludedRows: [] };
const file = (accountId: string, body = 'date,amount,payee,note\n17/10/2026,-100.000,Synthetic shop,Synthetic note\n') => ({ accountId, fileName: 'synthetic-http.csv', format: 'csv', base64: Buffer.from(body).toString('base64') });
it('internal import API stages, previews, queues, reads history/results and safely undoes source records', async () => { await fixture(async ({ request, cash, ports }: any) => { const nonce = randomUUID(), staged = await request('/imports/stage', 'POST', { expectedRevision: 0, file: file(cash) }, 'member', nonce); expect(staged.status).toBe(200); expect(staged.headers['cache-control']).toContain('no-store'); expect(staged.body).not.toHaveProperty('fileKey'); expect(staged.body).not.toHaveProperty('fileSha256'); expect((await request('/imports/stage', 'POST', { expectedRevision: 0, file: file(cash) }, 'member', nonce)).body).toEqual(staged.body); const id = staged.body.id, preview = await request('/imports/' + id + '/preview', 'POST', { expectedRevision: 1, mapping }, 'member', randomUUID()); expect(preview.status).toBe(200); expect(preview.body).toMatchObject({ state: 'preview', validCount: 1, errorCount: 0 }); expect(sqlite.sqliteConnection().prepare("SELECT count(*) AS n FROM wallet_records WHERE source='import'").get()).toEqual({ n: 0 }); const rows = await request('/imports/' + id + '/rows'); expect(rows.status).toBe(200); expect(rows.body).toMatchObject({ id, total: 2, rows: [{ rowNumber: 1, status: 'header', errors: [], warnings: [], draft: null, rawCells: ['date', 'amount', 'payee', 'note'] }, { rowNumber: 2, status: 'valid', draft: { kind: 'expense', money: { minor: '100000', currency: 'VND' } } }] }); const approval = await request('/imports/' + id + '/commit', 'POST', { expectedRevision: 2, previewRevision: 2 }, 'member', randomUUID()); expect(approval.status).toBe(200); expect(approval.body).toMatchObject({ state: 'queued', revision: 3, jobId: expect.any(String) }); const committed = ports.imports.applyQueuedImport(who().userId, id, 3, new AbortController().signal); expect(committed).toMatchObject({ state: 'committed', revision: 4, importedCount: 1 }); expect((await request('/imports/history')).body.batches).toEqual([expect.objectContaining({ id, state: 'committed' })]); const undone = await request('/imports/' + id + '/undo', 'POST', { expectedRevision: 4, policy: 'rejectIfModified' }, 'member', randomUUID()); expect(undone.status).toBe(200); expect(undone.body).toMatchObject({ state: 'undone', undoneCount: 1, keptCount: 0 }); expect(sqlite.sqliteConnection().prepare("SELECT source,settlement_status,external_key FROM wallet_records WHERE source='import'").get()).toEqual({ source: 'import', settlement_status: 'voided', external_key: null }); }); });
it('every import route rejects unauthenticated/child/guest requests and hides another owner even from Admin', async () => { await fixture(async ({ request, cash }: any) => { const staged = await request('/imports/stage', 'POST', { expectedRevision: 0, file: file(cash) }, 'member', randomUUID()), id = staged.body.id, routes: [
    string,
    string,
    unknown
][] = [['/imports/history', 'GET', undefined], ['/imports/' + id, 'GET', undefined], ['/imports/' + id + '/rows', 'GET', undefined], ['/imports/stage', 'POST', { expectedRevision: 0, file: file(cash) }], ['/imports/' + id + '/preview', 'POST', { expectedRevision: 1, mapping }], ['/imports/' + id + '/commit', 'POST', { expectedRevision: 2, previewRevision: 2 }], ['/imports/' + id + '/undo', 'POST', { expectedRevision: 3, policy: 'onlyUnmodified' }], ['/imports/' + id + '/reopen', 'POST', { expectedRevision: 3 }]]; expect(staged.status).toBe(200); for (const [path, method, body] of routes)
    for (const key of [null, 'child', 'guest'])
        expect((await request(path, method, body, key, randomUUID())).status).toBe(key === null ? 401 : 403); for (const key of ['other', 'admin']) {
    expect((await request('/imports/' + id, 'GET', undefined, key)).status).toBe(404);
    expect((await request('/imports/' + id + '/rows', 'GET', undefined, key)).status).toBe(404);
    expect((await request('/imports/' + id + '/preview', 'POST', { expectedRevision: 1, mapping }, key, randomUUID())).status).toBe(404);
    expect((await request('/imports/history', 'GET', undefined, key)).body.batches).toEqual([]);
} expect(sqlite.sqliteConnection().prepare("SELECT count(*) AS n FROM wallet_records WHERE source='import'").get()).toEqual({ n: 0 }); }); });
it('stage rejects forged paths/ownership/source, absent write nonce and invalid base64 before any file/batch is committed', async () => { await fixture(async ({ request, cash, hidden }: any) => { for (const bad of [{ ...file(cash), fileName: '../../escape.csv' }, { ...file(cash), ownerId: who('other').userId }, { ...file(cash), source: 'manual' }, { ...file(cash), base64: '%%%=' }, { ...file(cash), base64: 'YR==' }])
    expect((await request('/imports/stage', 'POST', { expectedRevision: 0, file: bad }, 'member', randomUUID())).status).toBe(400); expect((await request('/imports/stage', 'POST', { expectedRevision: 0, file: file(cash) }, 'member')).status).toBe(400); expect((await request('/imports/stage', 'POST', { expectedRevision: 0, file: file(hidden) }, 'member', randomUUID())).status).toBe(404); expect(sqlite.sqliteConnection().prepare('SELECT * FROM wallet_import_batches').all()).toEqual([]); }); });
it('explicit unresolved errors and stale preview return errors with no ledger writes; the 20MiB file boundary reaches staging', async () => { await fixture(async ({ request, cash }: any) => { const a = await request('/imports/stage', 'POST', { expectedRevision: 0, file: file(cash, 'date,amount,payee,note\n31/02/2026,NaN,Synthetic,\n') }, 'member', randomUUID()), id = a.body.id, p = await request('/imports/' + id + '/preview', 'POST', { expectedRevision: 1, mapping }, 'member', randomUUID()); expect(p.body.errorCount).toBe(1); expect((await request('/imports/' + id + '/commit', 'POST', { expectedRevision: 2, previewRevision: 2 }, 'member', randomUUID())).status).toBe(422); expect((await request('/imports/' + id + '/preview', 'POST', { expectedRevision: 1, mapping }, 'member', randomUUID())).status).toBe(409); const big = { ...file(cash), base64: Buffer.alloc(20 * 1024 * 1024, 0x61).toString('base64') }, limit = await request('/imports/stage', 'POST', { expectedRevision: 0, file: big }, 'member', randomUUID()); expect(limit.status).toBe(200); expect(limit.body.state).toBe('staged'); expect(sqlite.sqliteConnection().prepare("SELECT count(*) AS n FROM wallet_records WHERE source='import'").get()).toEqual({ n: 0 }); }); });
