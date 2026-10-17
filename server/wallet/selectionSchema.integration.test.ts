import { migrateLegacyFinance } from './migrate.js';
import { legacyFinanceSource } from './legacyMigrationData.js';
import { convertLegacyReceiptBackup } from './receiptMigration.js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import { checksum } from '../snapshotValidation.js';
import { inspectRecoverySnapshot } from '../recoverySnapshotInspection.js';
import { UserRole } from '../../src/types.js';
import { configureWalletStorage, inspectWalletStorage } from './integration.js';
import { walletTablesAt, exportWalletSnapshot, walletSnapshotChecksum } from './snapshot.js';
import { convertWalletBackup, convertSharedWalletBackup } from './backupConversion.js';
import { openWalletStore } from './store.js';
import { selectionFilterHash, walletSelectionChecksum, walletSelectionSql } from './selectionSchema.js';
const actor = 'synthetic-selection-owner', at = '2026-10-17T01:00:00.000Z', expires = '2026-10-17T01:15:00.000Z', filter = { period: { fromDate: '2026-10-01', toDateExclusive: '2026-11-01', timezone: 'Asia/Saigon' }, referenceCurrency: 'VND' };
const meta = () => ({ actorId: actor, command: 'wallet:synthetic:selection-schema', requestId: randomUUID(), payloadHash: 'synthetic' }), write = <T>(fn: Parameters<typeof gateway.withAppWriteTransaction<T>>[1]) => gateway.withAppWriteTransaction(meta(), fn), store = openWalletStore({ write: gateway.withAppWriteTransaction });
const reader = { get: (sql: string, ...args: any[]): any => sqlite.sqliteConnection().prepare(sql).get(...args), all: (sql: string, ...args: any[]): any[] => sqlite.sqliteConnection().prepare(sql).all(...args) };
let initialized = false;
function setup() {
    if (!initialized) {
        write(tx => { tx.legacy.users = [{ id: actor, username: 'synthetic-selection-owner', fullName: 'Synthetic selection owner', role: UserRole.MEMBER, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: at }, { id: 'synthetic-selection-admin', username: 'synthetic-selection-admin', fullName: 'Synthetic selection admin', role: UserRole.ADMIN, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: at }]; });
        configureWalletStorage({ migrations, snapshot, version: 6 });
        expect(migrations.getDomainVersions().wallet).toBe(0);
        expect(reader.get("SELECT name FROM sqlite_master WHERE name='wallet_selections'")).toBeUndefined();
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => { for (const name of Object.keys(walletTablesAt(6)).reverse().filter(name => name !== 'wallet_currencies'))
        tx.run('DELETE FROM ' + name); tx.run("INSERT OR REPLACE INTO app_meta VALUES('wallet_active','1')"); tx.legacy.users[0].role = UserRole.MEMBER; delete tx.legacy.users[0].isDeleted; });
    store.transaction(meta(), tx => { tx.accounts.insert({ id: 'synthetic-selection-account', name: 'Synthetic selection cash', type: 'cash', currency: 'VND', ownerUserId: actor, accessMode: 'private', openingMinor: '9007199254740993', openingDate: '2026-10-17', revision: 1 }); for (let i = 0; i < 2; i++) {
        const id = 'synthetic-selection-record-' + i;
        tx.records.insert({ id, kind: 'expense', effectiveDate: '2026-10-17', timezone: 'Asia/Saigon', source: 'manual', note: 'Synthetic selected record ' + i, settlementStatus: 'cleared', creatorId: actor, revision: 1 });
        tx.postings.insert({ recordId: id, accountId: 'synthetic-selection-account', deltaMinor: '-100' });
    } });
    write(tx => { tx.run('INSERT INTO wallet_selections VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', 'synthetic-selection', actor, 'filter', JSON.stringify(filter), selectionFilterHash(filter), at, expires, 2, 1, 'ready', null, null); for (let i = 0; i < 2; i++)
        tx.run('INSERT INTO wallet_selection_records VALUES(?,?,?,?)', 'synthetic-selection', 'synthetic-selection-record-' + i, 1, i); });
}
const capture = () => write(tx => snapshot.collectAppSnapshot(tx));
it('registers selection6 explicitly and restores selection rows with exact original money through shared I01', async () => { setup(); expect(inspectWalletStorage(reader)).toBe(true); expect(walletSelectionChecksum).toBe('5bb420772c10e997730f3468d61881a456b8e4269e7535e0ed750db4143e6d45'); expect(reader.get("SELECT checksum FROM app_migrations WHERE namespace='wallet' AND version=6")).toEqual({ checksum: walletSelectionChecksum }); const saved = capture(); expect(saved.manifest.domains.wallet).toBe(6); expect(saved.tables.wallet_selection_records).toHaveLength(2); write(tx => { tx.run('DELETE FROM wallet_selections'); tx.run('DELETE FROM wallet_postings'); }); await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved), { maintenance: async (fn) => fn() }); expect(capture().tables.wallet_selection_records).toEqual(saved.tables.wallet_selection_records); expect(capture().tables.wallet_accounts[0].opening_minor).toBe('9007199254740993'); expect(reader.all('PRAGMA foreign_key_check')).toEqual([]); });
it.each(['actor', 'parent', 'record', 'ordinal', 'count', 'filter-hash', 'filter-shape', 'time', 'future-record-revision', 'applied-state'])('rejects checksummed selection %s before maintenance/SQL mutation', async (kind) => {
    setup();
    const bad = structuredClone(capture()), selection = bad.tables.wallet_selections[0], entry = bad.tables.wallet_selection_records[0];
    if (kind === 'actor')
        selection.actor_id = 'synthetic-missing';
    if (kind === 'parent')
        entry.selection_id = 'synthetic-missing';
    if (kind === 'record')
        entry.record_id = 'synthetic-missing';
    if (kind === 'ordinal')
        entry.ordinal = 5;
    if (kind === 'count')
        selection.record_count = 1;
    if (kind === 'filter-hash')
        selection.filter_hash = '0'.repeat(64);
    if (kind === 'filter-shape')
        selection.filter_json = '[]';
    if (kind === 'time')
        selection.expires_at = at;
    if (kind === 'future-record-revision')
        entry.record_revision = 2;
    if (kind === 'applied-state')
        selection.state = 'applied';
    bad.manifest.checksum = checksum(bad);
    const before = reader.get('SELECT total_changes() AS n'), boundaries: string[] = [];
    await expect((async () => snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(bad), { maintenance: async (fn) => { boundaries.push('maintenance'); return fn(); } }))()).rejects.toThrow();
    expect(boundaries).toEqual([]);
    expect(reader.get('SELECT total_changes() AS n')).toEqual(before);
});
it('expires snapshots by live policy rather than rejecting historical/deleted-actor snapshots at restore', () => { setup(); write(tx => { tx.legacy.users[0].isDeleted = true; tx.legacy.users[0].role = UserRole.CHILD; }); expect(() => snapshot.validateAppSnapshot(capture())).not.toThrow(); });
it('explicit old5 conversion adds empty selections while preserving old tables and media, with no normal cross-version restore', () => {
    setup();
    const current = capture(), old = structuredClone(current);
    old.manifest.domains.wallet = 5;
    delete old.tables.wallet_selections;
    delete old.tables.wallet_selection_records;
    old.tables.app_migrations = old.tables.app_migrations.filter(row => row.namespace !== 'wallet' || Number(row.version) <= 5);
    old.manifest.checksum = checksum(old);
    const original = structuredClone(old), before = reader.get('SELECT total_changes() AS n');
    expect(() => snapshot.validateAppSnapshot(old)).toThrow();
    const result = convertSharedWalletBackup(old, { installedVersion: 6, migrations: reader.all("SELECT version,checksum,applied_at FROM app_migrations WHERE namespace='wallet' ORDER BY version"), inspectHistorical: snapshot.inspectHistoricalDomainSnapshot, validateTarget: snapshot.validateAppSnapshot }, at);
    expect(result.conversion).toMatchObject({ fromVersion: 5, toVersion: 6, converted: true });
    expect(result.snapshot.tables.wallet_selections).toEqual([]);
    expect(result.snapshot.tables.wallet_selection_records).toEqual([]);
    expect(result.snapshot.media).toEqual(old.media);
    expect(old).toEqual(original);
    expect(reader.get('SELECT total_changes() AS n')).toEqual(before);
    const native = store.transaction(meta(), tx => exportWalletSnapshot(tx, gateway.markSnapshotReadResult));
    expect(native.schemaVersion).toBe(7);
    const previous = { schemaVersion: 6, tables: Object.fromEntries(Object.keys(walletTablesAt(5)).map(name => [name, native.tables[name]])), checksum: '' };
    previous.checksum = walletSnapshotChecksum(previous);
    const converted = convertWalletBackup(previous, new Set([actor]), 6);
    expect(converted.schemaVersion).toBe(7);
    expect(converted.tables.wallet_selections).toEqual([]);
    expect(converted.tables.wallet_postings).toEqual(previous.tables.wallet_postings);
});
it('read-only recovery sees selection6 without opening a second writer or changing the selected file', () => { setup(); const saved = capture(), before = reader.get('SELECT total_changes() AS n'); expect(() => inspectRecoverySnapshot(saved, sqlite.sqliteConnection().name)).not.toThrow(); expect(reader.get('SELECT total_changes() AS n')).toEqual(before); });
it('fresh source bootstrap retains installed6 without automatic upgrade/activation', () => { setup(); const loader = new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url).href, sqliteUrl = new URL('../sqlite.ts', import.meta.url).href, bootstrapUrl = new URL('../productivity/bootstrap.ts', import.meta.url).href; const code = `const sqlite=await import(${JSON.stringify(sqliteUrl)});try{const {configureTaskStorage}=await import(${JSON.stringify(bootstrapUrl)});await configureTaskStorage(sqlite);const db=sqlite.sqliteConnection();console.log(JSON.stringify({version:db.prepare("SELECT max(version) AS n FROM app_migrations WHERE namespace='wallet'").get().n,selections:db.prepare('SELECT count(*) AS n FROM wallet_selections').get().n,entries:db.prepare('SELECT count(*) AS n FROM wallet_selection_records').get().n}));}finally{sqlite.sqliteClose();}`; const raw = execFileSync(process.execPath, ['--import', loader, '--input-type=module', '--eval', code], { env: process.env, encoding: 'utf8', timeout: 15000 }); expect(JSON.parse(raw.trim().split('\n').at(-1)!)).toEqual({ version: 6, selections: 1, entries: 2 }); });
it('schema6 retains legacy pilot replay and explicit private receipt conversion without activating finance', () => { setup(); write(tx => { for (const name of Object.keys(walletTablesAt(6)).reverse().filter(name => name !== 'wallet_currencies'))
    tx.run('DELETE FROM ' + name); tx.run("UPDATE app_meta SET value='0' WHERE key='wallet_active'"); tx.legacy.transactions = [{ id: 'synthetic-selection-old-record', type: 'expense', amount: 100, category: 'food', account: 'cash', description: 'Synthetic schema6 legacy receipt', date: '2026-10-17', creatorId: actor, createdAt: at, receiptImage: 'data:image/png;base64,iVBORw0KGgo=' } as any]; tx.legacy.debts = []; tx.legacy.savingsGoals = []; tx.legacy.customCategories = []; tx.legacy.hiddenBuiltinCategories = []; }); const options = { actor: { userId: 'synthetic-selection-admin', role: UserRole.ADMIN }, timezone: 'Asia/Saigon', now: at }, run = () => store.transaction(meta(), tx => migrateLegacyFinance(tx, legacyFinanceSource(tx.legacy), options)), first = run(), saved = capture(); expect(first.totals.pendingReceipts).toBe(1); expect(run().runId).toBe(first.runId); const converted = convertLegacyReceiptBackup(saved, { validate: snapshot.validateAppSnapshot }, { actor: options.actor, at }); expect(converted.snapshot.manifest.domains.wallet).toBe(6); expect(converted.snapshot.tables.wallet_receipts).toHaveLength(1); expect(converted.snapshot.tables.wallet_selections).toEqual([]); expect(converted.snapshot.tables.wallet_postings).toEqual(saved.tables.wallet_postings); expect(converted.snapshot.tables.wallet_legacy_runs[0].status).toBe('ready'); expect(converted.snapshot.tables.app_meta.find(row => row.key === 'wallet_active')?.value).toBe('0'); expect(reader.get('SELECT count(*) AS n FROM wallet_receipts')).toEqual({ n: 0 }); });

it('cold inspection rejects selection index drift and future migration records without repairing either',()=>{setup();const saved=capture();write(tx=>tx.exec('DROP INDEX wallet_selection_record'));try{expect(()=>inspectWalletStorage(reader)).toThrow();expect(()=>inspectRecoverySnapshot(saved,sqlite.sqliteConnection().name)).toThrow();expect(reader.get("SELECT name FROM sqlite_master WHERE name='wallet_selection_record'")).toBeUndefined();}finally{write(tx=>tx.exec(walletSelectionSql));}write(tx=>tx.run("INSERT INTO app_migrations VALUES('wallet',7,?,?)",'synthetic-future-checksum',at));try{expect(()=>inspectWalletStorage(reader)).toThrow();expect(reader.get("SELECT checksum FROM app_migrations WHERE namespace='wallet' AND version=7")).toEqual({checksum:'synthetic-future-checksum'});}finally{write(tx=>tx.run("DELETE FROM app_migrations WHERE namespace='wallet' AND version=7"));}expect(inspectWalletStorage(reader)).toBe(true);});
