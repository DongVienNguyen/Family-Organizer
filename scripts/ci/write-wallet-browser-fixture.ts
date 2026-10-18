import fs from 'node:fs';
import path from 'node:path';
import { pbkdf2Sync, randomUUID } from 'node:crypto';
const [data, config, receiptFlag] = process.argv.slice(2);
const walletVersion=receiptFlag==='--imports'?10:receiptFlag==='--dashboard'?9:receiptFlag==='--analytics'?8:receiptFlag==='--workflows'?7:receiptFlag==='--bulk'?6:receiptFlag==='--receipts'?5:4;
if (!data || !config || !(process.argv.length===4||process.argv.length===5&&['--receipts','--bulk','--workflows','--analytics','--dashboard','--imports'].includes(receiptFlag)))
    throw Error('Explicit synthetic Wallet data/config roots required');
process.env.DATA_DIR = data;
process.env.CONFIG_DIR = config;
process.env.APP_CODE_ROOT = process.cwd();
fs.mkdirSync(data, { recursive: true });
fs.mkdirSync(config, { recursive: true });
const salt = '00112233445566778899aabbccddeeff', passwordHash = salt + '$' + pbkdf2Sync('synthetic-browser-password', salt, 120000, 64, 'sha512').toString('hex');
const users = ['admin', 'member', 'other', 'child', 'guest'].map(key => ({ id: 'wallet-browser-' + key, username: 'wallet-browser-' + key, fullName: 'Synthetic wallet ' + key, role: key === 'other' ? 'member' : key, passwordHash, avatarColor: 'bg-sky-500', createdAt: '2026-10-17T00:00:00.000Z' }));
const transactions = [{ id: 'synthetic-wallet-retained-legacy', type: 'income', amount: 42, date: '2026-10-17', category: 'other', account: 'cash', description: 'Synthetic existing Finance', creatorId: 'wallet-browser-member', createdAt: '2026-10-17T00:00:00.000Z' }];
fs.writeFileSync(path.join(data, 'db.json'), JSON.stringify({ users, transactions }));
fs.writeFileSync(path.join(config, 'app_settings.json'), '{}');
const sqlite = await import('../../server/sqlite.js'), gateway = await import('../../server/appStore.js'), migrations = await import('../../server/appMigrations.js'), snapshot = await import('../../server/appSnapshot.js');
const { configureWalletStorage } = await import('../../server/wallet/integration.js'), { createWalletPorts } = await import('../../server/wallet/ports.js');
configureWalletStorage({ migrations, snapshot, version: walletVersion });
migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
gateway.withAppWriteTransaction({ actorId: 'system:synthetic', command: 'synthetic:wallet-browser', requestId: randomUUID(), payloadHash: 'synthetic' }, tx => { tx.legacy.users = users as any; tx.legacy.transactions = transactions as any; if(walletVersion>=5)for(const [id,name]of [['synthetic-filter-label-a','Synthetic filter label A'],['synthetic-filter-label-b','Synthetic filter label B']]){tx.run('INSERT INTO wallet_labels VALUES(?,?,NULL)',id,name);tx.run('INSERT INTO wallet_label_metadata(label_id) VALUES(?)',id);}  tx.run("INSERT OR REPLACE INTO app_meta VALUES('wallet_active','1')"); });
const ports = createWalletPorts(sqlite, gateway, { now: () => Date.parse('2026-10-17T00:00:00.000Z') }), ctx = (key = 'member', expectedRevision = 0) => ({ actor: { userId: 'wallet-browser-' + key, role: 'member' as const }, idempotencyKey: randomUUID(), expectedRevision });
const account = (key: string, name: string, openingMinor: string, type: 'cash' | 'credit' = 'cash') => ports.accounts.createAccount(ctx(key), { name, type, currency: 'VND', openingMinor, openingDate: '2026-10-17', accessMode: 'private', ...(type === 'credit' ? { creditLimitMinor: '1000000' } : {}) }).account;
const exact = account('member', 'Synthetic exact balance', '9007199254740993'), credit = account('member', 'Synthetic credit balance', '-200000', 'credit'), hidden = account('other', 'SYNTHETIC_PRIVATE_WALLET_ACCOUNT', '12345'), read = account('other', 'Synthetic read-only account', '1234');
ports.accounts.setGrant(ctx('other', 1), read.id, 'wallet-browser-member', 'read');
const connection = sqlite.sqliteConnection(), legacy = connection.prepare('SELECT data FROM transactions WHERE id=?').get(transactions[0].id) as any;
if (!legacy || JSON.stringify(JSON.parse(legacy.data)) !== JSON.stringify(transactions[0]))
    throw Error('Synthetic legacy fixture was changed');
if (connection.pragma('integrity_check', { simple: true }) !== 'ok')
    throw Error('Synthetic Wallet integrity');
sqlite.sqliteClose();
console.log(JSON.stringify({ synthetic: true, walletVersion, labels:walletVersion>=5?2:0, users: 5, accounts: 4, exactId: exact.id, creditId: credit.id, hiddenId: hidden.id, readId: read.id, legacyPreserved: true, nativeHandlesClosed: true }));
