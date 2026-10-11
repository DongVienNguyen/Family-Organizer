import type { AppJobs } from './appJobs.js';
import type { FamilyDB } from './db.js';
import type * as Push from './push.js';

/** Pure registration port: importing the application factory never opens storage. */
export function registerPushDelivery(jobs: AppJobs, db: typeof FamilyDB, push: typeof Push): void {
  if (!jobs.durableEnabled) return; // Explicit offline/in-memory injected test registry.
  jobs.registerAppJob('legacy', 'push-delivery', async (signal, job) => {
    const payload = job?.payload;
    if (!payload || !['notificationId', 'endpoint', 'userId'].every(key => typeof payload[key] === 'string')) throw new Error('Invalid push outbox reference');
    const notification = db.getNotifications().find(item => item.id === payload.notificationId);
    const subscription = db.getPushSubscriptions().find(item => item.endpoint === payload.endpoint && item.userId === payload.userId);
    const recipient = db.getUsers().find(user => user.id === payload.userId && !user.isDeleted);
    if (!notification || !subscription || !recipient || (notification.userId !== 'all' && notification.userId !== recipient.id) || payload.excludeUserId === recipient.id) return;
    const outcome = await push.sendQueuedNotification({ notifications: db.getNotifications() }, notification, subscription, signal);
    if (outcome === 'dead') db.removePushSubscriptionByEndpoint(subscription.endpoint);
  });
}
