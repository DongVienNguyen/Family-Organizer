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
import { createWalletPorts } from './ports.js';
const who = (key = 'member') => ({ userId: 'synthetic-wallet-http-' + key, role: key === 'admin' ? UserRole.ADMIN : key === 'child' ? UserRole.CHILD : key === 'guest' ? UserRole.GUEST : UserRole.MEMBER }), ctx = (key = 'member', expectedRevision = 0) => ({ actor: who(key), idempotencyKey: randomUUID(), expectedRevision }), write = <T>(fn: Parameters<typeof gateway.withAppWriteTransaction<T>>[1]) => gateway.withAppWriteTransaction({ actorId: 'system:synthetic', command: 'synthetic:wallet-http', requestId: randomUUID(), payloadHash: 'synthetic' }, fn);
const common = { effectiveDate: '2026-10-17', timezone: 'Asia/Saigon', note: 'Synthetic HTTP note', settlementStatus: 'cleared' as const }, money = (minor: string, currency = 'VND') => ({ minor, currency }), filter = { period: { fromDate: '2026-10-01', toDateExclusive: '2026-11-01', timezone: 'Asia/Saigon' }, referenceCurrency: 'VND', statuses: ['cleared'] };
let initialized = false;
async function fixture(work: (f: any) => Promise<void>) {
    if (!initialized) {
        configureWalletStorage({ migrations, snapshot, version: 4 });
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => { for (const name of Object.keys(walletTablesAt(4)).reverse().filter(name => name !== 'wallet_currencies'))
        tx.run('DELETE FROM ' + name); tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','1')"); tx.legacy.transactions = []; tx.legacy.users = ['member', 'other', 'admin', 'child', 'guest'].map(key => ({ id: who(key).userId, role: who(key).role, username: 'synthetic-wallet-http-' + key, fullName: 'Synthetic wallet ' + key, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: '2026-10-17T00:00:00.000Z' })); });
    const ports = createWalletPorts(sqlite, gateway, { now: () => Date.parse('2026-10-17T03:00:00.000Z') }), make = (key: string, name: string, currency: string, openingMinor: string) => ports.accounts.createAccount(ctx(key), { name, type: 'bank', currency, openingMinor, openingDate: '2026-10-17', accessMode: 'private' }).account.id, cash = make('member', 'Synthetic visible cash', 'VND', '1000000'), bank = make('member', 'Synthetic visible bank', 'VND', '2000000'), hidden = make('other', 'SYNTHETIC_PRIVATE_HTTP_BANK', 'USD', '10000');
    const income = ports.records.createRecord(ctx(), { ...common, kind: 'income', accountId: cash, money: money('500000') }), expense = ports.records.createRecord(ctx(), { ...common, kind: 'expense', accountId: cash, money: money('200000') }), move = ports.records.createRecord(ctx(), { ...common, kind: 'transfer', fromAccountId: cash, toAccountId: bank, debit: money('300000'), credit: money('300000') }), secret = ports.records.createRecord(ctx('other'), { ...common, note: 'SYNTHETIC_PRIVATE_HTTP_RECORD', kind: 'expense', accountId: hidden, money: money('12345', 'USD') });
    const deps: any = syntheticDependencies({ phase: 'ready', storageWritable: true });
    deps.db = db;
    deps.sqlite = sqlite;
    deps.wallet = ports;
    deps.auth = createAuth({ store: new NativeSessionStore(), getUsers: () => db.FamilyDB.getUsers(), getSecret: () => 'synthetic-wallet-http-auth-key' });
    const tokens = Object.fromEntries(db.FamilyDB.getUsers().map(user => [user.id, deps.auth.issue(user)])), handle = await createApp({ production: true, codeRoot: process.cwd(), dataRoot: process.env.DATA_DIR! } as any, deps), server = http.createServer(handle.app).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const request = (path: string, method = 'GET', body?: unknown, key: string | null = 'member', nonce: string | undefined = undefined) => new Promise<any>((resolve, reject) => { const encoded = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: Record<string, string> = { ...(key ? { Authorization: 'Bearer ' + tokens[who(key).userId] } : {}), ...(nonce === undefined ? {} : { 'x-request-id': nonce }), ...(encoded === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(encoded)) }) }, req = http.request({ hostname: '127.0.0.1', port: (server.address() as any).port, path: '/api/wallet' + path, method, headers, agent: false }, res => { let text = ''; res.on('data', chunk => text += String(chunk)); res.on('end', () => { try {
        resolve({ status: res.statusCode, body: JSON.parse(text), headers: res.headers });
    }
    catch {
        reject(Error('Invalid synthetic HTTP response'));
    } }); }); req.on('error', reject); req.end(encoded); });
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
it('uses existing auth: anonymous401, Child/Guest403 on every finance route before command parsing', () => fixture(async (f) => {
    const paths = [['GET', '/status'], ['GET','/record-filter-options'], ['GET', '/accounts'], ['GET', '/accounts/' + f.cash], ['GET', '/accounts/' + f.cash + '/balance?date=2026-10-17'], ['POST', '/accounts'], ['PATCH', '/accounts/' + f.cash], ['DELETE', '/accounts/' + f.cash], ['GET', '/accounts/' + f.cash + '/grants'], ['PUT', '/accounts/' + f.cash + '/grants/' + who('other').userId], ['DELETE', '/accounts/' + f.cash + '/grants/' + who('other').userId], ['POST', '/records/query'], ['GET', '/records/' + f.expense.record.id], ['POST', '/records'], ['PATCH', '/records/' + f.expense.record.id], ['DELETE', '/records/' + f.expense.record.id]];
    for (const [method, path] of paths) {
        for (const [key, status] of [[null, 401], ['child', 403], ['guest', 403]]) {
            const result = await f.request(path, method, method === 'GET' ? undefined : {}, key);
            expect(result.status).toBe(status);
            expect(result.body.requestId).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
            expect(result.body.requestId).toBe(result.headers['x-request-id']);
            expect(result.body.error).toEqual(expect.any(String));
        }
    }
}));
it('lists/counts current readable rows, returns exact balances and hides private/missing resources with the same404 shape', () => fixture(async (f) => {
    const page = await f.request('/records/query', 'POST', { filter, cursor: null, limit: 100 });
    expect(page.status).toBe(200);
    expect(page.body.total).toBe(3);
    expect(JSON.stringify(page.body)).not.toContain('SYNTHETIC_PRIVATE_HTTP');
    const balance = await f.request('/accounts/' + f.cash + '/balance?date=2026-10-17');
    expect(balance.body).toMatchObject({ book: { minor: '1000000', currency: 'VND' }, cleared: { minor: '1000000', currency: 'VND' } });
    expect((await f.request('/accounts/' + f.bank + '/balance?date=2026-10-17')).body.book.minor).toBe('2300000');
    for (const path of ['/accounts/' + f.hidden, '/records/' + f.secret.record.id]) {
        const hidden = await f.request(path), missing = await f.request(path.replace(/[^/]+$/, 'synthetic-missing'));
        expect(hidden.status).toBe(404);
        expect(missing.status).toBe(404);
        expect(hidden.body.error).toBe(missing.body.error);
        expect(hidden.body.code).toBe('NOT_FOUND');
    }
    expect((await f.request('/records/' + f.secret.record.id, 'GET', undefined, 'admin')).status).toBe(200);
}));
it('ignores forged creatorId, requires caller-owned command identity and replays the exact same receipt without a duplicate posting', () => fixture(async (f) => {
    const body = { expectedRevision: 0, input: { ...common, kind: 'expense', accountId: f.cash, money: money('123'), creatorId: who('other').userId } }, nonce = randomUUID();
    expect((await f.request('/records', 'POST', body)).status).toBe(400);
    const first = await f.request('/records', 'POST', body, 'member', nonce), again = await f.request('/records', 'POST', body, 'member', nonce);
    expect(first.status).toBe(200);
    expect(first.body.record.creatorId).toBe(who().userId);
    expect(again.body).toEqual(first.body);
    expect(sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_records WHERE id=?').get(first.body.record.id)).toEqual({ n: 1 });
    expect((await f.request('/records', 'POST', { ...body, input: { ...body.input, money: money('124') } }, 'member', nonce)).status).toBe(409);
}));
it('read grants permit scoped reads but no records or grant writes; revoke takes effect immediately', () => fixture(async (f) => {
    const path = '/accounts/' + f.hidden + '/grants/' + who().userId;
    expect((await f.request(path, 'PUT', { expectedRevision: 1, permission: 'read' }, 'other', randomUUID())).status).toBe(200);
    expect((await f.request('/accounts/' + f.hidden)).body.account.permission).toBe('read');
    expect((await f.request('/records', 'POST', { expectedRevision: 0, input: { ...common, kind: 'expense', accountId: f.hidden, money: money('1', 'USD') } }, 'member', randomUUID())).status).toBe(403);
    expect((await f.request('/accounts/' + f.hidden + '/grants/' + who('admin').userId, 'PUT', { expectedRevision: 2, permission: 'manage' }, 'member', randomUUID())).status).toBe(403);
    expect((await f.request(path, 'DELETE', { expectedRevision: 2 }, 'other', randomUUID())).status).toBe(200);
    expect((await f.request('/accounts/' + f.hidden)).status).toBe(404);
}));
it('partial transfer reads never return hidden account/name/FX amount/quote/payee or private fee ID', () => fixture(async (f) => {
    const created = await f.request('/records', 'POST', { expectedRevision: 0, input: { ...common, note: 'SYNTHETIC_PRIVATE_COUNTERPARTY', payee: 'SYNTHETIC_PRIVATE_COUNTERPARTY', kind: 'transfer', fromAccountId: f.cash, toAccountId: f.hidden, debit: money('2500000'), credit: money('10000', 'USD'), fx: { numerator: '1', denominator: '25000' }, fee: { accountId: f.hidden, money: money('100', 'USD') } } }, 'admin', randomUUID());
    expect(created.status).toBe(200);
    const result = await f.request('/records/' + created.body.record.id);
    expect(result.status).toBe(200);
    expect(result.body.partial).toBe(true);
    expect(result.body.fx).toBeNull();
    expect(result.body.feeRecordId).toBeNull();
    expect(result.body.metadata.payee).toBe('');
    for (const hidden of [f.hidden, created.body.feeRecordId, 'SYNTHETIC_PRIVATE_COUNTERPARTY', 'SYNTHETIC_PRIVATE_HTTP_BANK', 'USD'])
        expect(JSON.stringify(result.body)).not.toContain(hidden);
    const full = await f.request('/records/' + created.body.record.id, 'GET', undefined, 'admin');
    expect(full.body.fx).toMatchObject({ creditMinor: '10000', toCurrency: 'USD' });
}));
it('optimistic update and void preserve idempotency and balance effects across actual HTTP', () => fixture(async (f) => {
    const id = f.expense.record.id, nonce = randomUUID(), updated = await f.request('/records/' + id, 'PATCH', { expectedRevision: 1, patch: { money: money('250000') } }, 'member', nonce);
    expect(updated.status).toBe(200);
    expect(updated.body.record.revision).toBe(2);
    expect((await f.request('/records/' + id, 'PATCH', { expectedRevision: 1, patch: { note: 'Synthetic stale' } }, 'member', randomUUID())).status).toBe(409);
    const request = randomUUID(), voided = await f.request('/records/' + id, 'DELETE', { expectedRevision: 2 }, 'member', request);
    expect(voided.status).toBe(200);
    expect((await f.request('/records/' + id, 'DELETE', { expectedRevision: 2 }, 'member', request)).body).toEqual(voided.body);
    expect((await f.request('/accounts/' + f.cash + '/balance?date=2026-10-17')).body.book.minor).toBe('1200000');
}));
it('inactive storage returns409 to adults and403 to restricted roles, without creating schema or data', () => fixture(async (f) => {
    write(tx => tx.run("UPDATE app_meta SET value='0' WHERE key='wallet_active'"));
    expect((await f.request('/status')).body.active).toBe(false);
    expect((await f.request('/accounts')).status).toBe(409);
    expect((await f.request('/accounts', 'GET', undefined, 'child')).status).toBe(403);
}));
it('malformed JSON, invalid fields and unexpected native errors have safe structured errors and a requestId', () => fixture(async (f) => {
    const marker = 'SYNTHETIC_BODY_MUST_NOT_ECHO', bad = await f.request('/records', 'POST', '{"' + marker + '":');
    expect(bad.status).toBe(400);
    expect(bad.body.requestId).toBe(bad.headers['x-request-id']);
    expect(JSON.stringify(bad.body)).not.toContain(marker);
    const invalid = await f.request('/records/query', 'POST', { filter: { ...filter, referenceCurrency: 'JPY' }, cursor: null, limit: 100 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_INPUT');
    sqlite.sqliteConnection().exec("CREATE TRIGGER wallet_synthetic_api_fail BEFORE INSERT ON wallet_records BEGIN SELECT RAISE(ABORT,'SYNTHETIC_NATIVE_PRIVATE_DETAIL');END");
    try {
        const failed = await f.request('/records', 'POST', { expectedRevision: 0, input: { ...common, kind: 'expense', accountId: f.cash, money: money('1') } }, 'member', randomUUID());
        expect(failed.status).toBe(500);
        expect(failed.body.code).toBe('INTERNAL_ERROR');
        expect(JSON.stringify(failed.body)).not.toContain('SYNTHETIC_NATIVE_PRIVATE_DETAIL');
        expect(failed.body.requestId).toBe(failed.headers['x-request-id']);
    }
    finally {
        sqlite.sqliteConnection().exec('DROP TRIGGER wallet_synthetic_api_fail');
    }
}));
it('invalidation audiences follow current account/record grants and never include Child/Guest or unrelated private readers', () => fixture(async (f) => {
    expect([...f.ports.accountAudience(f.cash)].sort()).toEqual([who('admin').userId, who().userId].sort());
    expect([...f.ports.recordAudience(f.secret.record.id)].sort()).toEqual([who('admin').userId, who('other').userId].sort());
    f.ports.accounts.setGrant(ctx('other', 1), f.hidden, who().userId, 'read');
    expect(f.ports.recordAudience(f.secret.record.id).has(who().userId)).toBe(true);
    f.ports.accounts.removeGrant(ctx('other', 2), f.hidden, who().userId);
    expect(f.ports.recordAudience(f.secret.record.id).has(who().userId)).toBe(false);
}));
it('PUT null permission is invalid and never behaves like DELETE', () => fixture(async (f) => { const path = '/accounts/' + f.hidden + '/grants/' + who().userId; expect((await f.request(path, 'PUT', { expectedRevision: 1, permission: 'read' }, 'other', randomUUID())).status).toBe(200); const result = await f.request(path, 'PUT', { expectedRevision: 2, permission: null }, 'other', randomUUID()); expect(result.status).toBe(422); expect((await f.request('/accounts/' + f.hidden)).body.account.permission).toBe('read'); }));
it.each([null, 'yes'])('invalid archive value%j is a typed validation error rather than a server failure', archived => fixture(async (f) => { const result = await f.request('/accounts/' + f.cash, 'PATCH', { expectedRevision: 1, patch: { archived } }, 'member', randomUUID()); expect(result.status).toBe(422); expect(result.body.code).toBe('INVALID_INPUT'); expect(result.body.requestId).toBe(result.headers['x-request-id']); expect((await f.request('/accounts/' + f.cash)).body.account.revision).toBe(1); }));
it('an explicit null page limit is invalid rather than silently using a default', () => fixture(async (f) => { const result = await f.request('/records/query', 'POST', { filter, cursor: null, limit: null }); expect(result.status).toBe(400); }));
it('grant list is available only to a current manager and contains no account balance or unrelated account grant', () => fixture(async (f) => { const grantPath = '/accounts/' + f.hidden + '/grants'; expect((await f.request(grantPath)).status).toBe(404); f.ports.accounts.setGrant(ctx('other', 1), f.hidden, who().userId, 'read'); expect((await f.request(grantPath)).status).toBe(403); const result = await f.request(grantPath, 'GET', undefined, 'other'); expect(result.status).toBe(200); expect(result.body).toEqual({ grants: [{ accountId: f.hidden, userId: who().userId, permission: 'read' }] }); expect(JSON.stringify(result.body)).not.toContain('SYNTHETIC_PRIVATE_HTTP_BANK'); }));
it('account deletion archives rather than erases history and prevents new postings while retaining exact balances', () => fixture(async (f) => { const result = await f.request('/accounts/' + f.cash, 'DELETE', { expectedRevision: 1 }, 'member', randomUUID()); expect(result.status).toBe(200); expect(result.body.account.archivedAt).toBe('2026-10-17T03:00:00.000Z'); expect((await f.request('/accounts/' + f.cash + '/balance?date=2026-10-17')).body.book.minor).toBe('1000000'); const rejected = await f.request('/records', 'POST', { expectedRevision: 0, input: { ...common, kind: 'expense', accountId: f.cash, money: money('1') } }, 'member', randomUUID()); expect(rejected.status).toBe(409); expect((await f.request('/records/' + f.expense.record.id)).status).toBe(200); }));
it('maintenance rejection keeps a safe requestId before auth or JSON parsing runs', () => fixture(async (f) => { f.state.phase = 'maintenance'; const nonce = 'synthetic-maintenance-request', result = await f.request('/accounts', 'GET', undefined, 'member', nonce); expect(result.status).toBe(503); expect(result.body.requestId).toBe(nonce); expect(result.headers['x-request-id']).toBe(nonce); expect(result.body.code).toBe('INTERNAL_ERROR'); }));
it('catalog uses the same adult gate and returns family definitions without private financial bodies',()=>fixture(async f=>{
 write(tx=>{tx.run("INSERT INTO wallet_categories(id,parent_id,name,nature,archived_at) VALUES('synthetic-http-category',NULL,'Synthetic catalog','need',NULL)");tx.run("INSERT INTO wallet_category_metadata(category_id,hidden) VALUES('synthetic-http-category',1)");});
 for(const [key,status]of [[null,401],['child',403],['guest',403]] as const)expect((await f.request('/catalog','GET',undefined,key)).status).toBe(status);
 const result=await f.request('/catalog');expect(result.status).toBe(200);expect(result.body).toEqual({categories:[{id:'synthetic-http-category',parentId:null,name:'Synthetic catalog',nature:'need',archivedAt:null,hidden:true,revision:1,icon:'',color:''}],labels:[]});expect(JSON.stringify(result.body)).not.toContain('SYNTHETIC_PRIVATE_HTTP');
}));
it('catalog refuses missing entity metadata instead of quietly omitting historical definitions',()=>fixture(async f=>{
 write(tx=>{tx.run("INSERT INTO wallet_labels(id,name,archived_at) VALUES('synthetic-orphan-metadata','Synthetic retained definition',NULL)");});
 const result=await f.request('/catalog');expect(result.status).toBe(500);expect(result.body.code).toBe('INTERNAL_ERROR');expect(JSON.stringify(result.body)).not.toContain('Synthetic retained definition');
}));
it('record actions use current auth and hide private resources before returning capabilities',()=>fixture(async f=>{
 const path='/records/'+f.expense.record.id+'/actions';for(const[key,status]of [[null,401],['child',403],['guest',403]]as const)expect((await f.request(path,'GET',undefined,key)).status).toBe(status);
 expect((await f.request(path)).body).toEqual({recordId:f.expense.record.id,canEdit:true,canVoid:true});expect((await f.request('/records/'+f.secret.record.id+'/actions')).status).toBe(404);
}));
it('linked fee actions navigate only to a currently readable parent and never allow direct edits/voids',()=>fixture(async f=>{
 const parent=f.ports.records.createRecord(ctx(),{...common,kind:'transfer',fromAccountId:f.cash,toAccountId:f.bank,debit:money('100'),credit:money('100'),fee:{accountId:f.cash,money:money('1')}});
 expect((await f.request('/records/'+parent.feeRecordId+'/actions')).body).toEqual({recordId:parent.feeRecordId,canEdit:false,canVoid:false,editViaTransferId:parent.record.id});
 expect((await f.request('/records/'+parent.record.id+'/actions')).body).toEqual({recordId:parent.record.id,canEdit:true,canVoid:true});
}));
it('a readable fee never discloses a wholly private parent through action navigation',()=>fixture(async f=>{
 f.ports.accounts.setGrant(ctx('member',1),f.cash,who('other').userId,'contribute');const parent=f.ports.records.createRecord(ctx('other'),{...common,kind:'transfer',fromAccountId:f.hidden,toAccountId:null,debit:money('100','USD'),credit:money('100','USD'),fee:{accountId:f.cash,money:money('1')}});
 const result=await f.request('/records/'+parent.feeRecordId+'/actions');expect(result.status).toBe(200);expect(result.body).toEqual({recordId:parent.feeRecordId,canEdit:false,canVoid:false});expect(JSON.stringify(result.body)).not.toContain(parent.record.id);
}));
it('read-only grants and voided records cannot acquire edit/void capabilities',()=>fixture(async f=>{
 f.ports.accounts.setGrant(ctx('other',1),f.hidden,who().userId,'read');expect((await f.request('/records/'+f.secret.record.id+'/actions')).body).toEqual({recordId:f.secret.record.id,canEdit:false,canVoid:false});
 f.ports.records.voidRecord(ctx('member',1),f.expense.record.id);expect((await f.request('/records/'+f.expense.record.id+'/actions')).body).toEqual({recordId:f.expense.record.id,canEdit:false,canVoid:false});
}));

it('filter metadata excludes private and partial transfer methods until current full read grants allow them',()=>fixture(async f=>{
 f.ports.records.updateRecord(ctx('other',1),f.secret.record.id,{paymentMethod:'SYNTHETIC_PRIVATE_FILTER_METHOD'});
 f.ports.records.createRecord(ctx('admin'),{...common,kind:'transfer',fromAccountId:f.cash,toAccountId:f.hidden,debit:money('25000'),credit:money('100','USD'),fx:{numerator:'1',denominator:'25000'},paymentMethod:'SYNTHETIC_PARTIAL_FILTER_METHOD'});
 const first=await f.request('/record-filter-options');expect(first.status).toBe(200);expect(first.body.paymentMethods).toEqual([]);expect(first.body.creators.map((row:any)=>row.id)).not.toContain(who('other').userId);expect(JSON.stringify(first.body)).not.toMatch(/minor|balance|SYNTHETIC_PRIVATE|SYNTHETIC_PARTIAL/);
 f.ports.accounts.setGrant(ctx('other',1),f.hidden,who().userId,'read');const granted=await f.request('/record-filter-options');expect(granted.status).toBe(200);expect(granted.body.paymentMethods).toEqual(['SYNTHETIC_PARTIAL_FILTER_METHOD','SYNTHETIC_PRIVATE_FILTER_METHOD']);f.ports.accounts.removeGrant(ctx('other',2),f.hidden,who().userId);expect((await f.request('/record-filter-options')).body.paymentMethods).toEqual([]);
}));
