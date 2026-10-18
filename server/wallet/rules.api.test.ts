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
        configureWalletStorage({ migrations, snapshot, version: 11 });
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => {
        for (const name of Object.keys(walletTablesAt(11)).reverse().filter(name => name !== 'wallet_currencies'))
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
const rule={name:'Synthetic HTTP rule',criteria:{keywords:['HTTP'],sources:['manual'],kinds:['expense']},priority:1,stopOnMatch:true,actions:{markReviewed:true}};
it('internal authenticated rule HTTP previews and applies metadata once with exact nonce/hash and counts',()=>fixture(async f=>{const saved=await f.request('/rules','POST',{expectedRevision:0,draft:rule},'member',randomUUID());expect(saved.status).toBe(200);const detail=await f.request('/rules/'+saved.body.id);expect(detail.body.draft.criteria.sources).toEqual(['manual']);const preview=await f.request('/rule-previews','POST',{expectedRevision:0,input:{ruleIds:[saved.body.id]},filter},'member',randomUUID());expect(preview.status).toBe(200);expect(preview.body).toMatchObject({count:3,changed:1,unchanged:2,state:'ready',revision:1});const rows=await f.request('/rule-previews/'+preview.body.id+'/rows');expect(rows.status).toBe(200);expect(rows.body.rows).toHaveLength(3);expect(JSON.stringify(rows.body)).not.toMatch(/SYNTHETIC_PRIVATE|12345/);const nonce=randomUUID(),body={expectedRevision:1,hash:preview.body.hash},result=await f.request('/rule-previews/'+preview.body.id+'/apply','POST',body,'member',nonce);expect(result.status).toBe(200);expect(result.body).toMatchObject({updated:1,unchanged:2,revision:2});expect((await f.request('/rule-previews/'+preview.body.id+'/apply','POST',body,'member',nonce)).body).toEqual(result.body);expect(f.ports.read.getRecord(who(),f.expense.record.id).metadata.reviewedAt).toBe('2026-10-17T03:00:00.000Z');}));
it('rules keep session roles, personal configuration and previews private even from another Admin',()=>fixture(async f=>{const saved=await f.request('/rules','POST',{expectedRevision:0,draft:rule},'member',randomUUID()),preview=await f.request('/rule-previews','POST',{expectedRevision:0,input:{ruleIds:[saved.body.id]},filter},'member',randomUUID());for(const key of [null,'child','guest']){expect((await f.request('/rules','GET',undefined,key)).status).toBe(key===null?401:403);expect((await f.request('/rule-previews/'+preview.body.id+'/rows','GET',undefined,key)).status).toBe(key===null?401:403);}for(const key of ['other','admin']){expect((await f.request('/rules/'+saved.body.id,'GET',undefined,key)).status).toBe(404);expect((await f.request('/rule-previews/'+preview.body.id+'/rows','GET',undefined,key)).status).toBe(404);expect((await f.request('/rule-previews/'+preview.body.id+'/apply','POST',{expectedRevision:1,hash:preview.body.hash},key,randomUUID())).status).toBe(404);}}));
it('rules reject forged financial actions, missing nonces and source expansion with explicit 400 responses',()=>fixture(async f=>{for(const draft of [{...rule,actions:{amount:'100'}},{...rule,criteria:{...rule.criteria,sources:['bank']}},{...rule,actions:{fx:{}}}])expect((await f.request('/rules','POST',{expectedRevision:0,draft},'member',randomUUID())).status).toBe(400);expect((await f.request('/rules','POST',{expectedRevision:0,draft:rule})).status).toBe(400);expect((await f.request('/rule-previews','POST',{expectedRevision:0,input:{drafts:[rule],ownerId:'forged'},filter},'member',randomUUID())).status).toBe(400);}));
