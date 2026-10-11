import { afterEach, expect, it, vi } from 'vitest';
import { setAppSetting, getAppSettings } from './db.js';
import { runTelegramBackupTick } from './telegramBackup.js';
import { runWeeklyDigestTick } from './weeklyDigest.js';
vi.mock('./fullBackup.js', () => ({ streamFullBackup: async (out: any) => { out.end(Buffer.from('synthetic archive')); }, fullBackupFilename: () => 'synthetic.zip' }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function configure() {
  setAppSetting('telegramBotToken', 'synthetic-provider-token'); setAppSetting('telegramChatId', 'synthetic-chat');
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
