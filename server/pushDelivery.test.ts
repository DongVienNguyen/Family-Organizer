import { expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => ({ setVapidDetails: vi.fn(), generateRequestDetails: vi.fn((subscription, payload, options) => ({ subscription, payload, options })), sendNotification: vi.fn(async (_subscription?: unknown, _payload?: unknown, _options?: unknown) => ({})) }));
vi.mock('web-push', () => ({ default: provider }));
vi.mock('./pushTransport.js', () => ({ sendPushRequest: (details: any) => provider.sendNotification(details.subscription, details.payload, details.options) }));
vi.stubEnv('VAPID_PUBLIC_KEY', 'synthetic-public-vapid');
vi.stubEnv('VAPID_PRIVATE_KEY', 'synthetic-private-vapid');
const push = await import('./push.js');
const notification = { id: 'synthetic-notification', userId: 'synthetic-user', title: 'Synthetic', content: 'Synthetic content', type: 'task', isRead: false, createdAt: '2026-01-01' } as any;
const subscription = { id: 'synthetic-subscription', userId: 'synthetic-user', endpoint: 'https://push.invalid/synthetic', subscription: { endpoint: 'https://push.invalid/synthetic' } } as any;

it('delivers with a bounded provider timeout, stable tag and current badge without real networking', async () => {
  expect(push.sendQueuedNotification).toBeTypeOf('function');
  provider.sendNotification.mockResolvedValueOnce({});
  expect(await push.sendQueuedNotification({ notifications: [notification] }, notification, subscription, new AbortController().signal)).toBe('ok');
  const args = provider.sendNotification.mock.calls.at(-1) as any;
  expect(JSON.parse(args[1])).toMatchObject({ tag: notification.id, tab: 'tasks', badge: 1 });
  expect(args[2].timeout).toBe(15_000);
});

it('distinguishes dead subscriptions, known rejection and uncertain network outcomes', async () => {
  expect(push.sendQueuedNotification).toBeTypeOf('function');
  provider.sendNotification.mockRejectedValueOnce({ statusCode: 410 });
  expect(await push.sendQueuedNotification({ notifications: [] }, notification, subscription, new AbortController().signal)).toBe('dead');
  provider.sendNotification.mockRejectedValueOnce({ statusCode: 429 });
  await expect(push.sendQueuedNotification({ notifications: [] }, notification, subscription, new AbortController().signal)).rejects.toMatchObject({ unknownOutcome: false });
  provider.sendNotification.mockRejectedValueOnce(new Error('Synthetic timeout'));
  await expect(push.sendQueuedNotification({ notifications: [] }, notification, subscription, new AbortController().signal)).rejects.toMatchObject({ unknownOutcome: true });
});

it('does not begin delivery after worker cancellation', async () => {
  expect(push.sendQueuedNotification).toBeTypeOf('function');
  const before = provider.sendNotification.mock.calls.length; const controller = new AbortController(); controller.abort();
  await expect(push.sendQueuedNotification({ notifications: [] }, notification, subscription, controller.signal)).rejects.toMatchObject({ unknownOutcome: false });
  expect(provider.sendNotification.mock.calls).toHaveLength(before);
});
