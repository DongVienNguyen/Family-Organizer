import { randomUUID, createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppJobs } from './appJobs.js';
import { AppJobStore } from './jobStore.js';
import { withAppWriteTransaction } from './appStore.js';
import { FamilyDB } from './db.js';
import { sqliteConnection } from './sqlite.js';

let registries: AppJobs[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); });
afterEach(async () => { await Promise.all(registries.map(registry => registry.stop())); registries = []; vi.useRealTimers(); });
const row = (id: string) => sqliteConnection().prepare('SELECT status, attempts FROM app_jobs WHERE id = ?').get(id) as any;

it('pauses the same durable registry, drains an accepted worker and resumes future work', async () => {
  const store = new AppJobStore(); const errors: unknown[] = [];
  const registry = new AppJobs(error => errors.push(error), store, { leaseMs: 1000 }); registries.push(registry);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  registry.registerAppJob('synthetic', 'drain', async (signal, job) => { calls++; expect(job!.payload).toEqual({ synthetic: true }); if (calls === 1) { await held; expect(signal.aborted).toBe(true); } });
  const id = store.enqueue({ namespace: 'synthetic', type: 'drain', key: randomUUID(), payload: { synthetic: true } });
  try {
    registry.start(); await vi.advanceTimersByTimeAsync(1); expect(calls).toBe(1);
    let drained = false; const pause = registry.pause().then(() => { drained = true; });
    await vi.advanceTimersByTimeAsync(50); expect(drained).toBe(false);
    release(); await pause; expect(row(id).status).toBe('completed');
    const future = store.enqueue({ namespace: 'synthetic', type: 'drain', key: randomUUID(), payload: { synthetic: true }, availableAt: Date.now() + 500 });
    await vi.advanceTimersByTimeAsync(600); expect(calls).toBe(1);
    registry.resume(); await vi.advanceTimersByTimeAsync(250); expect(calls).toBe(2); expect(row(future).status).toBe('completed');
    expect(errors).toEqual([]);
  } finally { release(); }
});

it('renews a held lease so a second registry cannot run the same command', async () => {
  const store = new AppJobStore(); const errors: unknown[] = [];
  const first = new AppJobs(error => errors.push(error), store, { leaseMs: 300 });
  const second = new AppJobs(error => errors.push(error), store, { leaseMs: 300 }); registries.push(first, second);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  first.registerAppJob('synthetic', 'exclusive', async () => { calls++; await held; });
  second.registerAppJob('synthetic', 'exclusive', async () => { calls++; await held; });
  const id = store.enqueue({ namespace: 'synthetic', type: 'exclusive', key: randomUUID(), payload: null });
  try {
    first.start(); second.start(); await vi.advanceTimersByTimeAsync(1200); expect(calls).toBe(1);
    expect(row(id).attempts).toBe(1); release(); await vi.advanceTimersByTimeAsync(1);
    expect(row(id).status).toBe('completed'); expect(errors).toEqual([]);
  } finally { release(); }
});

it('retries an acknowledged failure with the same command ID and no duplicate points', async () => {
  const store = new AppJobStore(); const errors: unknown[] = [];
  const registry = new AppJobs(error => errors.push(error), store, { leaseMs: 1000 }); registries.push(registry);
  const owner = FamilyDB.getUsers()[0]; const before = FamilyDB.getRewardLedger().length;
  let calls = 0;
  registry.registerAppJob('synthetic', 'retry-command', async (_signal, job) => {
    calls++;
    withAppWriteTransaction({ actorId: 'synthetic', command: 'synthetic:stable-reward', requestId: job!.id, payloadHash: createHash('sha256').update('fixture').digest('hex') }, () => FamilyDB.addRewardEntry({ userId: owner.id, points: 9 }, owner.id, 'Synthetic'));
    if (calls === 1) throw new Error('Synthetic crash after commit');
  });
  const id = store.enqueue({ namespace: 'synthetic', type: 'retry-command', key: randomUUID(), payload: null });
  registry.start(); await vi.advanceTimersByTimeAsync(1); expect(row(id).status).toBe('pending');
  await vi.advanceTimersByTimeAsync(999); expect(row(id).status).toBe('completed'); expect(row(id).attempts).toBe(2);
  expect(FamilyDB.getRewardLedger()).toHaveLength(before + 1); expect(calls).toBe(2); expect(errors).toHaveLength(1);
});

it('claims a newly enqueued scheduled command on its first tick when the clock advances during enqueue',async()=>{
 const store=new AppJobStore(),enqueue=store.enqueue.bind(store),claim=store.claim.bind(store),errors:unknown[]=[],observations:{at:number;available:number;claimed:boolean}[]=[];let calls=0;
 vi.spyOn(store,'enqueue').mockImplementation(input=>{vi.setSystemTime(Date.now()+1);return enqueue(input);});
 vi.spyOn(store,'claim').mockImplementation((namespace,type,at,leaseMs)=>{const available=(sqliteConnection().prepare('SELECT available_at FROM app_jobs WHERE namespace=? AND type=?').get(namespace,type)as any).available_at;const result=claim(namespace,type,at,leaseMs);observations.push({at,available,claimed:!!result});return result;});
 const registry=new AppJobs(error=>errors.push(error),store);registries.push(registry);registry.registerAppJob('synthetic','enqueue-clock-'+randomUUID().replaceAll('-',''),()=>{calls++;},{everyMs:12*3600000,initialMs:0});registry.start();await vi.advanceTimersByTimeAsync(1);
 expect(observations.length).toBeGreaterThan(0);expect(observations[0].at).toBeGreaterThanOrEqual(observations[0].available);expect(observations[0].claimed).toBe(true);expect(calls).toBe(1);expect(errors).toEqual([]);
});
