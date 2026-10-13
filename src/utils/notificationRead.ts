export async function completeNotificationRead(request: () => Promise<Response>, refresh: () => void): Promise<void> {
  const response = await request();
  await response.json();
  refresh();
}
