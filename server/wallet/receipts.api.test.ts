import * as media from '../media.js';
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
        configureWalletStorage({ migrations, snapshot, version: 5 });
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => { for (const name of Object.keys(walletTablesAt(5)).reverse().filter(name => name !== 'wallet_currencies'))
        tx.run('DELETE FROM ' + name); tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','1')"); tx.legacy.transactions = []; tx.legacy.users = ['member', 'other', 'admin', 'child', 'guest'].map(key => ({ id: who(key).userId, role: who(key).role, username: 'synthetic-wallet-http-' + key, fullName: 'Synthetic wallet ' + key, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: '2026-10-17T00:00:00.000Z' })); });
    const ports = createWalletPorts(sqlite, gateway, { now: () => Date.parse('2026-10-17T03:00:00.000Z') }), make = (key: string, name: string, currency: string, openingMinor: string) => ports.accounts.createAccount(ctx(key), { name, type: 'bank', currency, openingMinor, openingDate: '2026-10-17', accessMode: 'private' }).account.id, cash = make('member', 'Synthetic visible cash', 'VND', '1000000'), bank = make('member', 'Synthetic visible bank', 'VND', '2000000'), hidden = make('other', 'SYNTHETIC_PRIVATE_HTTP_BANK', 'USD', '10000');
    const income = ports.records.createRecord(ctx(), { ...common, kind: 'income', accountId: cash, money: money('500000') }), expense = ports.records.createRecord(ctx(), { ...common, kind: 'expense', accountId: cash, money: money('200000') }), move = ports.records.createRecord(ctx(), { ...common, kind: 'transfer', fromAccountId: cash, toAccountId: bank, debit: money('300000'), credit: money('300000') }), secret = ports.records.createRecord(ctx('other'), { ...common, note: 'SYNTHETIC_PRIVATE_HTTP_RECORD', kind: 'expense', accountId: hidden, money: money('12345', 'USD') });
    const deps: any = syntheticDependencies({ phase: 'ready', storageWritable: true });
    deps.db = db;
    deps.sqlite = sqlite;
    deps.media = media;
    deps.wallet = ports;
    deps.auth = createAuth({ store: new NativeSessionStore(), getUsers: () => db.FamilyDB.getUsers(), getSecret: () => 'synthetic-wallet-http-auth-key' });
    const tokens = Object.fromEntries(db.FamilyDB.getUsers().map(user => [user.id, deps.auth.issue(user)])), handle = await createApp({ production: true, codeRoot: process.cwd(), dataRoot: process.env.DATA_DIR! } as any, deps), server = http.createServer(handle.app).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const request = (path: string, method = 'GET', body?: unknown, key: string | null = 'member', nonce: string | undefined = undefined) => new Promise<any>((resolve, reject) => { const encoded = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: Record<string, string> = { ...(key ? { Authorization: 'Bearer ' + tokens[who(key).userId] } : {}), ...(nonce === undefined ? {} : { 'x-request-id': nonce }), ...(encoded === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(encoded)) }) }, req = http.request({ hostname: '127.0.0.1', port: (server.address() as any).port, path: path.startsWith('/uploads/')?path:'/api/wallet' + path, method, headers, agent: false }, res => { const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(Buffer.from(chunk)));res.on('end',()=>{const bytes=Buffer.concat(chunks),text=bytes.toString();let body:any;try{body=JSON.parse(text);}catch{}resolve({status:res.statusCode,body,bytes,text,headers:res.headers});}); }); req.on('error', reject); req.end(encoded); });
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

