import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { UserRole } from '../src/types.js';
import { FamilyDB } from './db.js';
import { sqliteConnection } from './sqlite.js';
import { withAppWriteTransaction } from './appStore.js';
import { AppJobs } from './appJobs.js';
import { AppJobStore } from './jobStore.js';
import { createApp } from './app.js';
import { syntheticDependencies } from '../tests/app-fixture.js';
const provider = vi.hoisted(() => ({ dispatchPush: vi.fn(async () => 0), sendQueuedNotification: vi.fn(async () => 'ok'), isPushConfigured: vi.fn(() => true) }));
vi.mock('./push.js', () => provider);
const admin = FamilyDB.getUsers()[0];
const recipient = FamilyDB.createUser({ username: 'synthetic-recipient', fullName: 'Synthetic recipient', role: UserRole.MEMBER, passwordPlain: 'synthetic-fixture-password', avatarColor: 'blue' }, admin.id, 'Synthetic');
const endpoint = 'https://push.invalid/synthetic/' + randomUUID();
FamilyDB.addPushSubscription(recipient.id, { endpoint, keys: { p256dh: 'synthetic', auth: 'synthetic' } }, 'Synthetic');
const pending = () => sqliteConnection().prepare("SELECT id, payload FROM app_jobs WHERE namespace = 'legacy' AND type = 'push-delivery' AND status = 'pending'").all() as any[];

it('records legacy notification delivery inside its command and does not send on rollback', () => {
  const before = pending().length;
  expect(() => withAppWriteTransaction({ actorId: admin.id, command: 'synthetic:notification-abort', requestId: randomUUID(), payloadHash: 'synthetic' }, () => {
    FamilyDB.sendManualNotification('Synthetic', admin.id, recipient.id, 'Synthetic rolled-back nudge'); throw new Error('abort');
  })).toThrow('abort');
  expect(pending()).toHaveLength(before); expect(provider.dispatchPush).not.toHaveBeenCalled(); expect(provider.sendQueuedNotification).not.toHaveBeenCalled();
  FamilyDB.sendManualNotification('Synthetic', admin.id, recipient.id, 'Synthetic committed nudge');
  expect(pending()).toHaveLength(before + 1); expect(provider.dispatchPush).not.toHaveBeenCalled();
  expect(JSON.stringify(pending())).not.toContain('p256dh'); // Queue stores managed references, not subscription credentials.
});

it('registers delivery on the same registry and rechecks current recipient/subscription references', async () => {
  const store = new AppJobStore(); const registry = new AppJobs(undefined, store);
  const registration = vi.spyOn(registry, 'registerAppJob');
  const dependencies = syntheticDependencies({ phase: 'ready', storageWritable: true });
  dependencies.jobs = registry; dependencies.db.FamilyDB = FamilyDB; dependencies.push = provider;
  const handle = await createApp({ production: true, codeRoot: process.cwd(), dataRoot: process.env.DATA_DIR! } as any, dependencies);
  try {
    const handler = registration.mock.calls.find(call => call[0] === 'legacy' && call[1] === 'push-delivery')?.[2];
    expect(handler).toBeTypeOf('function');
    const lease = store.claim('legacy', 'push-delivery', Date.now(), 60_000)!;
    expect(lease).toBeDefined();
    await handler!(new AbortController().signal, lease);
    expect(provider.sendQueuedNotification).toHaveBeenCalledTimes(1);
    store.complete(lease, Date.now());
    FamilyDB.sendManualNotification('Synthetic', admin.id, recipient.id, 'Synthetic stale subscription');
    FamilyDB.removePushSubscriptionByEndpoint(endpoint);
    const stale = store.claim('legacy', 'push-delivery', Date.now(), 60_000)!;
    await handler!(new AbortController().signal, stale);
    expect(provider.sendQueuedNotification).toHaveBeenCalledTimes(1);
    store.complete(stale, Date.now());
  } finally { await registry.stop(); await handle.dispose(); }
});
