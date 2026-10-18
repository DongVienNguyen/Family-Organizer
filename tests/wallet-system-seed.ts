/** Owned synthetic fixture for complete Wallet recovery; never imports a live runtime. */
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import * as sqlite from '../server/sqlite.js';
import * as gateway from '../server/appStore.js';
import { configureTaskStorage } from '../server/productivity/bootstrap.js';
import { createWalletPorts } from '../server/wallet/ports.js';
import { defaultWalletSettings } from '../src/features/wallet/settingsContracts.js';
import { UserRole } from '../src/types.js';
await configureTaskStorage(sqlite);
const actor = { userId: 'wallet-browser-member', role: UserRole.MEMBER }, admin = { userId: 'wallet-browser-admin', role: UserRole.ADMIN }, ctx = (expectedRevision = 0, subject = actor) => ({ actor: subject, idempotencyKey: randomUUID(), expectedRevision }), ports = createWalletPorts(sqlite, gateway, { now: () => Date.parse('2026-10-17T03:00:00.000Z') }), db = sqlite.sqliteConnection();
const exact = db.prepare("SELECT id FROM wallet_accounts WHERE name='Synthetic exact balance'").get() as {
    id: string;
};
const record = { kind: 'expense' as const, accountId: exact.id, money: { minor: '100', currency: 'VND' }, effectiveDate: '2026-10-17', timezone: 'Asia/Ho_Chi_Minh', note: 'Synthetic recovery Tiếng Việt 中文 🧪', payee: '', paymentMethod: '', occurredAt: null, reviewedAt: null, categoryId: null, labelIds: [], settlementStatus: 'cleared' as const };
try {
    const saved = ports.records.createRecord(ctx(), record), png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const receipt = ports.receipts.attach(ctx(1), saved.record.id, { fileName: 'Synthetic recovery.png', dataUrl: 'data:image/png;base64,' + png.toString('base64') });
    ports.settings.saveWalletSettings(ctx(), { ...defaultWalletSettings, locale: 'vi-VN', hideBalances: true, sessionIdleMinutes: 15 });
    const scheduleDraft = { name: 'Synthetic recovery bill', record, recurrence: { anchorDate: '2026-10-17', timezone: record.timezone, frequency: 'monthly', interval: 1, monthEndPolicy: 'clamp' }, mode: 'manual', reminderDays: [0], paused: false } as const;
    const schedule = ports.schedules.saveSchedule(ctx(), { draft: scheduleDraft });
    ports.schedules.materializeSchedule(ctx(1), schedule.id);
    const occurrence = ports.schedules.listOccurrences(actor, schedule.id)[0];
    assert(occurrence);
    ports.schedules.confirmOccurrence(ctx(1), occurrence.id, {});
    ports.schedules.saveSchedule(ctx(1), { id: schedule.id, draft: { ...scheduleDraft, paused: true } });
    const account = ports.accounts.createAccount(ctx(), { name: 'Synthetic recovery investment', type: 'investment', currency: 'VND', openingMinor: '10000', openingDate: '2026-10-17', accessMode: 'private' }).account;
    const instrument = ports.investments.saveInstrument(ctx(0, admin), { exchange: 'SYNTH', ticker: 'RECOVERY', name: 'Synthetic recovery instrument', kind: 'etf', currency: 'VND', timezone: record.timezone });
    ports.investments.recordTrade(ctx(), { draft: { accountId: account.id, instrumentId: instrument.id, kind: 'buy', quantity: '10', price: { minor: '100', currency: 'VND' }, fee: { minor: '10', currency: 'VND' }, date: '2026-10-17', timezone: record.timezone, note: 'Synthetic recovery purchase', accountRevision: 1, portfolioRevision: 0 } });
    ports.marketData.saveManualQuote(ctx(0, admin), { instrumentId: instrument.id, date: '2026-10-17', price: { minor: '130', currency: 'VND' } });
    const batch = await ports.imports.stageImport(ctx(), { accountId: exact.id, fileName: 'synthetic-recovery.csv', format: 'csv', bytes: Buffer.from('date,amount\n17/10/2026,-1\n17/10/2026,2\n') });
    const preview = await ports.imports.previewImport(ctx(batch.revision), batch.id, { headerRow: 1, dateColumn: 1, amount: { mode: 'signed', column: 2 }, dateFormat: 'DD/MM/YYYY', locale: 'vi-VN', timezone: record.timezone, status: 'cleared', labelDelimiter: '|', defaultCategoryId: null, labelIds: [], excludedRows: [] });
    ports.imports.commitImport(ctx(preview.revision), batch.id, preview.revision);
    assert.equal(ports.receipts.read(actor, saved.record.id, receipt.receipt.id).bytes.equals(png), true);
    assert.equal(ports.investments.portfolio(actor, account.id, '2026-10-17').totalValue?.minor, '10290');
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    process.stdout.write(JSON.stringify({ synthetic: true, accountId: exact.id, recordId: saved.record.id, receiptId: receipt.receipt.id, investmentId: account.id, occurrenceId: occurrence.id, batchId: batch.id }) + '\n');
}
finally {
    sqlite.sqliteClose();
}
