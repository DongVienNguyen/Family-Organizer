import { randomUUID } from 'node:crypto';
import { createWalletImports } from '../server/wallet/imports.js';
import { prepareWalletImports, walletImportColumns } from '../server/wallet/importSchema.js';
import { walletSchemas } from '../server/wallet/schemaRegistry.js';
import { createWalletAccounts } from '../server/wallet/accounts.js';
import { createWalletRecords } from '../server/wallet/records.js';
import { withAppWriteTransaction } from '../server/appStore.js';
import { sqliteConnection } from '../server/sqlite.js';
import { UserRole, type User } from '../src/types.js';
import type { ImportMapping } from '../src/features/wallet/importContracts.js';
const actor = (id = 'owner', role = UserRole.MEMBER) => ({ userId: 'synthetic-import-' + id, role }), ctx = (revision?: number, who = actor()) => ({ actor: who, idempotencyKey: randomUUID(), ...(revision === undefined ? {} : { expectedRevision: revision }) });
const reader = { get: (sql: string, ...args: any[]): any => sqliteConnection().prepare(sql).get(...args), all: (sql: string, ...args: any[]): any[] => sqliteConnection().prepare(sql).all(...args) };
const write = <T>(fn: Parameters<typeof withAppWriteTransaction<T>>[1]) => withAppWriteTransaction({ actorId: actor().userId, command: 'synthetic:imports', requestId: randomUUID(), payloadHash: 'synthetic' }, fn);
const mapping: ImportMapping = { headerRow: 1, dateColumn: 1, amount: { mode: 'signed', column: 2 }, dateFormat: 'DD/MM/YYYY', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', status: 'cleared', payeeColumn: 3, noteColumn: 4, labelDelimiter: '|', defaultCategoryId: null, labelIds: [], excludedRows: [] };
let initialized = false;
export function createImportNativeFixture(options: {
    enqueue?: Parameters<typeof createWalletImports>[0]['enqueue'];clock?:()=>number;write?:typeof withAppWriteTransaction;
} = {}) {
    let now = Date.parse('2026-10-18T00:00:00.000Z');
    write(tx => { if (!initialized) {
        for (const schema of walletSchemas.filter(s => s.version <= 16))
            schema.prepare(tx);

    } for (const table of walletSchemas.filter(s => s.version <= 16).flatMap(s => Object.keys(s.columns)).reverse().filter(name => name !== 'wallet_currencies'))
        tx.run('DELETE FROM ' + table); tx.legacy.users = ['owner', 'other', 'admin', 'child'].map(id => ({ id: actor(id).userId, username: actor(id).userId, fullName: 'Synthetic', role: id === 'admin' ? UserRole.ADMIN : id === 'child' ? UserRole.CHILD : UserRole.MEMBER, passwordHash: 'synthetic', avatarColor: 'blue', createdAt: '2026-10-18T00:00:00.000Z' } as User & {
        passwordHash: string;
    })); tx.run("INSERT OR REPLACE INTO app_meta VALUES('wallet_active','1')"); });
    initialized = true;
    const files = new Map<string, Buffer>(), filePort = { stage: (bytes: Uint8Array) => { const key = randomUUID(); files.set(key, Buffer.from(bytes)); return key; }, read: (key: string) => { const bytes = files.get(key); if (!bytes)
            throw Error('Synthetic file missing'); return Buffer.from(bytes); }, remove: (key: string) => { files.delete(key); return true; } };
    const accounts = createWalletAccounts({ reader, write: withAppWriteTransaction, now: () => now }), accountId = accounts.createAccount(ctx(), { name: 'Synthetic import account', type: 'bank', currency: 'VND', openingMinor: '1000000', openingDate: '2026-10-01', accessMode: 'private' }).account.id;
    const service = createWalletImports({ reader, write: withAppWriteTransaction, files: filePort, now: options.clock??(() => now), ...options }), records = createWalletRecords({ reader, write: withAppWriteTransaction, now: () => now });
    const stage = (body = 'Ngày,Số tiền,Người nhận,Ghi chú\n18/10/2026,-100.000,Cửa hàng,  Dòng ghi chú  \n18/10/2026,200.000,Thu nhập,\n', who = actor()) => service.stageImport(ctx(undefined, who), { accountId, fileName: 'synthetic.csv', format: 'csv', bytes: Buffer.from(body) });
    return { service, stage, records, accountId, files, accounts, later: (ms: number) => { now += ms; } };
}

export {actor,ctx,reader,write,mapping};
