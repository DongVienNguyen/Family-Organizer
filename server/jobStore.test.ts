import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { withAppWriteTransaction } from './appStore.js';
import { AppJobStore, enqueueAppJob } from './jobStore.js';
import { sqliteConnection, sqliteLoad } from './sqlite.js';
import { FamilyDB } from './db.js';
import { withAppCommandContext } from './commandContext.js';

const meta = (id: string = randomUUID()) => ({ actorId: 'synthetic-job', command: 'synthetic:job', requestId: id, payloadHash: createHash('sha256').update('fixture').digest('hex') });
const input = (extra = {}) => ({ namespace: 'synthetic', type: 'fixture', key: randomUUID(), payload: { synthetic: true }, availableAt: 1000, ...extra });
const status = (id: string) => sqliteConnection().prepare('SELECT status, attempts, available_at, error_code FROM app_jobs WHERE id = ?').get(id) as any;

describe('shared durable jobs and transactional outbox', () => {
  it('commits an effect with its points and rolls both back on command failure', () => {
    const owner = sqliteLoad().users[0];
    const job = input({ kind: 'effect' });
    expect(() => withAppWriteTransaction(meta(), tx => { enqueueAppJob(tx, job); FamilyDB.addRewardEntry({ userId: owner.id, points: 8 }, owner.id, 'Synthetic'); throw new Error('abort'); })).toThrow('abort');
    expect(sqliteConnection().prepare('SELECT id FROM app_jobs WHERE unique_key = ?').get(job.key)).toBeUndefined();
    expect(FamilyDB.getRewardLedger().some(e => e.points === 8)).toBe(false);
    const id = withAppWriteTransaction(meta(), tx => { FamilyDB.addRewardEntry({ userId: owner.id, points: 8 }, owner.id, 'Synthetic'); return enqueueAppJob(tx, job); });
    expect(status(id).status).toBe('pending');
    expect(FamilyDB.getRewardLedger().some(e => e.points === 8)).toBe(true);
  });

  it('deduplicates by namespace/type/key, rejects changed payload and permits another namespace', () => {
    const store = new AppJobStore(); const job = input();
    const id = store.enqueue(job);
    expect(store.enqueue(job)).toBe(id);
    expect(() => store.enqueue({ ...job, payload: { changed: true } })).toThrow(/conflict/i);
    expect(store.enqueue({ ...job, namespace: 'synthetic_other' })).not.toBe(id);
  });

  it('gives one worker the lease and fences expired owners after reclaim', () => {
    const first = new AppJobStore(), second = new AppJobStore();
    const job = input({ type: 'lease' }); const id = first.enqueue(job);
    const lease = first.claim(job.namespace, job.type, 1000, 100)!;
    expect(lease.id).toBe(id); expect(lease.attempt).toBe(1);
    expect(second.claim(job.namespace, job.type, 1050, 100)).toBeUndefined();
    const reclaimed = second.claim(job.namespace, job.type, 1100, 100)!;
    expect(reclaimed.id).toBe(id); expect(reclaimed.token).not.toBe(lease.token); expect(reclaimed.attempt).toBe(2);
    expect(first.complete(lease, 1101)).toBe(false);
    expect(first.fail(lease, 1101)).toBe(false);
    expect(first.renew(lease, 1101, 100)).toBe(false);
    expect(second.complete(reclaimed, 1150)).toBe(true);
    expect(status(id).status).toBe('completed');
  });

  it('retries with backoff and fails at the configured attempt limit', () => {
    const store = new AppJobStore(), job = input({ type: 'retry', maxAttempts: 2 }); const id = store.enqueue(job);
    const first = store.claim(job.namespace, job.type, 1000, 100)!;
    expect(store.fail(first, 1010)).toBe(true);
    const due = status(id).available_at;
    expect(due).toBeGreaterThan(1010); expect(status(id).attempts).toBe(1);
    expect(store.claim(job.namespace, job.type, due - 1, 100)).toBeUndefined();
    const second = store.claim(job.namespace, job.type, due, 100)!;
    expect(store.fail(second, due + 1)).toBe(true);
    expect(status(id).status).toBe('failed');
    expect(store.claim(job.namespace, job.type, due + 1_000_000, 100)).toBeUndefined();
  });

  it('renewal extends ownership and an expired external effect reports unknown rather than replaying', () => {
    const store = new AppJobStore(), job = input({ type: 'uncertain', kind: 'effect' }); const id = store.enqueue(job);
    const lease = store.claim(job.namespace, job.type, 1000, 100)!;
    expect(store.renew(lease, 1050, 100)).toBe(true);
    expect(store.claim(job.namespace, job.type, 1120, 100)).toBeUndefined();
    expect(store.complete(lease, 1150)).toBe(false);
    expect(store.claim(job.namespace, job.type, 1150, 100)).toBeUndefined();
    expect(status(id).status).toBe('unknown');
  });

  it('uses a stable command ID so crash retry cannot grant a reward twice', () => {
    const store = new AppJobStore(), job = input({ type: 'reward-retry' }); const id = store.enqueue(job);
    const owner = sqliteLoad().users[0]; const before = FamilyDB.getRewardLedger().length;
    const execute = () => withAppWriteTransaction(meta(id), () => FamilyDB.addRewardEntry({ userId: owner.id, points: 6 }, owner.id, 'Synthetic'));
    const firstLease = store.claim(job.namespace, job.type, 1000, 100)!;
    const first = execute(); // Simulate crash after SQL commit but before acknowledging job.
    const next = store.claim(job.namespace, job.type, 1100, 100)!;
    expect(execute()).toEqual(first);
    expect(FamilyDB.getRewardLedger()).toHaveLength(before + 1);
    expect(store.complete(firstLease, 1101)).toBe(false);
    expect(store.complete(next, 1101)).toBe(true);
  });

  it('drops restored historic work/effects and retains only explicit future schedules', () => {
    const store = new AppJobStore();
    const effect = store.enqueue(input({ type: 'restore', kind: 'effect', availableAt: 5000 }));
    const command = store.enqueue(input({ type: 'restore', kind: 'command', availableAt: 1000 }));
    const future = store.enqueue(input({ type: 'restore', kind: 'schedule', availableAt: 5000 }));
    const oldSchedule = store.enqueue(input({ type: 'restore', kind: 'schedule', availableAt: 1000 }));
    withAppWriteTransaction(meta(), tx => store.restorePolicy(tx, 2000));
    expect(status(effect).status).toBe('dropped'); expect(status(command).status).toBe('dropped'); expect(status(oldSchedule).status).toBe('dropped');
    expect(status(future).status).toBe('pending');
    expect(store.claim('synthetic', 'restore', 4999, 100)).toBeUndefined();
    expect(store.claim('synthetic', 'restore', 5000, 100)!.id).toBe(future);
    const fresh = store.enqueue(input({ type: 'fresh-after-restore', availableAt: 6000 }));
    expect(store.claim('synthetic', 'fresh-after-restore', 6000, 100)!.id).toBe(fresh);
  });

  it('refuses writes by an expired job owner and rolls back a callback that outlives its lease', () => {
    const store = new AppJobStore(), job = input({ type: 'fenced-write' }); store.enqueue(job);
    const lease = store.claim(job.namespace, job.type, 1000, 100)!;
    const before = sqliteLoad(); const owner = before.users[0]; let clock = 1100;
    const context = { actorId: 'synthetic-job', requestId: lease.id, assertWriteOwnership: () => store.assertLease(lease, clock) };
    const execute = () => withAppWriteTransaction(meta(), () => FamilyDB.addRewardEntry({ userId: owner.id, points: 17 }, owner.id, 'Synthetic'));
    expect(() => withAppCommandContext(context, execute)).toThrow(/lease/i);
    expect(sqliteLoad()).toEqual(before);
    clock = 1050;
    expect(() => withAppCommandContext(context, () => withAppWriteTransaction(meta(), () => { FamilyDB.addRewardEntry({ userId: owner.id, points: 17 }, owner.id, 'Synthetic'); clock = 1100; }))).toThrow(/lease/i);
    expect(sqliteLoad()).toEqual(before);
  });
});