const png=Buffer.from([137,80,78,71,13,10,26,10]),upload={fileName:'Hóa đơn synthetic.png',dataUrl:'data:image/png;base64,'+png.toString('base64')};
it('all receipt routes require an existing session and current adult finance role',()=>fixture(async f=>{
 const root='/records/'+f.expense.record.id+'/receipts',paths=[['GET',root],['GET',root+'/'+randomUUID()],['POST',root],['DELETE',root+'/'+randomUUID()]];
 for(const [method,path] of paths)for(const [key,status] of [[null,401],['child',403],['guest',403]] as const){const result=await f.request(path,method,method==='GET'?undefined:{},key);expect(result.status).toBe(status);expect(result.body.requestId).toBe(result.headers['x-request-id']);expect(result.headers['cache-control']).toBe('no-store');}
}));
it('real HTTP attach/replay/read/detach is revisioned, private and keeps exact postings',()=>fixture(async f=>{
 const root='/records/'+f.expense.record.id+'/receipts',body={expectedRevision:1,input:upload},nonce=randomUUID(),before=sqlite.sqliteConnection().prepare('SELECT * FROM wallet_postings').all();
 expect((await f.request(root,'POST',body)).status).toBe(400);
 const first=await f.request(root,'POST',body,'member',nonce),again=await f.request(root,'POST',body,'member',nonce);expect(first.status).toBe(200);expect(again.body).toEqual(first.body);expect(first.body.revision).toBe(2);expect(first.body.receipt.url).toBeUndefined();
 const receipt=first.body.receipt,binary=await f.request(root+'/'+receipt.id);expect(binary.status).toBe(200);expect(binary.bytes).toEqual(png);expect(binary.headers['content-type']).toMatch(/^image\/png/);expect(binary.headers['x-content-type-options']).toBe('nosniff');expect(binary.headers['cache-control']).toBe('no-store');expect(binary.headers['content-disposition']).toContain('attachment');
 const direct=await f.request('/uploads/wallet-receipts/'+receipt.fileKey);expect(direct.status).toBe(404);expect(direct.bytes).not.toEqual(png);
 expect((await f.request(root)).body).toMatchObject({recordId:f.expense.record.id,revision:2,receipts:[receipt]});
 expect((await f.request(root+'/'+receipt.id,'DELETE',{expectedRevision:1},'member',randomUUID())).status).toBe(409);
 const removed=await f.request(root+'/'+receipt.id,'DELETE',{expectedRevision:2},'member',randomUUID());expect(removed.status).toBe(200);expect(removed.body.revision).toBe(3);expect((await f.request(root+'/'+receipt.id)).status).toBe(404);expect((await f.request(root)).body.receipts).toEqual([]);expect(sqlite.sqliteConnection().prepare('SELECT * FROM wallet_postings').all()).toEqual(before);
}));
it('private and missing receipt endpoints have the same404 and partial transfers never expose attachments',()=>fixture(async f=>{
 const root='/records/'+f.move.record.id+'/receipts',saved=await f.request(root,'POST',{expectedRevision:1,input:upload},'member',randomUUID());expect(saved.status).toBe(200);
 write(tx=>tx.run('UPDATE wallet_accounts SET owner_user_id=? WHERE id=?',who('other').userId,f.bank));
 expect((await f.request('/records/'+f.move.record.id)).body.partial).toBe(true);
 for(const path of [root,root+'/'+saved.body.receipt.id,'/records/'+f.secret.record.id+'/receipts']){const result=await f.request(path),missing=await f.request(path.replace(/records\/[^/]+/,'records/synthetic-missing'));expect(result.status).toBe(404);expect(result.body.error).toBe(missing.body.error);expect(result.bytes).not.toEqual(png);}
 expect((await f.request(root+'/'+saved.body.receipt.id,'GET',undefined,'admin')).bytes).toEqual(png);
}));
it('read grants allow bytes but not writes and revocation also blocks cached attach replay',()=>fixture(async f=>{
 const root='/records/'+f.secret.record.id+'/receipts',nonce=randomUUID(),body={expectedRevision:1,input:upload},saved=await f.request(root,'POST',body,'other',nonce);expect(saved.status).toBe(200);
 write(tx=>tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',f.hidden,who().userId,'read'));
 expect((await f.request(root+'/'+saved.body.receipt.id)).bytes).toEqual(png);
 expect((await f.request(root,'POST',{expectedRevision:2,input:upload},'member',randomUUID())).status).toBe(403);
 expect((await f.request(root+'/'+saved.body.receipt.id,'DELETE',{expectedRevision:2},'member',randomUUID())).status).toBe(403);
 write(tx=>{tx.run('DELETE FROM wallet_account_grants');tx.run('UPDATE wallet_accounts SET owner_user_id=? WHERE id=?',who('admin').userId,f.hidden);});
 expect((await f.request(root+'/'+saved.body.receipt.id)).status).toBe(404);expect((await f.request(root,'POST',body,'other',nonce)).status).toBe(404);
}));
it.each(['remote','traversal','mime','base64','extra'])('rejects receipt %s with a safe trace error and no manifest',kind=>fixture(async f=>{
 const input:any={...upload};if(kind==='remote')input.dataUrl='https://synthetic.invalid/receipt.png';if(kind==='traversal')input.fileName='../synthetic.png';if(kind==='mime')input.dataUrl='data:image/jpeg;base64,'+png.toString('base64');if(kind==='base64')input.dataUrl='data:image/png;base64,!!!!';if(kind==='extra')input.ownerId=who('other').userId;
 const result=await f.request('/records/'+f.expense.record.id+'/receipts','POST',{expectedRevision:1,input},'member',randomUUID());expect([400,422]).toContain(result.status);expect(result.body.requestId).toBe(result.headers['x-request-id']);expect(result.body.error).not.toContain(input.dataUrl);expect(sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_receipts').get()).toEqual({n:0});
}));

it('an overlong opaque receipt ID is a400 input error rather than a native500',()=>fixture(async f=>{const result=await f.request('/records/'+f.expense.record.id+'/receipts/'+'a'.repeat(37));expect(result.status).toBe(400);expect(result.body.code).toBe('INVALID_INPUT');expect(result.body.requestId).toBe(result.headers['x-request-id']);}));
