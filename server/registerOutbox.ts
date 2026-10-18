import {UserRole} from '../src/types.js';
import type { AppJobs } from './appJobs.js';
import type { FamilyDB } from './db.js';
import type * as Push from './push.js';
import type {WalletNotificationPolicy} from './wallet/notificationAccess.js';

/** Pure registration port: importing the application factory never opens storage. */
export function registerPushDelivery(jobs: AppJobs, db: typeof FamilyDB, push: typeof Push,walletPolicy?:WalletNotificationPolicy): void {
  if (!jobs.durableEnabled) return; // Explicit offline/in-memory injected test registry.
  jobs.registerAppJob('legacy', 'push-delivery', async (signal, job) => {
    const payload = job?.payload;
    if (!payload || !['notificationId', 'endpoint', 'userId'].every(key => typeof payload[key] === 'string')) throw new Error('Invalid push outbox reference');
    const subscription = db.getPushSubscriptions().find(item => item.endpoint === payload.endpoint && item.userId === payload.userId);
    const recipient = db.getUsers().find(user => user.id === payload.userId && !user.isDeleted);
    if (!subscription || !recipient || !Object.values(UserRole).includes(recipient.role) || payload.excludeUserId === recipient.id) return;
    const notifications=walletPolicy?db.getNotificationsForActor(recipient.id,walletPolicy.read):db.getNotificationsForActor(recipient.id);
    const notification=walletPolicy?db.getQueuedNotificationForActor(payload.notificationId,recipient.id,walletPolicy.delivery):db.getQueuedNotificationForActor(payload.notificationId,recipient.id);
    if(!notification)return;
    const outcome = await push.sendQueuedNotification({ notifications }, notification, subscription, signal);
    if (outcome === 'dead') db.removePushSubscriptionByEndpoint(subscription.endpoint);
  });
}
