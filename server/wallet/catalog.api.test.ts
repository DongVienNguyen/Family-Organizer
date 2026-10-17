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
it('keeps existing Admin-only catalog writes while current adult readers can list shared definitions',()=>fixture(async f=>{const category=f.ports.catalogCommands.saveCategory(ctx('admin'),{name:'Synthetic HTTP category'});for(const [path,method]of [['/categories','POST'],['/categories/'+category.id,'PATCH'],['/categories/'+category.id,'DELETE'],['/labels','POST']])for(const [key,status]of [[null,401],['child',403],['guest',403],['member',403]]){const response=await f.request(path,method,{},key);expect(response.status).toBe(status);expect(response.body.requestId).toBe(response.headers['x-request-id']);expect(response.headers['cache-control']).toBe('no-store');}expect((await f.request('/catalog/capabilities')).body).toEqual({canManage:false});expect((await f.request('/catalog/capabilities','GET',undefined,'admin')).body).toEqual({canManage:true});expect((await f.request('/categories/'+category.id)).body).toMatchObject({id:category.id,name:'Synthetic HTTP category'});expect((await f.request('/catalog')).body.categories).toContainEqual(category);}));
it('creates/edits catalog definitions with server provenance and exact request replay; forbids caller target IDs and unknown fields',()=>fixture(async f=>{const nonce=randomUUID(),created=await f.request('/categories','POST',{expectedRevision:0,input:{name:'Synthetic HTTP root',nature:'must',icon:'🧾',color:'sky'}},'admin',nonce);expect(created.status).toBe(200);expect(created.body).toMatchObject({revision:1,parentId:null,nature:'must'});const replay=await f.request('/categories','POST',{expectedRevision:0,input:{name:'Synthetic HTTP root',nature:'must',icon:'🧾',color:'sky'}},'admin',nonce);expect(replay.body).toEqual(created.body);const edited=await f.request('/categories/'+created.body.id,'PATCH',{expectedRevision:1,patch:{hidden:true,name:'Synthetic HTTP renamed'}},'admin',randomUUID());expect(edited.status).toBe(200);expect(edited.body).toMatchObject({revision:2,hidden:true,name:'Synthetic HTTP renamed'});expect((await f.request('/categories/'+created.body.id,'PATCH',{expectedRevision:1,patch:{hidden:false}},'admin',randomUUID())).status).toBe(409);for(const input of [{id:created.body.id,name:'Synthetic forbidden'},{name:'Synthetic forbidden',createdBy:who('member').userId}])expect((await f.request('/categories','POST',{expectedRevision:0,input},'admin',randomUUID())).status).toBe(400);expect((await f.request('/categories/'+created.body.id,'PATCH',{expectedRevision:2,patch:{id:'synthetic-other'}},'admin',randomUUID())).status).toBe(400);}));
it('referenced deletes return bounded safe reference information and retain rows; unreferenced deletes replay after disappearance',()=>fixture(async f=>{const root=f.ports.catalogCommands.saveCategory(ctx('admin'),{name:'Synthetic deletion root'});f.ports.catalogCommands.saveCategory(ctx('admin'),{name:'Synthetic child',parentId:root.id});const blocked=await f.request('/categories/'+root.id,'DELETE',{expectedRevision:1},'admin',randomUUID());expect(blocked.status).toBe(409);expect(blocked.body).toMatchObject({code:'CONFLICT',references:{children:1,records:0,allocations:0,history:false,otherRestricted:false}});expect(Object.keys(blocked.body).sort()).toEqual(['code','error','references','requestId']);const preview=await f.request('/categories/'+root.id+'/deletion');expect(preview.status).toBe(200);expect(preview.body).toMatchObject({id:root.id,revision:1,canDelete:false,references:blocked.body.references});const label=f.ports.catalogCommands.saveLabel(ctx('admin'),{name:'Synthetic free label'}),nonce=randomUUID(),first=await f.request('/labels/'+label.id,'DELETE',{expectedRevision:1},'admin',nonce);expect(first.status).toBe(200);expect(first.body).toEqual({id:label.id,revision:2,deleted:true});expect((await f.request('/labels/'+label.id,'DELETE',{expectedRevision:1},'admin',nonce)).body).toEqual(first.body);expect((await f.request('/labels/'+label.id)).status).toBe(404);}));
it('case-insensitive sibling duplicates retain a dedicated conflict code without making a new definition',()=>fixture(async f=>{const first=await f.request('/labels','POST',{expectedRevision:0,input:{name:'Synthetic duplicate'}},'admin',randomUUID());expect(first.status).toBe(200);const duplicate=await f.request('/labels','POST',{expectedRevision:0,input:{name:'synthetic DUPLICATE'}},'admin',randomUUID());expect(duplicate.status).toBe(409);expect(duplicate.body.code).toBe('CATALOG_NAME_CONFLICT');expect((await f.request('/catalog')).body.labels).toHaveLength(1);}));
it('a readonly Member preview excludes private record counts and free text even though the shared category name is readable',()=>fixture(async f=>{const category=f.ports.catalogCommands.saveCategory(ctx('admin'),{name:'Synthetic scoped references'});f.ports.records.updateRecord(ctx('admin',1),f.secret.record.id,{categoryId:category.id});const preview=await f.request('/categories/'+category.id+'/deletion');expect(preview.status).toBe(200);expect(preview.body.references).toEqual({children:0,records:0,allocations:0,history:false,otherRestricted:true});expect(JSON.stringify(preview.body)).not.toMatch(/SYNTHETIC_PRIVATE|12345/);expect((await f.request('/categories/'+category.id+'/deletion','GET',undefined,'admin')).body.references.records).toBe(1);}));
