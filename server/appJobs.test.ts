import { describe, it, expect } from 'vitest';
const load = async () => import('./appJobs.js').catch(() => ({} as any));
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
describe('managed job registry', () => {
  it('does not run on registration and refuses duplicate namespaced handlers', async () => {
    const { AppJobs } = await load(); expect(AppJobs).toBeTypeOf('function');
    const jobs = new AppJobs(); let calls = 0;
    jobs.registerAppJob('legacy', 'reminders', async () => { calls++; }, { everyMs: 10 });
    expect(() => jobs.registerAppJob('legacy', 'reminders', async () => {}, { everyMs: 10 })).toThrow(/registered/);
    await delay(25); expect(calls).toBe(0); await jobs.stop();
  });
  it('serializes each job and pause drains its active handler before returning', async () => {
    const { AppJobs } = await load(); expect(AppJobs).toBeTypeOf('function');
    const jobs = new AppJobs(); let calls = 0; let finish!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    jobs.registerAppJob('legacy', 'held', async signal => { calls++; await held; expect(signal.aborted).toBe(true); }, { everyMs: 5, initialMs: 0 });
    jobs.start(); await delay(25); expect(calls).toBe(1);
    let paused = false; const pause = jobs.pause().then(() => { paused = true; });
    await delay(15); expect(paused).toBe(false); finish(); await pause;
    await delay(15); expect(calls).toBe(1); await jobs.stop();
  });
  it('resumes schedules but permanent stop cannot resume or execute again', async () => {
    const { AppJobs } = await load(); expect(AppJobs).toBeTypeOf('function');
    const jobs = new AppJobs(); let calls = 0;
    jobs.registerAppJob('legacy', 'tick', async () => { calls++; }, { everyMs: 10, initialMs: 0 });
    jobs.start(); await delay(25); await jobs.pause(); const prior = calls;
    await delay(20); expect(calls).toBe(prior); jobs.resume(); await delay(25); expect(calls).toBeGreaterThan(prior);
    await jobs.stop(); const stopped = calls; expect(() => jobs.resume()).toThrow(/stopped/);
    await delay(20); expect(calls).toBe(stopped);
  });
  it('does not replay startup work immediately when resuming after maintenance', async () => {
    const { AppJobs } = await load(); const jobs = new AppJobs(); let calls = 0;
    jobs.registerAppJob('legacy','startup', async () => { calls++; }, {everyMs:1000,initialMs:0});
    jobs.start(); await delay(15); await jobs.pause(); expect(calls).toBe(1);
    jobs.resume(); await delay(20); expect(calls).toBe(1); await jobs.stop();
  });

});
