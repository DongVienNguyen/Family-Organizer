import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { it, expect, vi } from 'vitest';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import { checksum } from '../snapshotValidation.js';
import { UserRole } from '../../src/types.js';
import { configureWalletStorage } from './integration.js';
import { walletTablesAt } from './snapshot.js';
import { openWalletStore } from './store.js';
import { migrateLegacyFinance } from './migrate.js';
import { legacyFinanceSource, legacyPilotChecksum } from './legacyMigrationData.js';
import { legacyReceiptPathDigest } from './legacyMedia.js';
import { convertLegacyReceiptBackup } from './receiptMigration.js';
const actor = { userId: 'synthetic-receipt-migration-admin', role: UserRole.ADMIN }, at = '2026-10-17T01:00:00.000Z', png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), url = '/uploads/receipts/Synthetic/same.png';
const meta = () => ({ actorId: actor.userId, command: 'wallet:synthetic:receipt-copy', requestId: randomUUID(), payloadHash: 'synthetic' }), write = <T>(fn: Parameters<typeof gateway.withAppWriteTransaction<T>>[1]) => gateway.withAppWriteTransaction(meta(), fn), store = openWalletStore({ write: gateway.withAppWriteTransaction });
let initialized = false;
function source() {
    if (!initialized) {
        configureWalletStorage({ migrations, snapshot, version: 5 });
        migrations.applyDomainMigrations({ enabled: ['wallet'], pilot: true });
        initialized = true;
    }
    write(tx => { for (const name of Object.keys(walletTablesAt(5)).reverse().filter(name => name !== 'wallet_currencies'))
        tx.run('DELETE FROM ' + name); tx.run("INSERT OR REPLACE INTO app_meta VALUES('wallet_active','0')"); tx.legacy.users = [{ id: actor.userId, username: 'synthetic-receipt-converter', fullName: 'Synthetic receipt converter', role: UserRole.ADMIN, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: at }]; tx.legacy.transactions = [url, url, 'data:image/png;base64,' + png.toString('base64'), 'https://synthetic.invalid/not-fetched.png', '/uploads/receipts/Synthetic/missing.png', '/uploads/receipts/Synthetic/bad.png', undefined].map((receiptImage, i) => ({ id: 'synthetic-old-receipt-' + i, type: 'expense', amount: 100 + i, date: '2026-10-17', category: 'food', account: 'cash', description: 'Synthetic old receipt ' + i, creatorId: actor.userId, createdAt: at, ...(receiptImage ? { receiptImage } : {}) } as any)); tx.legacy.customCategories = []; tx.legacy.hiddenBuiltinCategories = []; tx.legacy.debts = []; tx.legacy.savingsGoals = []; });
    const folder = path.join(process.env.DATA_DIR!, 'uploads', 'receipts', 'Synthetic');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'same.png'), png);
    fs.writeFileSync(path.join(folder, 'bad.png'), Buffer.from('synthetic invalid image'));
    store.transaction(meta(), tx => migrateLegacyFinance(tx, legacyFinanceSource(tx.legacy), { actor, timezone: 'Asia/Saigon', now: at }));
    return write(tx => snapshot.collectAppSnapshot(tx));
}
const ports = { validate: snapshot.validateAppSnapshot };
it('copies managed/inline images into distinct private record files without fetching or changing legacy money/source', () => {
    const input = source(), original = structuredClone(input), before = sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get(), fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('synthetic external call forbidden'));
    try {
        const result = convertLegacyReceiptBackup(input, ports, { actor, at });
        expect(input).toEqual(original);
        expect(sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(before);
        expect(fetch).not.toHaveBeenCalled();
        expect(result.conversion.copied).toHaveLength(3);
        expect(result.conversion.remaining.map((row: any) => row.reason).sort()).toEqual(['invalid-content', 'missing-file', 'remote-reference']);
        const output = result.snapshot;
        expect(output.tables.wallet_receipts).toHaveLength(3);
        expect(new Set(output.tables.wallet_receipts.map(row => row.file_key)).size).toBe(3);
        expect(output.tables.wallet_postings).toEqual(input.tables.wallet_postings);
        expect(output.tables.wallet_records).toEqual(input.tables.wallet_records);
        expect(output.legacy).toEqual(input.legacy);
        expect(output.tables.app_commands).toEqual(input.tables.app_commands);
        for (const row of output.tables.wallet_receipts) {
            expect(row.created_by).toBe(actor.userId);
            expect(row.created_at).toBe(at);
            expect(row.sha256).toBe(createHash('sha256').update(png).digest('hex'));
            expect(output.media['wallet-receipts/' + row.file_key]).toBe(png.toString('base64'));
        }
        expect(output.media[url.slice(9)]).toBe(input.media[url.slice(9)]);
        expect(output.tables.wallet_legacy_runs[0]).toMatchObject({ status: 'pending_receipts', receipts_pending_count: 3, source_checksum: input.tables.wallet_legacy_runs[0].source_checksum });
        expect(output.tables.wallet_legacy_runs[0].wallet_checksum).toBe(legacyPilotChecksum(output.tables));
        expect(output.manifest.checksum).toBe(checksum(output));
        expect(output.tables.app_meta.find(row => row.key === 'wallet_active')?.value).toBe('0');
    }
    finally {
        fetch.mockRestore();
    }
});
it('conversion is deterministic for the same source and repeated converted input adds no receipt, file or audit', () => {
    const input = source(), first = convertLegacyReceiptBackup(input, ports, { actor, at });
    expect(convertLegacyReceiptBackup(input, ports, { actor, at })).toEqual(first);
    const second = convertLegacyReceiptBackup(first.snapshot, ports, { actor, at });
    expect(second.conversion.converted).toBe(false);
    expect(second.conversion.copied).toEqual([]);
    expect(second.snapshot).toEqual(first.snapshot);
});
it('durable path taint is preserved even for unresolved managed images and copied rows retain manifest anchors', () => {
    const result = convertLegacyReceiptBackup(source(), ports, { actor, at });
    for (const row of result.snapshot.tables.wallet_legacy_links.filter(row => row.source_kind === 'record')) {
        const detail = JSON.parse(String(row.detail_json));
        if (['synthetic-old-receipt-0', 'synthetic-old-receipt-1'].includes(String(row.legacy_id)))
            expect(detail.legacyMediaPathDigest).toBe(legacyReceiptPathDigest(url));
        if (row.legacy_id === 'synthetic-old-receipt-4')
            expect(detail.legacyMediaPathDigest).toBe(legacyReceiptPathDigest('/uploads/receipts/Synthetic/missing.png'));
        if (detail.receiptId)
            expect(result.snapshot.tables.wallet_receipts.find(receipt => receipt.id === detail.receiptId)?.record_id).toBe(row.target_id);
    }
});
it('shared restore installs copied bytes and the original pilot still replays without duplicate money', async () => {
    const input = source(), result = convertLegacyReceiptBackup(input, ports, { actor, at });
    await snapshot.restoreAppSnapshot(result.snapshot, { maintenance: async (fn) => fn() });
    for (const row of result.snapshot.tables.wallet_receipts)
        expect(fs.readFileSync(path.join(process.env.DATA_DIR!, 'uploads', 'wallet-receipts', String(row.file_key)))).toEqual(png);
    const replay = store.transaction(meta(), tx => migrateLegacyFinance(tx, legacyFinanceSource(tx.legacy), { actor, timezone: 'Asia/Saigon', now: at }));
    expect(replay.created.records).toBe(0);
    expect(replay.totals.pendingReceipts).toBe(3);
    expect(sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_postings').get()).toEqual({ n: 7 });
});
it.each(['active', 'member', 'deleted', 'source-drift', 'pilot-drift', 'missing-run', 'receipt-collision', 'bad-clock'])('refuses %s before returning replacement bytes or changing storage', kind => {
    const input = source(), options: any = { actor, at };
    if (kind === 'active')
        input.tables.app_meta.find(row => row.key === 'wallet_active')!.value = '1';
    if (kind === 'member') {
        input.legacy.users[0].role = UserRole.MEMBER;
        options.actor = { ...actor, role: UserRole.MEMBER };
    }
    if (kind === 'deleted')
        input.legacy.users[0].isDeleted = true;
    if (kind === 'source-drift')
        input.legacy.transactions[0].amount++;
    if (kind === 'pilot-drift')
        input.tables.wallet_records[0].note = 'Synthetic changed pilot';
    if (kind === 'missing-run') {
        input.tables.wallet_legacy_links = [];
        input.tables.wallet_legacy_runs = [];
    }
    if (kind === 'receipt-collision')
        options.newId = () => 'b8ac02a3-655e-4d7d-9422-519b1403b270';
    if (kind === 'bad-clock')
        options.at = '2026-02-30T00:00:00.000Z';
    input.manifest.checksum = checksum(input);
    const original = structuredClone(input), before = sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get();
    expect(() => convertLegacyReceiptBackup(input, ports, options)).toThrow();
    expect(input).toEqual(original);
    expect(sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(before);
});
it.each(['other-record', 'missing-manifest', 'wrong-hash', 'future-conversion', 'bad-taint'])('shared validation rejects a checksummed legacy receipt anchor %s before maintenance', kind => {
    const result = convertLegacyReceiptBackup(source(), ports, { actor, at }), bad = structuredClone(result.snapshot), link = bad.tables.wallet_legacy_links.find(row => row.source_kind === 'record' && JSON.parse(String(row.detail_json)).receiptId)!, detail = JSON.parse(String(link.detail_json));
    if (kind === 'other-record')
        detail.receiptId = bad.tables.wallet_receipts.find(row => row.record_id !== link.target_id)!.id;
    if (kind === 'missing-manifest')
        bad.tables.wallet_receipts = bad.tables.wallet_receipts.filter(row => row.id !== detail.receiptId);
    if (kind === 'wrong-hash')
        detail.receiptSha256 = '0'.repeat(64);
    if (kind === 'future-conversion')
        detail.receiptConversionVersion = 2;
    if (kind === 'bad-taint')
        detail.legacyMediaPathDigest = 'synthetic-invalid';
    link.detail_json = JSON.stringify(detail);
    bad.tables.wallet_legacy_runs[0].wallet_checksum = legacyPilotChecksum(bad.tables);
    bad.manifest.checksum = checksum(bad);
    const before = sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get();
    expect(() => snapshot.validateAppSnapshot(bad)).toThrow();
    expect(sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(before);
});
it('explicit replacement files resolve remote/missing/invalid receipts without changing original references or fetching', () => {
    const input = source(), before = structuredClone(input), replacements = Object.fromEntries([3, 4, 5].map(index => ['synthetic-old-receipt-' + index, { fileName: 'Synthetic replacement ' + index + '.png', dataUrl: 'data:image/png;base64,' + png.toString('base64') }]));
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('synthetic external call forbidden'));
    try {
        const result = convertLegacyReceiptBackup(input, ports, { actor, at, replacements } as any);
        expect(result.conversion.copied).toHaveLength(6);
        expect(result.conversion.remaining).toEqual([]);
        expect(result.snapshot.tables.wallet_legacy_runs[0]).toMatchObject({ status: 'ready', receipts_pending_count: 0 });
        expect(result.snapshot.legacy).toEqual(input.legacy);
        expect(input).toEqual(before);
        expect(result.snapshot.tables.app_meta.find(row => row.key === 'wallet_active')?.value).toBe('0');
        expect(fetch).not.toHaveBeenCalled();
        expect(result.snapshot.tables.wallet_receipts.filter(row => String(row.file_name).startsWith('Synthetic replacement'))).toHaveLength(3);
        const again = convertLegacyReceiptBackup(result.snapshot, ports, { actor, at, replacements } as any);
        expect(again.conversion.converted).toBe(false);
        expect(again.snapshot).toEqual(result.snapshot);
    }
    finally {
        fetch.mockRestore();
    }
});
it.each(['unknown-record', 'no-original-receipt', 'invalid-bytes'])('explicit replacement %s is refused rather than silently ignored', kind => {
    const input = source(), id = kind === 'unknown-record' ? 'synthetic-missing' : kind === 'no-original-receipt' ? 'synthetic-old-receipt-6' : 'synthetic-old-receipt-3', replacements = { [id]: { fileName: 'Synthetic replacement.png', dataUrl: kind === 'invalid-bytes' ? 'data:image/png;base64,!!!!' : 'data:image/png;base64,' + png.toString('base64') } }, before = structuredClone(input);
    expect(() => convertLegacyReceiptBackup(input, ports, { actor, at, replacements } as any)).toThrow();
    expect(input).toEqual(before);
});
it('detaching a migrated receipt retains its deny marker/history and leaves the next shared backup restorable', async () => {
    const input = source(), replacements = Object.fromEntries([3, 4, 5].map(index => ['synthetic-old-receipt-' + index, { fileName: 'Synthetic resolution ' + index + '.png', dataUrl: 'data:image/png;base64,' + png.toString('base64') }])), converted = convertLegacyReceiptBackup(input, ports, { actor, at, replacements } as any);
    await snapshot.restoreAppSnapshot(converted.snapshot, { maintenance: async (fn) => fn() });
    write(tx => tx.run("UPDATE app_meta SET value='1' WHERE key='wallet_active'"));
    const { createWalletPorts } = await import('./ports.js'), current = createWalletPorts(sqlite, gateway, { now: () => Date.parse(at) }), row = converted.snapshot.tables.wallet_receipts[0];
    expect(current.active()).toBe(true);
    const result = current.receipts.detach({ actor, expectedRevision: 1, idempotencyKey: randomUUID() }, String(row.record_id), String(row.id));
    expect(result.revision).toBe(2);
    const saved = write(tx => snapshot.collectAppSnapshot(tx)), link = saved.tables.wallet_legacy_links.find(link => link.target_id === row.record_id)!, detail = JSON.parse(String(link.detail_json));
    expect(detail).toMatchObject({ receiptPending: false, receiptId: row.id, receiptDetachedAt: at, receiptDetachedBy: actor.userId });
    expect(saved.tables.wallet_receipts.some(receipt => receipt.id === row.id)).toBe(false);
    expect(saved.media['wallet-receipts/' + row.file_key]).toBe(png.toString('base64'));
    expect(() => snapshot.validateAppSnapshot(saved)).not.toThrow();
    await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved), { maintenance: async (fn) => fn() });
    expect(current.receipts.list(actor, String(row.record_id)).receipts).toEqual([]);
});
it('durable old-URL protection survives removal of legacy/avatar bindings and generic cleanup', async () => {
    const input = source(), replacements = Object.fromEntries([3, 4, 5].map(index => ['synthetic-old-receipt-' + index, { fileName: 'Synthetic resolved.png', dataUrl: 'data:image/png;base64,' + png.toString('base64') }])), converted = convertLegacyReceiptBackup(input, ports, { actor, at, replacements });
    await snapshot.restoreAppSnapshot(converted.snapshot, { maintenance: async (fn) => fn() });
    const media = await import('../media.js'), { mediaKey, mayReadMedia } = await import('../mediaPolicy.js'), historical = structuredClone(converted.snapshot), metadata = { version: 1 as const, ownerId: actor.userId, createdAt: Date.parse(at), bindings: [{ domain: 'users' as const, id: actor.userId }] };
    historical.legacy.transactions = [];
    historical.legacy.users[0].avatarImage = url;
    historical.tables.app_meta.find(row => row.key === 'wallet_active')!.value = '1';
    const key = mediaKey(url), stored = historical.tables.app_meta.find(row => row.key === key);
    if (stored)
        stored.value = JSON.stringify(metadata);
    else
        historical.tables.app_meta.push({ key, value: JSON.stringify(metadata) });
    historical.manifest.checksum = checksum(historical);
    await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(historical), { maintenance: async (fn) => fn() });
    expect(mayReadMedia(url, metadata, sqlite.sqliteLoad(), actor)).toBe(true);
    expect(media.authorizeMedia(url, actor)).toBe(false);
    write(tx => { delete tx.legacy.users[0].avatarImage; });
    media.deleteMediaByUrl(url);
    expect(fs.readFileSync(path.join(process.env.DATA_DIR!, 'uploads', url.slice(9)))).toEqual(png);
    expect(media.authorizeMedia(url, actor)).toBe(false);
});
