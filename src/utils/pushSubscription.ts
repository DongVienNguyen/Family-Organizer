/** Read existing subscription state only after the browser grants permission.
 * A native read before permission can stall Windows WebKit's script/driver
 * bridge. Enabling notifications still requests permission from a user gesture.
 */
export async function readExistingPushSubscription(
  permission: NotificationPermission,
  ready: () => Promise<ServiceWorkerRegistration>,
): Promise<PushSubscription | null> {
  if (permission !== 'granted') return null;
  const registration = await ready();
  return registration.pushManager.getSubscription();
}
