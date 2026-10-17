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
it('template API protects personal definitions, supports revisioned archive and emits only compact write receipts',async()=>{await fixture(async({request,cash}:any)=>{const input={name:'SYNTHETIC_HTTP_TEMPLATE',draft:{...common,kind:'expense',accountId:cash,money:money('9007199254740993')}},nonce=randomUUID();expect((await request('/templates','GET',undefined,null)).status).toBe(401);expect((await request('/templates','GET',undefined,'child')).status).toBe(403);const created=await request('/templates','POST',{expectedRevision:0,input},'member',nonce);expect(created.status).toBe(200);expect(Object.keys(created.body).sort()).toEqual(['archivedAt','id','name','revision']);expect(created.headers['cache-control']).toContain('no-store');const id=created.body.id;expect((await request('/templates','POST',{expectedRevision:0,input},'member',nonce)).body).toEqual(created.body);expect((await request('/templates')).body.templates).toEqual([created.body]);expect((await request('/templates','GET',undefined,'other')).body.templates).toEqual([]);for(const key of ['other','admin']){expect((await request('/templates/'+id,'GET',undefined,key)).status).toBe(404);expect((await request('/templates/'+id,'PATCH',{expectedRevision:1,patch:{name:'forged'}},key,randomUUID())).status).toBe(404);}const detail=await request('/templates/'+id);expect(detail.status).toBe(200);expect(detail.body.draft.money).toEqual(money('9007199254740993'));const saved=await request('/templates/'+id,'PATCH',{expectedRevision:1,patch:{archived:true}},'member',randomUUID());expect(saved.body).toMatchObject({revision:2,archivedAt:'2026-10-17T03:00:00.000Z'});expect((await request('/templates/'+id+'/draft','POST',{now:'2026-10-19T00:00:00.000Z'})).status).toBe(409);expect((await request('/templates/'+id,'PATCH',{expectedRevision:1,patch:{archived:false}},'member',randomUUID())).status).toBe(409);});});
it('template instantiation is a readonly fresh draft and never inserts a record, source identity or nonce',async()=>{await fixture(async({request,cash}:any)=>{const created=await request('/templates','POST',{expectedRevision:0,input:{name:'Synthetic fresh template',draft:{...common,kind:'expense',accountId:cash,money:money('100000')}}},'member',randomUUID());expect(created.status).toBe(200);const before=sqlite.sqliteConnection().prepare('SELECT * FROM app_commands').all(),records=sqlite.sqliteConnection().prepare('SELECT * FROM wallet_records').all(),now='2026-10-18T18:00:00.000Z',response=await request('/templates/'+created.body.id+'/draft','POST',{now});expect(response.status).toBe(200);expect(response.body).toMatchObject({effectiveDate:'2026-10-19',occurredAt:now,reviewedAt:null,settlementStatus:'uncleared',money:money('100000')});for(const key of ['id','source','externalKey','occurrenceId','creatorId','revision'])expect(response.body).not.toHaveProperty(key);expect(sqlite.sqliteConnection().prepare('SELECT * FROM app_commands').all()).toEqual(before);expect(sqlite.sqliteConnection().prepare('SELECT * FROM wallet_records').all()).toEqual(records);expect((await request('/templates/'+created.body.id+'/draft','POST',{now},'admin')).status).toBe(404);expect((await request('/templates/'+created.body.id+'/draft','POST',{now:'bad'})).status).toBe(422);});});
it('forged ownership/IDs and financial source keys never enter the template store',async()=>{await fixture(async({request,cash}:any)=>{const draft={...common,kind:'expense',accountId:cash,money:money('1')};for(const input of [{name:'forged',draft,ownerId:who('other').userId},{name:'forged',draft,id:'forged'},{name:'forged',draft:{...draft,source:'legacy'}}])expect((await request('/templates','POST',{expectedRevision:0,input},'member',randomUUID())).status).toBe(400);expect((await request('/templates')).body.templates).toEqual([]);});});
