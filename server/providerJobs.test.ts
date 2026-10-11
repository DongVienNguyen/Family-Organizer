import fs from 'node:fs';
import { backupOccurrence, digestOccurrence } from './providerOccurrences.js';
import { AppJobs } from './appJobs.js';
import { AppJobStore } from './jobStore.js';
import { sqliteConnection } from './sqlite.js';
import { afterEach, expect, it, vi } from 'vitest';
import { setAppSetting, getAppSettings,FamilyDB } from './db.js';
import { runTelegramBackupTick } from './telegramBackup.js';
import { runWeeklyDigestTick } from './weeklyDigest.js';
vi.mock('./fullBackup.js', () => ({ streamFullBackup: async (out: any) => { out.end(Buffer.from('synthetic archive')); }, fullBackupFilename: () => 'synthetic.zip' }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function configure() {
  setAppSetting('telegramBotToken', 'synthetic-provider-token'); setAppSetting('telegramChatId', 'synthetic-chat');
  setAppSetting('telegramWeeklyDigestOwnerId',FamilyDB.getUsers()[0].id);
  setAppSetting('telegramBackupEnabled', '1'); setAppSetting('telegramWeeklyDigestEnabled', '1');
}

it('reports rejected automatic backup and drains its failure alert before releasing the job', async () => {
  configure(); vi.spyOn(console, 'error').mockImplementation(() => {});
  let release!: () => void; const alert = new Promise<any>(resolve => { release = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }); });
  const fetch = vi.fn(async (url: any) => String(url).endsWith('/sendMessage') ? alert : { ok: false, status: 429, json: async () => ({ ok: false, description: 'Synthetic rejected delivery' }) });
  vi.stubGlobal('fetch', fetch);
  let done = false; let failure: any;
  const pending = runTelegramBackupTick(new Date('2026-01-02T02:30:00')).then(() => { done = true; }, error => { done = true; failure = error; });
  try {
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(done).toBe(false); release(); await pending;
    expect(failure).toMatchObject({ unknownOutcome: false });
    expect(getAppSettings().telegramBackupLastSent).toBeUndefined();
  } finally { release(); await pending; }
});

it('reports digest rejection as a job failure instead of acknowledging successful delivery', async () => {
  configure(); vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetch = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ ok: false, description: 'Synthetic rejected delivery' }) }));
  vi.stubGlobal('fetch', fetch);
  await expect(runWeeklyDigestTick(new Date('2026-01-05T08:00:00'))).rejects.toMatchObject({ unknownOutcome: false });
  expect(fetch).toHaveBeenCalledTimes(1); expect(getAppSettings().telegramWeeklyDigestLastSent).toBeUndefined();
});

// The automatic scheduler must fence a logical occurrence across later ticks.
it.each([
  ['weekly-digest', '2026-01-05T08:00:00', runWeeklyDigestTick, '2026-01-05'],
  ['telegram-backup', '2026-01-02T02:00:00', runTelegramBackupTick, '2026-01-02'],
])('does not resend uncertain %s at the next interval or after restart', async (type, date, tick, day) => {
  configure(); vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers(); vi.setSystemTime(new Date(date as string));
  const fetch = vi.fn(async (url: any) => {
    if (String(url).endsWith('/sendMessage') && type === 'telegram-backup') return { ok: true, status: 200, json: async () => ({ ok: true }) };
    throw new Error('Synthetic lost acknowledgement');
  });
  vi.stubGlobal('fetch', fetch);
  const store = new AppJobStore(); const registries: AppJobs[] = [];
  const start = () => {
    const jobs = new AppJobs(() => {}, store); registries.push(jobs);
    jobs.registerAppJob('legacy', type as string, () => (tick as any)(new Date()), {
      everyMs: 30 * 60 * 1000, initialMs: 0, kind: 'effect',
      occurrenceKey: type === 'weekly-digest' ? digestOccurrence : backupOccurrence,
    } as any); jobs.start(); return jobs;
  };
  try {
    const first = start(); await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(sqliteConnection().prepare("SELECT status FROM app_jobs WHERE type=?").get(type)).toMatchObject({ status: 'unknown' }));
    const attempts = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    await first.stop(); start(); await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(attempts);
    expect(sqliteConnection().prepare('SELECT COUNT(*) AS count FROM app_jobs WHERE type=?').get(type)).toEqual({ count: 1 });
  } finally { await Promise.all(registries.map(jobs => jobs.stop())); vi.useRealTimers(); }
});

it('preserves an uncertain document outcome when awaited temporary-file cleanup also fails', async () => {
  configure(); vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    if (String(url).endsWith('/sendMessage')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
    throw new Error('Synthetic lost acknowledgement');
  }));
  const unlink = fs.promises.unlink.bind(fs.promises); const leftover: string[] = [];
  vi.spyOn(fs.promises, 'unlink').mockImplementation(async file => {
    if (String(file).includes('fo-backup-')) { leftover.push(String(file)); throw Object.assign(new Error('Synthetic Windows lock'), { code: 'EACCES' }); }
    return unlink(file);
  });
  try { await expect(runTelegramBackupTick(new Date('2026-01-03T02:30:00'))).rejects.toMatchObject({ unknownOutcome: true }); }
  finally { for (const file of leftover) await unlink(file); }
});
