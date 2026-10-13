import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { browserCases } from '../../scripts/ci/browser-contract.mjs';
import {assertChildMemberBoundary,exerciseMemberBoundaryFixtures} from './member-boundary';

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
  await expect(page.getByText('Synthetic shared content', { exact: true })).toBeVisible();
  const wasDark = await page.locator('html').evaluate(element => element.classList.contains('dark'));
  await page.getByTitle(wasDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối', { exact: true }).click();
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(!wasDark);
  await page.reload();
  await expect(page.getByText('Synthetic shared note', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic shared content', { exact: true })).toBeVisible();
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
  await menu.getByLabel('Người lớn', { exact: true }).fill('3');
  await menu.getByLabel('Trẻ em', { exact: true }).fill('2');
  await menu.getByLabel('Số ngày', { exact: true }).fill('2');
  const generated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/shopping/meal-plan/random' && response.request().method() === 'POST');
  await menu.getByRole('button', { name: /^(Tạo|Đổi) thực đơn$/ }).click();
  const planResponse = await generated;
  expect(planResponse.status()).toBe(200);
  const plan = await planResponse.json();
  expect(plan.days).toHaveLength(2);
  expect(plan.groceries.length).toBeGreaterThan(0);
  const assertRenderedMenu = async () => {
    await expect(menu.getByLabel('Người lớn', { exact: true })).toHaveValue('3');
    await expect(menu.getByLabel('Trẻ em', { exact: true })).toHaveValue('2');
    await expect(menu.getByLabel('Số ngày', { exact: true })).toHaveValue('2');
    const rows = menu.locator('table tbody tr');
    await expect(rows).toHaveCount(plan.days.length);
    for (const [index, day] of plan.days.entries()) {
      await expect(rows.nth(index)).toBeVisible();
      for (const [column, name] of ['Sáng', 'Trưa', 'Tối'].entries()) {
        const dishes = day.meals.find((meal: any) => meal.meal === name)?.dishes.join(', ') || '—';
        await expect(rows.nth(index).locator('td').nth(column + 1)).toHaveText(dishes);
      }
    }
    for (const grocery of plan.groceries) {
      const button = menu.getByRole('button').filter({ has: page.getByText(grocery.name, { exact: true }) });
      await expect(button).toBeVisible();
      await expect(button.getByText(grocery.quantity, { exact: true })).toBeVisible();
    }
  };
  await assertRenderedMenu();
  await page.reload();
  await expect(page.locator('#shopping-module')).toBeVisible();
  await assertRenderedMenu();
  const shopping = await api(page, '/api/shopping', token);
  expect(shopping.status).toBe(200);
  expect(JSON.parse(shopping.text).shoppingItems.find((row: any) => row.id === item.id)).toMatchObject({ isPurchased: true, purchasedById: 'browser-admin', quantity: '2 packages' });
  const current = await api(page, '/api/shopping/meal-plan/current', token);
  expect(current.status).toBe(200);
  expect(JSON.parse(current.text).mealPlan).toMatchObject({ adults: 3, children: 2, days: plan.days, groceries: plan.groceries, updatedById: 'browser-admin' });
  await page.getByRole('button', { name: 'Dọn các món đã mua', exact: true }).click();
  const cleared = page.waitForResponse(response => new URL(response.url()).pathname === '/api/shopping/purchased' && response.request().method() === 'DELETE');
  await page.getByRole('button', { name: 'Xóa hết đã mua', exact: true }).click();
  expect((await cleared).status()).toBe(200);
  await expect(page.getByText(title, { exact: false })).toHaveCount(0);
  expect(JSON.parse((await api(page, '/api/shopping', token)).text).shoppingItems.some((row: any) => row.id === item.id)).toBe(false);
});

test('B07 legacy finance create edit delete persistence', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00.000Z'));
  await page.goto('/');
  const token = await login(page, 'admin');
  const initial = await api(page, '/api/finance', token);
  expect(initial.status).toBe(200);
  const original = JSON.parse(initial.text).transactions;
  const stable = (records: any[]) => [...records].sort((a, b) => a.id.localeCompare(b.id));
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const expenseBefore = original.filter((row: any) => row.type === 'expense' && row.date.startsWith(today.slice(0, 7))).reduce((sum: number, row: any) => sum + row.amount, 0);
  await page.locator('aside nav').getByRole('button', { name: 'Chi tiêu', exact: true }).click();
  await expect(page.locator('#finance-module')).toBeVisible();
  const expenseSummary = page.locator('#finance-summaries > div').filter({ has: page.getByText('Chi tiêu trong kỳ', { exact: true }) }).locator('h3');
  const expenseText = (value: number) => '-' + value.toLocaleString('vi-VN') + ' VNĐ';
  await expect(expenseSummary).toHaveText(expenseText(expenseBefore));
  const title = 'Synthetic browser expense ' + test.info().project.name;
  await page.getByTitle('Thêm khoản thu chi nhanh', { exact: true }).click();
  const modal = page.locator('#finance-create-modal');
  await expect(modal).toBeVisible();
  await modal.getByPlaceholder('Ví dụ: Đi chợ mua cá lóc, thanh toán hóa đơn điện nước...', { exact: true }).fill(title);
  await modal.getByPlaceholder('Điền số giá trị...', { exact: true }).fill('25000');
  const adding = page.waitForResponse(response => new URL(response.url()).pathname === '/api/finance' && response.request().method() === 'POST');
  await modal.getByRole('button', { name: 'Lưu giao dịch', exact: true }).click();
  const added = await adding;
  expect(added.status()).toBe(200);
  const created = (await added.json()).transaction;
  expect(created).toMatchObject({ description: title, amount: 25000, type: 'expense', category: 'food', account: 'bank', date: today, creatorId: 'browser-admin' });
  expect(typeof created.id).toBe('string');
  await expect(modal).toHaveCount(0);
  const rows = page.locator('#transactions-table > div.divide-y > div');
  const row = rows.filter({ has: page.getByText(title, { exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('-25.000 VNĐ');
  await expect(expenseSummary).toHaveText(expenseText(expenseBefore + 25000));
  await page.reload();
  await expect(page.locator('#finance-module')).toBeVisible();
  await expect(row).toContainText('-25.000 VNĐ');
  await expect(expenseSummary).toHaveText(expenseText(expenseBefore + 25000));
  const persisted = JSON.parse((await api(page, '/api/finance', token)).text).transactions.find((value: any) => value.id === created.id);
  expect(persisted).toEqual(created);
  expect(stable(JSON.parse((await api(page, '/api/finance', token)).text).transactions)).toEqual(stable([...original, created]));
  await row.getByTitle('Sửa giao dịch này', { exact: true }).click();
  await expect(modal).toBeVisible();
  await modal.getByPlaceholder('Điền số giá trị...', { exact: true }).fill('35000');
  const editing = page.waitForResponse(response => new URL(response.url()).pathname === '/api/finance' && response.request().method() === 'POST');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const edited = await editing;
  expect(edited.status()).toBe(200);
  const saved = (await edited.json()).transaction;
  expect(saved).toEqual({ ...created, amount: 35000 });
  await expect(modal).toHaveCount(0);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('-35.000 VNĐ');
  await expect(expenseSummary).toHaveText(expenseText(expenseBefore + 35000));
  await page.reload();
  await expect(row).toContainText('-35.000 VNĐ');
  await expect(expenseSummary).toHaveText(expenseText(expenseBefore + 35000));
  expect(stable(JSON.parse((await api(page, '/api/finance', token)).text).transactions)).toEqual(stable([...original, saved]));
  const deleteRequests: string[] = [];
  page.on('request', request => {
    if (request.method() === 'DELETE' && new URL(request.url()).pathname === '/api/finance/' + created.id) deleteRequests.push(request.url());
  });
  await row.getByTitle('Xóa giao dịch này', { exact: true }).click();
  const confirmation = page.locator('#confirm-dialog').getByRole('dialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText('Xóa bản ghi chi tiêu?', { exact: true })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(row).toContainText('-35.000 VNĐ');
  expect(deleteRequests).toEqual([]);
  expect(stable(JSON.parse((await api(page, '/api/finance', token)).text).transactions)).toEqual(stable([...original, saved]));
  await page.reload();
  await expect(page.locator('#finance-module')).toBeVisible();
  await expect(row).toContainText('-35.000 VNĐ');
  await expect(expenseSummary).toHaveText(expenseText(expenseBefore + 35000));
  expect(stable(JSON.parse((await api(page, '/api/finance', token)).text).transactions)).toEqual(stable([...original, saved]));
  expect(deleteRequests).toEqual([]);
  await row.getByTitle('Xóa giao dịch này', { exact: true }).click();
  const deleting = page.waitForResponse(response => new URL(response.url()).pathname === '/api/finance/' + created.id && response.request().method() === 'DELETE');
  await confirmation.getByRole('button', { name: 'Xóa bản ghi', exact: true }).click();
  expect((await deleting).status()).toBe(200);
  await expect(row).toHaveCount(0);
  await expect(expenseSummary).toHaveText(expenseText(expenseBefore));
  await page.reload();
  await expect(page.locator('#finance-module')).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(expenseSummary).toHaveText(expenseText(expenseBefore));
  const final = JSON.parse((await api(page, '/api/finance', token)).text).transactions;
  expect(stable(final)).toEqual(stable(original));
  expect(deleteRequests).toHaveLength(1);
});

test('B08 adult child approval rewards persistence', async ({ page, browserName }) => {
  await page.goto('/?tab=tasks');
  let adminToken = await login(page, 'admin');
  await expect(page.locator('#tasks-module')).toBeVisible();
  const beforeRewards = JSON.parse((await api(page, '/api/rewards', adminToken)).text);
  const title = 'Synthetic B08 rewarded task ' + browserName;
  const points = 17;
  await page.getByRole('button', { name: 'Thêm công việc', exact: true }).click();
  const modal = page.locator('#task-create-modal');
  await modal.getByPlaceholder('Ví dụ: Đóng tiền rèm cửa, dọn tủ quần áo...').fill(title);
  await modal.getByRole('button', { name: 'Giao việc cho ai', exact: true }).click();
  await page.getByRole('option', { name: 'Synthetic child', exact: true }).click();
  await modal.getByPlaceholder('VD: 5', { exact: true }).fill(String(points));
  const creating = page.waitForResponse(response => new URL(response.url()).pathname === '/api/tasks' && response.request().method() === 'POST');
  await modal.getByRole('button', { name: 'Lên nhiệm vụ', exact: true }).click();
  const createdResponse = await creating;
  expect(createdResponse.status()).toBe(200);
  const created = (await createdResponse.json()).task;
  expect(created).toMatchObject({ title, assigneeId: 'browser-child', rewardPoints: points, status: 'todo' });
  await expect(modal).toHaveCount(0);
  const card = () => page.locator('article').filter({ has: page.getByText(title, { exact: true }) });
  await expect(card()).toHaveCount(1);
  await page.reload();
  await expect(card()).toHaveCount(1);
  expect(JSON.parse((await api(page, '/api/tasks', adminToken)).text).tasks.find((task: any) => task.id === created.id)).toEqual(created);
  await logout(page);
  let childToken = await login(page, 'child');
  await expect(page.locator('#tasks-module')).toBeVisible();
  await expect(card()).toHaveCount(1);
  const starting = page.waitForResponse(response => new URL(response.url()).pathname === '/api/tasks' && response.request().method() === 'POST');
  await card().getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  const startedResponse = await starting;
  expect(startedResponse.status()).toBe(200);
  expect((await startedResponse.json()).task).toMatchObject({ id: created.id, status: 'in_progress', assigneeId: 'browser-child' });
  await card().getByRole('button', { name: 'Con làm xong', exact: true }).click();
  await page.getByPlaceholder('Ví dụ: Con đã dọn xong phòng và xếp gọn đồ chơi ạ.').fill('Synthetic B08 completion proof');
  const submitting = page.waitForResponse(response => new URL(response.url()).pathname === '/api/tasks' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Gửi ba mẹ duyệt', exact: true }).click();
  const submittedResponse = await submitting;
  expect(submittedResponse.status()).toBe(200);
  const submitted = (await submittedResponse.json()).task;
  expect(submitted).toMatchObject({ id: created.id, status: 'in_progress', pendingApproval: true, submittedById: 'browser-child', proofNote: 'Synthetic B08 completion proof', completedAt: null });
  await expect(card().getByText('Đang chờ duyệt', { exact: true })).toBeVisible();
  await expect(card().getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);
  expect(JSON.parse((await api(page, '/api/rewards', childToken)).text).entries.filter((entry: any) => entry.taskId === created.id)).toEqual([]);
  const childApprovalStatus = await page.evaluate(async ({ token, id }) => (await fetch('/api/tasks/' + id + '/approve', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-request-id': crypto.randomUUID() }, body: '{}' })).status, { token: childToken, id: created.id });
  expect(childApprovalStatus).toBe(403);
  expect(JSON.parse((await api(page, '/api/tasks', childToken)).text).tasks.find((task: any) => task.id === created.id)).toEqual(submitted);
  expect(JSON.parse((await api(page, '/api/rewards', childToken)).text).entries.filter((entry: any) => entry.taskId === created.id)).toEqual([]);
  await page.reload();
  await expect(card().getByText('Đang chờ duyệt', { exact: true })).toBeVisible();
  expect(JSON.parse((await api(page, '/api/tasks', childToken)).text).tasks.find((task: any) => task.id === created.id)).toEqual(submitted);
  await logout(page);
  adminToken = await login(page, 'admin');
  await expect(card().getByRole('button', { name: 'Duyệt', exact: true })).toBeVisible();
  expect(JSON.parse((await api(page, '/api/rewards', adminToken)).text)).toEqual(beforeRewards);
  const approving = page.waitForResponse(response => new URL(response.url()).pathname === '/api/tasks/' + created.id + '/approve' && response.request().method() === 'POST');
  await card().getByRole('button', { name: 'Duyệt', exact: true }).click();
  const approvedResponse = await approving;
  expect(approvedResponse.status()).toBe(200);
  const approved = (await approvedResponse.json()).task;
  expect(approved).toMatchObject({ id: created.id, status: 'completed', pendingApproval: false, assigneeId: 'browser-child', rewardPoints: points, proofNote: 'Synthetic B08 completion proof' });
  await expect(card().getByRole('button', { name: 'Mở lại', exact: true })).toBeVisible();
  const rewarded = JSON.parse((await api(page, '/api/rewards', adminToken)).text);
  const grants = rewarded.entries.filter((entry: any) => entry.taskId === created.id);
  expect(grants).toHaveLength(1);
  expect(grants[0]).toMatchObject({ userId: 'browser-child', points });
  expect(rewarded.entries.filter((entry: any) => entry.taskId !== created.id)).toEqual(beforeRewards.entries);
  expect(rewarded.totals['browser-child']).toBe((beforeRewards.totals['browser-child'] || 0) + points);
  const duplicateStatus = await page.evaluate(async ({ token, id }) => (await fetch('/api/tasks/' + id + '/approve', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-request-id': crypto.randomUUID() }, body: '{}' })).status, { token: adminToken, id: created.id });
  expect(duplicateStatus).toBe(400);
  expect(JSON.parse((await api(page, '/api/rewards', adminToken)).text)).toEqual(rewarded);
  await page.reload();
  await expect(card().getByRole('button', { name: 'Mở lại', exact: true })).toBeVisible();
  expect(JSON.parse((await api(page, '/api/tasks', adminToken)).text).tasks.find((task: any) => task.id === created.id)).toEqual(approved);
  expect(JSON.parse((await api(page, '/api/rewards', adminToken)).text)).toEqual(rewarded);
  await logout(page);
  childToken = await login(page, 'child');
  await page.reload();
  await expect(card()).toHaveCount(1);
  expect(JSON.parse((await api(page, '/api/tasks', childToken)).text).tasks.find((task: any) => task.id === created.id)).toEqual(approved);
  expect(JSON.parse((await api(page, '/api/rewards', childToken)).text).entries.filter((entry: any) => entry.taskId === created.id)).toEqual(grants);
});


test('B09 self profile settings persistence', async ({ page, browser, browserName }) => {
  // Isolate document-replacement fixtures in an owned browser process. The
  // application browser continues to exercise all real functional assertions.
  const boundaryBrowser = await browser.browserType().launch();
  try {
    const boundaryContext = await boundaryBrowser.newContext();
    try {
      const boundaryPage = await boundaryContext.newPage();
      await exerciseMemberBoundaryFixtures(boundaryPage);
    } finally { await boundaryContext.close(); }
  } finally { await boundaryBrowser.close(); }
  await page.goto('/');
  const token = await login(page, 'child');
  const users = async () => {
    const response = await api(page, '/api/users', token);
    expect(response.status).toBe(200);
    const rows = JSON.parse(response.text).users;
    expect(rows.every((row: any) => !Object.hasOwn(row, 'passwordHash'))).toBe(true);
    return rows as Record<string, any>[];
  };
  const originalUsers = await users();
  const original = originalUsers.find(row => row.id === 'browser-child')!;
  expect(original).toMatchObject({ id: 'browser-child', username: 'browser-child', role: 'child', fullName: 'Synthetic child' });
  await page.locator('aside nav').getByRole('button', { name: 'Thiết lập', exact: true }).click();
  const settingsTabs = page.locator('#settings-sub-header');
  await expect(settingsTabs).toBeVisible();
  const renderedTabs = await settingsTabs.locator('button').allTextContents();
  expect(renderedTabs.map(text=>text.trim())).toContain('Thành viên và Phân quyền');
  await settingsTabs.getByRole('button', { name: 'Thành viên và Phân quyền', exact: true }).click();
  await expect(page.getByText('Chỉ Gia Trưởng (Admin) mới có quyền tạo thêm tài khoản thành viên gia đình.', { exact: true })).toBeVisible();
  await assertChildMemberBoundary(page.locator('#settings-tab-members'),originalUsers.filter(row=>!row.isDeleted).map(row=>row.fullName));
  const forbidden = await page.evaluate(async token => {
    const response = await fetch('/api/users/browser-child', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'admin' }) });
    return response.status;
  }, token);
  expect(forbidden).toBe(403);
  expect(await users()).toEqual(originalUsers);
  await page.locator('#settings-sub-header').getByRole('button', { name: 'Hồ sơ của tôi', exact: true }).click();
  const profile = page.locator('#settings-tab-profile');
  const name = profile.getByPlaceholder('Ví dụ: Bố Hùng');
  const phone = profile.getByPlaceholder('09xx xxx xxx');
  await expect(name).toHaveValue(original.fullName);
  await name.fill('');
  const submissions: string[] = [];
  const observe = (request: any) => { if (new URL(request.url()).pathname === '/api/profile' && request.method() === 'POST') submissions.push(request.url()); };
  page.on('request', observe);
  await profile.getByRole('button', { name: 'Lưu hồ sơ cá nhân', exact: true }).click();
  await expect(page.getByText('Tên hiển thị không được để trống!', { exact: true })).toBeVisible();
  page.off('request', observe);
  expect(submissions).toEqual([]);
  expect(await users()).toEqual(originalUsers);
  const updatedName = 'Synthetic B09 hồ sơ ' + browserName;
  const updatedPhone = 'synthetic-profile-' + browserName;
  await name.fill(updatedName);
  await phone.fill(updatedPhone);
  const saveProfile = async () => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/profile' && response.request().method() === 'POST');
    await profile.getByRole('button', { name: 'Lưu hồ sơ cá nhân', exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    return (await response.json()).user;
  };
  const updated = await saveProfile();
  expect(updated).toEqual({ ...original, fullName: updatedName, phone: updatedPhone, avatarColor: original.avatarColor || 'bg-indigo-500' });
  await expect(page.getByRole('button', { name: 'Mở hồ sơ của ' + updatedName, exact: true })).toBeVisible();
  expect(await users()).toEqual(originalUsers.map(row => row.id === original.id ? updated : row));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mở hồ sơ của ' + updatedName, exact: true })).toBeVisible();
  await page.locator('aside nav').getByRole('button', { name: 'Thiết lập', exact: true }).click();
  await page.locator('#settings-sub-header').getByRole('button', { name: 'Hồ sơ của tôi', exact: true }).click();
  await expect(name).toHaveValue(updatedName);
  await expect(phone).toHaveValue(updatedPhone);
  expect(await users()).toEqual(originalUsers.map(row => row.id === original.id ? updated : row));
  // Restore the existing account through the same UI so later engines retain their fixture identity.
  await name.fill(original.fullName);
  await phone.fill(original.phone || '');
  const restored = await saveProfile();
  expect(restored).toEqual({ ...original, avatarColor: original.avatarColor || 'bg-indigo-500' });
  await expect(page.getByRole('button', { name: 'Mở hồ sơ của Synthetic child', exact: true })).toBeVisible();
  expect(await users()).toEqual(originalUsers.map(row => row.id === original.id ? restored : row));
  await logout(page);
  const newToken = await login(page, 'child');
  const restoredResponse = await api(page, '/api/users', newToken);
  expect(restoredResponse.status).toBe(200);
  expect(JSON.parse(restoredResponse.text).users).toEqual(originalUsers.map(row => row.id === original.id ? restored : row));
  await page.locator('aside nav').getByRole('button', { name: 'Thiết lập', exact: true }).click();
  await expect(name).toHaveValue(original.fullName);
  await expect(phone).toHaveValue(original.phone || '');
});

test('B10 assistant loading error close', async ({ page }) => {
  await page.goto('/');
  const token = await login(page, 'member');
  const headers = { Authorization: 'Bearer ' + token };
  const snapshot = async () => {
    const rows: Record<string, unknown> = {};
    for (const route of ['/api/tasks', '/api/plans', '/api/notes', '/api/shopping']) {
      const response = await page.request.get(route, { headers });
      expect(response.status(), route).toBe(200);
      rows[route] = await response.json();
    }
    return rows;
  };
  const before = await snapshot();
  const launch = page.getByRole('button', { name: 'AI assistant', exact: true });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: 'Trợ lý AI', exact: true });
  await expect(dialog).toBeVisible();
  const question = dialog.getByPlaceholder('Hỏi: lên menu trưa và thêm đồ đi chợ');
  const send = dialog.locator('button[type="submit"]');
  const voice = dialog.locator('form button[type="button"]');
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const requests: Array<{ method: string; authorization: string | undefined; body: unknown }> = [];
  const handler = async (route: import('@playwright/test').Route) => {
    const request = route.request();
    requests.push({ method: request.method(), authorization: request.headers().authorization, body: request.postDataJSON() });
    await hold;
    await route.continue();
  };
  await page.route('**/api/assistant/chat', handler);
  try {
    await question.fill('   ');
    await send.click();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(requests).toEqual([]);
    await question.fill('Synthetic browser assistant question');
    const responsePending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assistant/chat' && response.request().method() === 'POST');
    await send.click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests).toEqual([{ method: 'POST', authorization: 'Bearer ' + token, body: { message: 'Synthetic browser assistant question' } }]);
    await expect(dialog.getByText('Đang suy nghĩ...', { exact: true })).toBeVisible();
    await expect(send).toBeDisabled();
    await expect(voice).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(launch).toBeFocused();
    release();
    const response = await responsePending;
    expect(response.status()).toBe(400);
    const error = 'Chưa cấu hình Gemini API key. Vào Thiết lập để nhập key.';
    expect(await response.json()).toEqual({ error });
    await launch.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(error, { exact: true })).toBeVisible();
    await expect(dialog.getByText('Đang suy nghĩ...', { exact: true })).not.toBeVisible();
    await expect(question).toHaveValue('');
    await expect(send).toBeEnabled();
    await expect(voice).toBeEnabled();
    expect(requests).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(launch).toBeFocused();
  } finally {
    release();
    await page.unroute('**/api/assistant/chat', handler);
  }
});
