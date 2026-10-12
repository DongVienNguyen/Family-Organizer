import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { browserCases } from '../../scripts/ci/browser-contract.mjs';

const test = base.extend<{ networkBoundary: void }>({
  networkBoundary: [async ({ context, page, baseURL }, use) => {
    if (!baseURL) throw new Error('Owned production server URL is required');
    const external: string[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '/* synthetic offline font fallback */' });
      external.push(url.origin + url.pathname);
      await route.abort('blockedbyclient');
    });
    await context.addInitScript(() => localStorage.setItem('family_lang', 'vi'));
    await use();
    expect(external, 'unexpected browser network destination').toEqual([]);
    expect(errors, 'uncaught browser errors').toEqual([]);
  }, { auto: true }],
});
test.beforeAll(async ({ browser, browserName }) => {
  const executable = browser.browserType().executablePath();
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(`reports/browser-runtime-${browserName}.json`, JSON.stringify({ browserName, browserVersion: browser.version(), executableSha256: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'), nodeVersion: process.version, platform: process.platform, architecture: process.arch }, null, 2));
});
async function login(page: Page, role: string) {
  await page.getByPlaceholder('Nhập tên đăng nhập gia đình...').fill(`browser-${role}`);
  await page.getByPlaceholder('Mật khẩu của từng thành viên...').fill('synthetic-browser-password');
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Đăng nhập Gia Đình', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.user.id).toBe(`browser-${role}`);
  expect(typeof body.token).toBe('string');
  await expect(page.getByRole('button', { name: `Mở hồ sơ của Synthetic ${role}`, exact: true })).toBeVisible();
  return body.token as string;
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByPlaceholder('Nhập tên đăng nhập gia đình...')).toBeVisible();
}
async function api(page: Page, pathname: string, token: string) {
  return page.evaluate(async ({ pathname, token }) => {
    const response = await fetch(pathname, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
    return { status: response.status, cache: response.headers.get('cache-control'), text: await response.text() };
  }, { pathname, token });
}
async function notes(page: Page) {
  await page.locator('aside nav').getByRole('button', { name: 'Ghi chú', exact: true }).click();
  await expect(page.getByText('Synthetic shared note', { exact: true })).toBeVisible();
}

test(browserCases[0], async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Nhập tên đăng nhập gia đình...').fill('browser-admin');
  await page.getByPlaceholder('Mật khẩu của từng thành viên...').fill('synthetic-wrong-password');
  const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login');
  await page.getByRole('button', { name: 'Đăng nhập Gia Đình', exact: true }).click();
  expect((await failed).status()).toBe(401);
  await expect(page.getByText('Tài khoản hoặc mật khẩu không chính xác!', { exact: true })).toBeVisible();
  const token = await login(page, 'admin');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mở hồ sơ của Synthetic admin', exact: true })).toBeVisible();
  expect((await api(page, '/api/finance', token)).status).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('header button').filter({ has: page.locator('svg.lucide-menu') }).click();
  const menu = page.getByRole('dialog', { name: 'Menu điều hướng', exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: 'Ghi chú', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByText('Synthetic shared note', { exact: true })).toBeVisible();
  const wasDark = await page.locator('html').evaluate(element => element.classList.contains('dark'));
  await page.getByTitle(wasDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối', { exact: true }).click();
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(!wasDark);
  await page.reload();
  await expect(page.getByText('Synthetic shared note', { exact: true })).toBeVisible();
  expect(await page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(!wasDark);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await logout(page);
  expect((await api(page, '/api/finance', token)).status).toBe(401);
});

test(browserCases[1], async ({ page }) => {
  await page.goto('/?tab=finance');
  const token = await login(page, 'child');
  await expect(page.locator('aside nav').getByRole('button', { name: 'Chi tiêu', exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic adult finance', { exact: true })).toHaveCount(0);
  const response = await api(page, '/api/finance', token);
  expect(response.status).toBe(403);
  expect(response.text).not.toContain('123456');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mở hồ sơ của Synthetic child', exact: true })).toBeVisible();
  await expect(page.locator('aside nav').getByRole('button', { name: 'Chi tiêu', exact: true })).toHaveCount(0);
});

test(browserCases[2], async ({ page }) => {
  await page.goto('/');
  const childToken = await login(page, 'child');
  const list = await api(page, '/api/notes', childToken);
  expect(list.status).toBe(200); expect(list.cache).toBe('no-store');
  expect(JSON.parse(list.text).notes.map((note: any) => note.id).sort()).toEqual(['browser-note-child', 'browser-note-shared']);
  const forbidden = await api(page, '/uploads/notes/private.png', childToken);
  // Existing media policy hides resource existence: denied and missing both404.
  expect(forbidden.status).toBe(404); expect(forbidden.cache).toBe('no-store');
  expect(forbidden.text).toBe((await api(page, '/uploads/notes/missing.png', childToken)).text);
  const shared = await api(page, '/uploads/notes/shared.png', childToken);
  expect(shared.status).toBe(200); expect(shared.cache).toBe('no-store');
  await notes(page);
  await expect(page.getByText('Synthetic child note', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic private note', { exact: true })).toHaveCount(0);
  await page.getByText('Synthetic shared note', { exact: true }).click();
  const image = page.locator('#note-reader-modal').getByRole('img', { name: 'synthetic shared', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.reload(); // closes the reader without depending on an unlabeled icon button
  await expect(page.getByRole('button', { name: 'Mở hồ sơ của Synthetic child', exact: true })).toBeVisible();
  await logout(page);
  const guestToken = await login(page, 'guest');
  const guest = await api(page, '/api/notes', guestToken);
  expect(JSON.parse(guest.text).notes.map((note: any) => note.id)).toEqual(['browser-note-shared']);
  expect((await api(page, '/uploads/notes/child.png', guestToken)).status).toBe(404);
});

test(browserCases[3], async ({ page }) => {
  await page.goto('/');
  await login(page, 'admin');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const privateCache = await caches.open('family-private-browser');
    await privateCache.put('/api/notes', new Response('SYNTHETIC_PRIVATE_SENTINEL'));
    const shell = await caches.open('family-static-v5');
    await shell.put('/api/notes', new Response('SYNTHETIC_PRIVATE_SENTINEL'));
    await shell.put('/assets/synthetic-public.js', new Response('synthetic public shell'));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('family-private-browser', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('private');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('private', 'readwrite');
        tx.objectStore('private').put('SYNTHETIC_PRIVATE_SENTINEL', 'record');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await logout(page);
  const remaining = await page.evaluate(async () => {
    const shell = await caches.open('family-static-v5');
    const deleted = await new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open('family-private-browser');
      request.onupgradeneeded = () => { request.transaction!.abort(); resolve(true); };
      request.onsuccess = () => { request.result.close(); resolve(false); };
      request.onerror = () => { if (request.error?.name !== 'AbortError') reject(request.error); };
    });
    return { caches: await caches.keys(), privateShell: !!await shell.match('/api/notes'), publicShell: !!await shell.match('/assets/synthetic-public.js'), deleted, worker: !!(await navigator.serviceWorker.ready).active };
  });
  expect(remaining.caches).not.toContain('family-private-browser');
  expect(remaining.privateShell).toBe(false); expect(remaining.publicShell).toBe(true);
  expect(remaining.deleted).toBe(true); expect(remaining.worker).toBe(true);
});

test(browserCases[4], async ({ page, context }) => {
  await page.goto('/');
  const memberToken = await login(page, 'member');
  await notes(page);
  await expect(page.getByText('Synthetic private note', { exact: true })).toBeVisible();
  expect((await api(page, '/uploads/notes/private.png', memberToken)).status).toBe(200);
  // Finish the initial authorized image loads before deliberately navigating.
  // WebKit reports navigation-cancelled fetches as access-control page errors;
  // the delayed response below must isolate the notes session boundary instead.
  for (const scope of ['private', 'shared']) {
    const image = page.getByRole('img', { name: `synthetic ${scope}`, exact: true });
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  // WebKit can send this request through its active service worker without a
  // Playwright route event. Delay the real fetch response inside the page instead.
  // Capture all real bytes before logout, then deliberately deliver them after
  // cancellation to test the session boundary when transport cannot stop delivery.
  await context.addInitScript(({ token }) => {
    const original = window.fetch.bind(window);
    const state = { capturing: false, held: false, delivered: false, status: 0, body: '', error: null as string | null, release: () => {} };
    (window as any).__foLateNotes = state;
    window.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (state.capturing || new URL(request.url).pathname !== '/api/notes' || request.headers.get('Authorization') !== 'Bearer ' + token) return original(input, init);
      state.capturing = true;
      try {
        const response = await original(input, init);
        state.status = response.status;
        state.body = await response.text();
        state.held = true;
        await new Promise<void>(resolve => { state.release = resolve; });
        state.delivered = true;
        return new Response(state.body, { status: response.status, headers: response.headers });
      } catch (error) { state.error = String(error); state.held = true; throw error; }
    };
  }, { token: memberToken });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => (window as any).__foLateNotes.held)).toBe(true);
    const captured = await page.evaluate(() => ({ status: (window as any).__foLateNotes.status, body: (window as any).__foLateNotes.body, error: (window as any).__foLateNotes.error }));
    expect(captured.error).toBeNull(); expect(captured.status).toBe(200);
    expect(captured.body).toContain('Synthetic private note');
    await expect(page.getByRole('button', { name: 'Mở hồ sơ của Synthetic member', exact: true })).toBeVisible();
    await logout(page);
    const childToken = await login(page, 'child');
    await notes(page);
    await page.evaluate(() => (window as any).__foLateNotes.release());
    await expect.poll(() => page.evaluate(() => (window as any).__foLateNotes.delivered)).toBe(true);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText('Synthetic private note', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Synthetic child note', { exact: true })).toBeVisible();
    expect((await api(page, '/uploads/notes/private.png', childToken)).status).toBe(404);
    expect((await api(page, '/api/notes', memberToken)).status).toBe(401);
  } finally { await page.evaluate(() => (window as any).__foLateNotes?.release()); }
});

test('B06 shopping and offline meal persistence', async ({ page }) => {
  await page.goto('/');
  const token = await login(page, 'admin');
  await page.locator('aside nav').getByRole('button', { name: 'Đi chợ', exact: true }).click();
  const title = 'Synthetic browser shopping ' + test.info().project.name;
  await page.getByPlaceholder('Tên món cần mua (vd: Sữa tươi, Rau cải...)', { exact: true }).fill(title);
  await page.getByPlaceholder('Số lượng (tùy chọn)', { exact: true }).fill('2 packages');
  const added = page.waitForResponse(response => new URL(response.url()).pathname === '/api/shopping' && response.request().method() === 'POST');
  await page.locator('#shopping-add').getByRole('button', { name: 'Thêm', exact: true }).click();
  const addResponse = await added;
  expect(addResponse.status()).toBe(200);
  const item = (await addResponse.json()).item;
  expect(item).toMatchObject({ name: title, quantity: '2 packages', creatorId: 'browser-admin', isPurchased: false });
  const pending = page.locator('#shopping-pending');
  await expect(pending.getByText(title, { exact: false })).toBeVisible();
  const toggled = page.waitForResponse(response => new URL(response.url()).pathname === `/api/shopping/${item.id}/toggle`);
  await pending.getByTitle('Đánh dấu đã mua', { exact: true }).click();
  const toggleResponse = await toggled;
  expect(toggleResponse.status()).toBe(200);
  expect((await toggleResponse.json()).item).toMatchObject({ id: item.id, isPurchased: true, purchasedById: 'browser-admin' });
  const menu = page.locator('#shopping-weekly-menu');
  await menu.getByLabel('Người lớn', { exact: true }).fill('2');
  await menu.getByLabel('Trẻ em', { exact: true }).fill('1');
  await menu.getByLabel('Số ngày', { exact: true }).fill('2');
  const generated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/shopping/meal-plan/random' && response.request().method() === 'POST');
  await menu.getByRole('button', { name: /^(Tạo|Đổi) thực đơn$/ }).click();
  const planResponse = await generated;
  expect(planResponse.status()).toBe(200);
  const plan = await planResponse.json();
  expect(plan.days).toHaveLength(2);
  expect(plan.groceries.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#shopping-module')).toBeVisible();
  const shopping = await api(page, '/api/shopping', token);
  expect(shopping.status).toBe(200);
  expect(JSON.parse(shopping.text).shoppingItems.find((row: any) => row.id === item.id)).toMatchObject({ isPurchased: true, purchasedById: 'browser-admin', quantity: '2 packages' });
  const current = await api(page, '/api/shopping/meal-plan/current', token);
  expect(current.status).toBe(200);
  expect(JSON.parse(current.text).mealPlan).toMatchObject({ adults: 2, children: 1, days: plan.days, groceries: plan.groceries, updatedById: 'browser-admin' });
  await page.getByRole('button', { name: 'Dọn các món đã mua', exact: true }).click();
  const cleared = page.waitForResponse(response => new URL(response.url()).pathname === '/api/shopping/purchased' && response.request().method() === 'DELETE');
  await page.getByRole('button', { name: 'Xóa hết đã mua', exact: true }).click();
  expect((await cleared).status()).toBe(200);
  await expect(page.getByText(title, { exact: false })).toHaveCount(0);
  expect(JSON.parse((await api(page, '/api/shopping', token)).text).shoppingItems.some((row: any) => row.id === item.id)).toBe(false);
});
