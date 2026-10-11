import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { collectAppSnapshot, validateAppSnapshot, restoreAppSnapshot, registerSnapshotTable } from './appSnapshot.js';
import { withAppWriteTransaction } from './appStore.js';
import { registerDomainMigration, applyDomainMigrations } from './appMigrations.js';
import { AppJobStore } from './jobStore.js';
import { AppJobs } from './appJobs.js';
import { RewardStoreTx } from './rewardStore.js';
import { FamilyDB, setAppSetting, getAppSettings } from './db.js';
import { sqliteConnection, sqliteLoad } from './sqlite.js';
import { UPLOADS_DIR } from './media.js';

const meta = () => ({ actorId: 'synthetic-snapshot', command: 'synthetic:snapshot', requestId: randomUUID(), payloadHash: createHash('sha256').update('synthetic').digest('hex') });
const capture = () => withAppWriteTransaction(meta(), collectAppSnapshot);
const options = { maintenance: async <T>(work: () => Promise<T>) => work() };
const file = path.join(UPLOADS_DIR, 'synthetic.bin');
let initialized = false;
function fixture() {
  if (!initialized) {
    registerSnapshotTable('wallet', 'wallet_snapshot_fixture', ['id','minor']);
    registerDomainMigration('wallet', 1, tx => tx.exec('CREATE TABLE wallet_snapshot_fixture (id TEXT PRIMARY KEY, minor INTEGER NOT NULL)'), 'synthetic-snapshot-wallet-v1');
    applyDomainMigrations({ enabled: ['wallet'], pilot: true });
    initialized = true;
  }
  fs.writeFileSync(file, 'synthetic original bytes');
  setAppSetting('rewardsEnabled', '1'); setAppSetting('geminiApiKey', 'synthetic-secret-excluded');
  withAppWriteTransaction(meta(), tx => {
    tx.run('INSERT OR REPLACE INTO wallet_snapshot_fixture VALUES (?,?)', 'synthetic-wallet', 1700);
    tx.legacy.tasks = [{ id: 'synthetic-snapshot-task', title: 'Synthetic task', status: 'todo', createdAt: '2026-01-01' } as any];
    new RewardStoreTx(tx).applyCompletionGrant({ claimId: randomUUID(), taskId: 'synthetic-snapshot-task', userId: tx.legacy.users[0].id, points: 4, actorId: tx.legacy.users[0].id, reason: 'Synthetic snapshot points' });
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('collects one consistent WAL snapshot of task, Wallet rows, canonical points, media and namespace versions', async () => {
  fixture(); const snapshot = capture();
  expect(sqliteConnection().pragma('journal_mode', { simple: true })).toBe('wal');
  expect(snapshot.manifest).toMatchObject({ schemaVersion: 1, domains: { wallet: 1, productivity: 0 }, legacyVersion: 1 });
  expect(snapshot.legacy.tasks[0].id).toBe('synthetic-snapshot-task');
  expect(snapshot.tables.wallet_snapshot_fixture).toEqual([{ id: 'synthetic-wallet', minor: 1700 }]);
  expect(snapshot.legacy.rewardLedger.some((row: any) => row.points === 4)).toBe(true);
  expect(snapshot.manifest.mediaManifest).toContainEqual(expect.objectContaining({ path: 'synthetic.bin', sha256: createHash('sha256').update('synthetic original bytes').digest('hex') }));
  expect(snapshot.settings.rewardsEnabled).toBe('1'); expect(JSON.stringify(snapshot)).not.toContain('synthetic-secret-excluded');
  withAppWriteTransaction(meta(), tx => { tx.legacy.tasks = []; tx.legacy.rewardLedger = []; tx.run('UPDATE wallet_snapshot_fixture SET minor=99'); });
  fs.writeFileSync(file, 'synthetic changed'); setAppSetting('rewardsEnabled', '0');
  expect(await restoreAppSnapshot(validateAppSnapshot(JSON.parse(JSON.stringify(snapshot))), options)).toMatchObject({ restoredFiles: 1 });
  expect(sqliteLoad().tasks).toEqual(snapshot.legacy.tasks); expect(sqliteLoad().rewardLedger).toEqual(snapshot.legacy.rewardLedger);
  expect(sqliteConnection().prepare('SELECT * FROM wallet_snapshot_fixture').all()).toEqual(snapshot.tables.wallet_snapshot_fixture);
  expect(fs.readFileSync(file, 'utf8')).toBe('synthetic original bytes'); expect(getAppSettings().rewardsEnabled).toBe('1');
  // Ordinary restore never imports provider keys and preserves local secret configuration.
  expect(getAppSettings().geminiApiKey).toBe('synthetic-secret-excluded');
});

it.each(['checksum','namespace','future-version','table','media-path'])('rejects invalid %s before changing live database or media', mode => {
  fixture(); const snapshot = capture(); const before = sqliteLoad(); const bytes = fs.readFileSync(file);
  const changed = JSON.parse(JSON.stringify(snapshot));
  if (mode === 'checksum') changed.manifest.checksum = '0'.repeat(64);
  if (mode === 'namespace') delete changed.manifest.domains.productivity;
  if (mode === 'future-version') changed.manifest.domains.wallet = 900;
  if (mode === 'table') changed.tables['wallet_uploaded_sql;DROP TABLE users'] = [];
  if (mode === 'media-path') changed.media['../outside:stream'] = Buffer.from('synthetic').toString('base64');
  expect(() => validateAppSnapshot(changed)).toThrow();
  expect(sqliteLoad()).toEqual(before); expect(fs.readFileSync(file)).toEqual(bytes);
});

it('drops restored historical effects and leases, retaining only explicit future schedules that can run', async () => {
  fixture(); const store = new AppJobStore();
  const effect = store.enqueue({ namespace: 'synthetic_restore', type: 'queue', key: randomUUID(), payload: {}, kind: 'effect' });
  const future = store.enqueue({ namespace: 'synthetic_restore', type: 'queue', key: randomUUID(), payload: { synthetic: true }, kind: 'schedule', availableAt: Date.now() + 60_000 });
  const snapshot = capture();
  await restoreAppSnapshot(validateAppSnapshot(snapshot), options);
  expect(sqliteConnection().prepare('SELECT status FROM app_jobs WHERE id=?').get(effect)).toEqual({ status: 'dropped' });
  expect(sqliteConnection().prepare('SELECT status FROM app_jobs WHERE id=?').get(future)).toEqual({ status: 'pending' });
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 60_001);
  const calls: string[] = []; const jobs = new AppJobs(error => { throw error; }, store);
  jobs.registerAppJob('synthetic_restore', 'queue', (_signal, job) => { calls.push(job!.id); });
  try { jobs.start(); await vi.advanceTimersByTimeAsync(1); expect(calls).toEqual([future]); }
  finally { await jobs.stop(); }
});

it('waits for accepted workers to drain before replacing their storage and resumes future work', async () => {
  fixture(); const snapshot = capture(); const store = new AppJobStore();
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); const errors: unknown[] = [];
  const jobs = new AppJobs(error => errors.push(error), store);
  jobs.registerAppJob('synthetic_drain', 'writer', async () => { entered(); await held; FamilyDB.addRewardEntry({ userId: FamilyDB.getUsers()[0].id, points: 21 }, 'synthetic', 'Synthetic'); });
  store.enqueue({ namespace: 'synthetic_drain', type: 'writer', key: randomUUID(), payload: {} });
  jobs.start(); await started; let restored = false;
  const restoring = restoreAppSnapshot(validateAppSnapshot(snapshot), { maintenance: async work => { await jobs.pause(); const result = await work(); jobs.resume(); return result; } }).then(() => { restored = true; });
  try {
    await new Promise(resolve => setTimeout(resolve, 20)); expect(restored).toBe(false);
    release(); await restoring; expect(errors).toEqual([]);
    expect(sqliteLoad().rewardLedger).toEqual(snapshot.legacy.rewardLedger);
  } finally { release(); await restoring; await jobs.stop(); }
});

it('rolls files and SQL back if promotion fails before commit, then leaves no active journal', async () => {
  fixture(); const snapshot = capture();
  fs.writeFileSync(file, 'synthetic current bytes'); setAppSetting('rewardsEnabled', '0');
  withAppWriteTransaction(meta(), tx => { tx.run('UPDATE wallet_snapshot_fixture SET minor=99'); });
  const before = sqliteLoad();
  await expect(restoreAppSnapshot(validateAppSnapshot(snapshot), { ...options, onBoundary: phase => { if (phase === 'media-promoted') throw new Error('Synthetic promotion failure'); } })).rejects.toThrow('Synthetic promotion failure');
  expect(sqliteLoad()).toEqual(before); expect(fs.readFileSync(file, 'utf8')).toBe('synthetic current bytes');
  expect(getAppSettings().rewardsEnabled).toBe('0');
  expect(sqliteConnection().prepare('SELECT minor FROM wallet_snapshot_fixture').get()).toEqual({ minor: 99 });
  expect(fs.existsSync(path.join(process.env.DATA_DIR!, 'restore-journal.json'))).toBe(false);
});
