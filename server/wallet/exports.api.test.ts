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
        configureWalletStorage({ migrations, snapshot, version: 7 });
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => {
        for (const name of Object.keys(walletTablesAt(7)).reverse().filter(name => name !== 'wallet_currencies'))
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
            let text = '';const chunks:Buffer[]=[];
            res.on('data', chunk => {text += String(chunk);chunks.push(Buffer.from(chunk));});
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body:res.headers['content-type']?.includes('application/json')?JSON.parse(text):text,headers:res.headers,raw:Buffer.concat(chunks) });
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
it('protected export HTTP streams the exact selected CSV/XLSX/PDF bytes with count/hash and no financial writes',async()=>{await fixture(async({request,cash,expense}:any)=>{const before=sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get(),selection={ids:[expense.record.id],revisions:{[expense.record.id]:1}};for(const format of ['csv','xlsx','pdf']){const result=await request('/exports','POST',{selection,format});expect(result.status).toBe(200);expect(result.headers['cache-control']).toContain('no-store');expect(result.headers['content-disposition']).toMatch(new RegExp('family-wallet-.*\\.'+format));expect(result.headers['x-wallet-record-count']).toBe('1');expect(Number(result.headers['content-length'])).toBe(result.raw.length);const {createHash}=await import('node:crypto');expect(result.headers['x-wallet-content-sha256']).toBe(createHash('sha256').update(result.raw).digest('hex'));if(format==='csv')expect(result.raw.toString()).toContain(expense.record.id);if(format==='pdf')expect(result.raw.subarray(0,5).toString()).toBe('%PDF-');}expect(sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(before);});});
it('export applies existing session roles and current record ACL, with no public token endpoint or hidden subset',async()=>{await fixture(async({request,expense,secret}:any)=>{const selection={ids:[expense.record.id],revisions:{[expense.record.id]:1}};for(const format of ['csv','xlsx','pdf'])for(const key of [null,'child','guest'])expect((await request('/exports','POST',{selection,format},key)).status).toBe(key===null?401:403);const denied=await request('/exports','POST',{selection:{ids:[expense.record.id,secret.record.id],revisions:{[expense.record.id]:1,[secret.record.id]:1}},format:'csv'});expect(denied.status).toBe(404);expect(JSON.stringify(denied.body)).not.toContain('SYNTHETIC_PRIVATE_HTTP_RECORD');expect((await request('/exports','POST',{selection:{...selection,revisions:{[expense.record.id]:2}},format:'xlsx'})).status).toBe(409);});});
it('export refuses malformed format/source/selection bodies before any successful attachment response',async()=>{await fixture(async({request,expense}:any)=>{const selection={ids:[expense.record.id],revisions:{[expense.record.id]:1}};for(const body of [{selection,format:'html'},{selection,format:'csv',ownerId:'forged'},{format:'csv'},{selection:{...selection,source:'bank'},format:'csv'}]){const result=await request('/exports','POST',body);expect(result.status).toBe(400);expect(result.headers['content-disposition']).toBeUndefined();expect(result.headers['x-wallet-record-count']).toBeUndefined();}});});
it('export retains an owned cross-page selection snapshot and explicit exclusions while later matching rows remain excluded',async()=>{await fixture(async({request,ports,cash,expense}:any)=>{const captured=ports.selections.create(ctx(),{filter:{...filter,accountIds:[cash]}}),late=ports.records.createRecord(ctx(),{...common,kind:'income',accountId:cash,money:money('7'),note:'SYNTHETIC_EXPORT_LATE'}),result=await request('/exports','POST',{format:'csv',selection:{selectionId:captured.id,filter:{...filter,accountIds:[cash]},excludeIds:[expense.record.id]}});expect(result.status).toBe(200);expect(result.headers['x-wallet-record-count']).toBe('2');const {parseCsv}=await import('./parsers/csv.js'),parsed=parseCsv(result.raw,{delimiter:','}),ids=parsed.rows.slice(1).map(row=>row.cells[0].value);expect(ids).not.toContain(late.record.id);expect(ids).not.toContain(expense.record.id);expect(ids).toHaveLength(2);expect((await request('/exports','POST',{format:'csv',selection:{selectionId:captured.id,excludeIds:['synthetic-not-member']}})).status).toBe(400);expect((await request('/exports','POST',{format:'csv',selection:{selectionId:captured.id,filter:{...filter,accountIds:[]}}})).status).toBe(409);});});
it('malformed captured-selection keys and filter fields remain client errors rather than successful files or HTTP500',async()=>{await fixture(async({request,ports,cash}:any)=>{const captured=ports.selections.create(ctx(),{filter:{...filter,accountIds:[cash]}});for(const selection of [{selectionId:captured.id,source:'bank'},{selectionId:captured.id,filter:{...filter,source:'bank'}},{selectionId:42}])expect((await request('/exports','POST',{selection,format:'csv'})).status).toBe(400);});});
