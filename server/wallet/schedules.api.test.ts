import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { it, expect,vi } from 'vitest';
import {walletReminderId} from './reminderIdentity.js';
import {registerPushDelivery} from '../registerOutbox.js';
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
        configureWalletStorage({ migrations, snapshot, version: 12 });
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => {
        for (const name of Object.keys(walletTablesAt(12)).reverse().filter(name => name !== 'wallet_currencies'))
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
        const encoded = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: Record<string, string> = { ...(key ? { Authorization: 'Bearer ' + tokens[who(key).userId] } : {}), ...(nonce === undefined ? {} : { 'x-request-id': nonce }), ...(encoded === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(encoded)) }) }, req = http.request({ hostname: '127.0.0.1', port: (server.address() as any).port, path: path.startsWith('/api/')?path:'/api/wallet'+path, method, headers, agent: false }, res => {
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
const scheduleDraft=(accountId:string)=>({name:'Synthetic HTTP schedule',record:{kind:'expense',accountId,money:{minor:'200000',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Saigon',note:'Synthetic scheduled HTTP note',payee:'',paymentMethod:'',occurredAt:null,reviewedAt:null,settlementStatus:'uncleared',categoryId:null,labelIds:[]},recurrence:{anchorDate:'2026-10-17',timezone:'Asia/Saigon',frequency:'monthly',interval:1,monthEndPolicy:'clamp'},mode:'manual',reminderDays:[3,0],paused:false});
it('internal schedule HTTP previews without writes and explicitly confirms one canonical occurrence',()=>fixture(async f=>{const before=sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get(),preview=await f.request('/schedules/preview','POST',{draft:scheduleDraft(f.cash)});expect(preview.status).toBe(200);expect(preview.body.items.map((v:any)=>v.dueDate)).toEqual(['2026-10-17','2026-11-17','2026-12-17']);expect(sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(before);const saved=await f.request('/schedules','POST',{expectedRevision:0,draft:scheduleDraft(f.cash)},'member',randomUUID());expect(saved.status).toBe(200);expect(saved.body).toMatchObject({revision:1,mode:'manual'});const materialized=await f.request('/schedules/'+saved.body.id+'/materialize','POST',{expectedRevision:1},'member',randomUUID());expect(materialized.status).toBe(200);expect(materialized.body.created).toBe(1);const slots=await f.request('/schedules/'+saved.body.id+'/occurrences');expect(slots.status).toBe(200);expect(slots.body.items).toHaveLength(1);const slot=slots.body.items[0],nonce=randomUUID(),payload={expectedRevision:1,input:{}},first=await f.request('/occurrences/'+slot.id+'/confirm','POST',payload,'member',nonce);expect(first.status).toBe(200);expect(first.body).toMatchObject({id:slot.id,state:'confirmed',revision:2});expect((await f.request('/occurrences/'+slot.id+'/confirm','POST',payload,'member',nonce)).body).toEqual(first.body);expect((await f.request('/occurrences/'+slot.id+'/confirm','POST',payload,'member',randomUUID())).status).toBe(409);const record=(await f.request('/records/'+first.body.recordId)).body;expect(record.record).toMatchObject({source:'schedule',occurrenceId:slot.id});expect(record.postings[0].deltaMinor).toBe('-200000');}));
it('schedule HTTP links an existing record without creating another expense and blocks ordinary edits afterwards',()=>fixture(async f=>{const saved=await f.request('/schedules','POST',{expectedRevision:0,draft:scheduleDraft(f.cash)},'member',randomUUID());await f.request('/schedules/'+saved.body.id+'/materialize','POST',{expectedRevision:1},'member',randomUUID());const slot=(await f.request('/schedules/'+saved.body.id+'/occurrences')).body.items[0],before=sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_records').get(),result=await f.request('/occurrences/'+slot.id+'/confirm','POST',{expectedRevision:1,input:{linkRecordId:f.expense.record.id,recordRevision:1}},'member',randomUUID());expect(result.status).toBe(200);expect(result.body.recordId).toBe(f.expense.record.id);expect(sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_records').get()).toEqual(before);expect((await f.request('/records/'+f.expense.record.id)).body.record).toMatchObject({source:'manual',occurrenceId:slot.id,revision:2});expect((await f.request('/records/'+f.expense.record.id,'PATCH',{expectedRevision:2,patch:{note:'ordinary bypass'}},'member',randomUUID())).status).toBe(409);}));
it('schedule APIs enforce sessions, current roles and personal account scope including direct occurrence URLs',()=>fixture(async f=>{const saved=await f.request('/schedules','POST',{expectedRevision:0,draft:scheduleDraft(f.cash)},'member',randomUUID());await f.request('/schedules/'+saved.body.id+'/materialize','POST',{expectedRevision:1},'member',randomUUID());const slot=(await f.request('/schedules/'+saved.body.id+'/occurrences')).body.items[0];for(const key of [null,'child','guest'])for(const path of ['/schedules','/schedules/'+saved.body.id,'/occurrences/'+slot.id])expect((await f.request(path,'GET',undefined,key)).status).toBe(key===null?401:403);for(const key of ['other','admin']){expect((await f.request('/schedules/'+saved.body.id,'GET',undefined,key)).status).toBe(404);expect((await f.request('/occurrences/'+slot.id,'GET',undefined,key)).status).toBe(404);}f.ports.accounts.updateAccount(ctx('member',1),f.cash,{accessMode:'private'});write(tx=>tx.run('UPDATE wallet_accounts SET owner_user_id=? WHERE id=?',who('other').userId,f.cash));expect((await f.request('/occurrences/'+slot.id)).status).toBe(404);expect((await f.request('/occurrences/'+slot.id+'/confirm','POST',{expectedRevision:1,input:{}},'member',randomUUID())).status).toBe(404);}));
it('schedule mutations reject missing nonces, caller clocks, provenance and unrelated financial payloads',()=>fixture(async f=>{const draft=scheduleDraft(f.cash);expect((await f.request('/schedules','POST',{expectedRevision:0,draft})).status).toBe(400);for(const bad of [{...draft,mode:'bank'},{...draft,ownerId:who('admin').userId},{...draft,record:{...draft.record,source:'schedule'}},{...draft,paused:null}])expect((await f.request('/schedules','POST',{expectedRevision:0,draft:bad},'member',randomUUID())).status).toBe(400);const saved=await f.request('/schedules','POST',{expectedRevision:0,draft},'member',randomUUID());expect((await f.request('/schedules/'+saved.body.id+'/materialize','POST',{expectedRevision:1,now:'2030-01-01T00:00:00.000Z'},'member',randomUUID())).status).toBe(400);}));
it('the existing inbox read/mark and push dispatcher recheck Wallet object access after a real grant revocation',()=>fixture(async f=>{const saved=f.ports.schedules.saveSchedule(ctx(),{draft:scheduleDraft(f.cash)});f.ports.schedules.materializeSchedule(ctx('member',1),saved.id);const slot=f.ports.schedules.listOccurrences(who(),saved.id)[0],id=walletReminderId(slot.id,0,who().userId),notification={id,userId:who().userId,title:'SYNTHETIC_PRIVATE_WALLET_REMINDER',content:'Synthetic Wallet source context',type:'finance' as const,isRead:false,createdAt:'2026-10-17T03:00:00.000Z',sourceRef:{domain:'wallet-occurrence' as const,id:slot.id,offsetDays:0}};write(()=>{expect(db.FamilyDB.queueWalletReminder(notification)).toBe(id);expect(db.FamilyDB.queueWalletReminder(notification)).toBe(id);});const visible=await f.request('/api/notifications');expect(visible.status).toBe(200);expect(visible.body.notifications.filter((n:any)=>n.id===id)).toHaveLength(1);for(const key of ['child','guest','other','admin']){const response=await f.request('/api/notifications','GET',undefined,key);expect(response.status).toBe(200);expect(JSON.stringify(response.body)).not.toContain('SYNTHETIC_PRIVATE_WALLET_REMINDER');}write(tx=>{tx.run('UPDATE wallet_accounts SET owner_user_id=? WHERE id=?',who('other').userId,f.cash);tx.legacy.pushSubscriptions.push({userId:who().userId,endpoint:'https://synthetic.invalid/wallet-push',keys:{p256dh:'synthetic',auth:'synthetic'}} as any);});const hidden=await f.request('/api/notifications');expect(hidden.body.notifications.filter((n:any)=>n.id===id)).toEqual([]);expect(JSON.stringify(hidden.body)).not.toContain('SYNTHETIC_PRIVATE_WALLET_REMINDER');expect((await f.request('/api/notifications/'+id+'/read','POST',{},'member',randomUUID())).status).toBe(404);expect(sqlite.sqliteLoad().notifications.find(n=>n.id===id)?.isRead).toBe(false);let handler:any;const fakePush={sendQueuedNotification:vi.fn(async()=> 'ok')};registerPushDelivery({durableEnabled:true,registerAppJob:(_namespace:string,_type:string,value:any)=>{handler=value;}} as any,db.FamilyDB,fakePush as any,f.ports.notificationAccess);await handler(new AbortController().signal,{payload:{notificationId:id,userId:who().userId,endpoint:'https://synthetic.invalid/wallet-push'}});expect(fakePush.sendQueuedNotification).not.toHaveBeenCalled();}));
