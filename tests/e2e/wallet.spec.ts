import { test as base, expect, type Page } from '@playwright/test';
import { installOfflineNetworkBoundary } from './offline-network-boundary.js';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const seed = JSON.parse(process.env.FO_WALLET_SEED ?? 'null');
const test = base.extend<{
    boundary: void;
}>({ boundary: [async ({ context, page, baseURL }, use) => {
            if (!baseURL || !seed?.synthetic)
                throw Error('Owned synthetic Wallet fixture required');
            const external: string[] = [], errors: string[] = [];
            page.on('pageerror', error => errors.push(error.message));
            await installOfflineNetworkBoundary(context, baseURL, external);
            await context.addInitScript(() => localStorage.setItem('family_lang', 'vi'));
            await use();
            expect(external).toEqual([]);
            expect(errors).toEqual([]);
        }, { auto: true }] });
async function login(page: Page, key = 'member') {
    const response = await page.request.post('/api/auth/login', { data: { username: 'wallet-browser-' + key, password: 'synthetic-browser-password' }, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.user.id).toBe('wallet-browser-' + key);
    const origin = new URL(response.url()).origin;
    await page.context().setStorageState({ cookies: [], origins: [{ origin, localStorage: [{ name: 'family_token', value: body.token }, { name: 'family_lang', value: 'vi' }] }] });
    await page.goto('/?tab=finance');
    await expect(page.getByTestId('wallet-workspace').getByRole('heading', { name: 'Tài khoản', exact: true })).toBeVisible();
}
async function request(page: Page, path: string, method = 'GET', body?: unknown) {
    return page.evaluate(async ({ path, method, body }) => {
        const response = await fetch('/api/wallet/' + path, { method, headers: { Authorization: 'Bearer ' + localStorage.getItem('family_token'), 'Content-Type': 'application/json', 'x-request-id': crypto.randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, body: await response.json() };
    }, { path, method, body });
}
const panel = (page: Page) => page.getByTestId('wallet-workspace');
test('W06 exact balances, credit availability, scoped accounts and existing Finance remain visible', async ({ page }) => {
    await login(page);
    await expect(panel(page).getByRole('button', { name: /SYNTHETIC_PRIVATE_WALLET_ACCOUNT/ })).toHaveCount(0);
    await panel(page).getByRole('button', { name: /Synthetic exact balance/ }).click();
    await expect(page.getByTestId('wallet-book')).toHaveText(/9\.007\.199\.254\.740\.993/);
    await panel(page).getByRole('button', { name: /Synthetic credit balance/ }).click();
    const detail = panel(page).getByRole('region', { name: 'Chi tiết tài khoản' });
    await expect(detail.getByText('800.000 ₫', { exact: true })).toBeVisible();
    await panel(page).getByRole('button', { name: /Synthetic read-only account/ }).click();
    await expect(panel(page).getByRole('button', { name: 'Sửa', exact: true })).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Lưu trữ', exact: true })).toHaveCount(0);
    await expect(page.getByText('Synthetic existing Finance', { exact: true })).toBeVisible();
    for (const theme of ['dark', 'light']) {
        await page.getByTitle(theme === 'dark' ? 'Chuyển sang Giao diện Tối' : 'Chuyển sang Giao diện Sáng', { exact: true }).click();
        const colors = await panel(page).evaluate(node => ({ background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node.querySelector('h2')!).color }));
        expect(colors.background).not.toBe(colors.color);
        await page.screenshot({ path: `reports/wallet/${process.env.FO_WALLET_PROJECT}/accounts-${theme}.png` });
    }
});
test.beforeAll(async({browser,browserName})=>{
 const executable=browser.browserType().executablePath();
 fs.writeFileSync(`reports/wallet/${process.env.FO_WALLET_PROJECT}/runtime.json`,JSON.stringify({browserName,browserVersion:browser.version(),executableSha256:createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),platform:process.platform,nodeVersion:process.version,architecture:process.arch},null,2)+'\n');
});
test('W06 create form validates exact money and retains the same command across lost acknowledgement and navigation', async ({ page }) => {
    await login(page);
    const bodies: Array<{
        id: string | null;
        body: any;
    }> = [];
    await page.route('**/api/wallet/accounts', async (route) => {
        if (route.request().method() !== 'POST')
            return route.continue();
        bodies.push({ id: route.request().headers()['x-request-id'] ?? null, body: route.request().postDataJSON() });
        if (bodies.length === 1) {
            const committed = await route.fetch();
            expect(committed.status()).toBe(200);
            await route.abort('connectionreset');
        }
        else
            await route.continue();
    });
    await panel(page).getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Tạo tài khoản', exact: true });
    await dialog.getByLabel('Tên tài khoản', { exact: true }).fill('Synthetic replay exact');
    await dialog.getByLabel('Số dư ban đầu', { exact: true }).fill('1,00');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Kiểm tra');
    expect(bodies).toHaveLength(0);
    await dialog.getByLabel('Số dư ban đầu', { exact: true }).fill('9.007.199.254.740.993');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Chưa xác nhận');
    await expect(dialog.getByLabel('Số dư ban đầu', { exact: true })).toHaveValue('9.007.199.254.740.993');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(panel(page).getByRole('alert')).toContainText('Chưa xác nhận');
    await expect(panel(page).getByRole('button', { name: 'Tạo tài khoản', exact: true })).toBeDisabled();
    // A tab unmount must not discard the unresolved financial request.
    await page.locator('aside nav').getByRole('button', { name: 'Nhóm Task', exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
    await page.locator('aside nav').getByRole('button', { name: 'Chi tiêu', exact: true }).click();
    await expect(panel(page).getByRole('alert')).toContainText('Chưa xác nhận');
    await panel(page).getByRole('button', { name: 'Xem dữ liệu nhập', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Tạo tài khoản', exact: true });
    await expect(dialog.getByRole('alert')).toContainText('Chưa xác nhận');
    await expect(dialog.getByLabel('Số dư ban đầu', { exact: true })).toHaveValue('9.007.199.254.740.993');
    await dialog.getByRole('button', { name: 'Thử lại cùng yêu cầu', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    const listed = await request(page, 'accounts');
    expect(listed.status).toBe(200);
    const saved = listed.body.accounts.filter((a: any) => a.name === 'Synthetic replay exact');
    expect(saved).toHaveLength(1);
    expect(saved[0].openingMinor).toBe('9007199254740993');
});
test('W06 stale revision keeps draft and requires explicit reload before editing again', async ({ page }) => {
    await login(page);
    const created = await request(page, 'accounts', 'POST', { expectedRevision: 0, input: { name: 'Synthetic conflict original', type: 'cash', currency: 'VND', openingMinor: '100', openingDate: '2026-10-17', accessMode: 'private' } });
    expect(created.status).toBe(200);
    await panel(page).getByRole('button', { name: 'Tải lại tài khoản', exact: true }).click();
    await panel(page).getByRole('button', { name: /Synthetic conflict original/ }).click();
    await panel(page).getByRole('button', { name: 'Sửa', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sửa tài khoản', exact: true });
    await dialog.getByLabel('Tên tài khoản', { exact: true }).fill('Synthetic retained draft');
    const other = await request(page, 'accounts/' + created.body.account.id, 'PATCH', { expectedRevision: 1, patch: { name: 'Synthetic concurrent edit' } });
    expect(other.status).toBe(200);
    await expect(dialog.getByLabel('Tên tài khoản', { exact: true })).toHaveValue('Synthetic retained draft');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Tài khoản đã thay đổi');
    await expect(dialog.getByLabel('Tên tài khoản', { exact: true })).toHaveValue('Synthetic retained draft');
    await dialog.getByRole('button', { name: 'Nạp bản hiện tại (thay dữ liệu nhập)', exact: true }).click();
    await expect(dialog.getByLabel('Tên tài khoản', { exact: true })).toHaveValue('Synthetic concurrent edit');
    await dialog.getByLabel('Tên tài khoản', { exact: true }).fill('Synthetic resolved edit');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await request(page, 'accounts/' + created.body.account.id)).body.account).toMatchObject({ name: 'Synthetic resolved edit', revision: 3 });
});
test('W06 archive requires confirmation and retains account history', async ({ page }) => {
    await login(page);
    const created = await request(page, 'accounts', 'POST', { expectedRevision: 0, input: { name: 'Synthetic archive target', type: 'cash', currency: 'VND', openingMinor: '123', openingDate: '2026-10-17', accessMode: 'private' } });
    expect(created.status).toBe(200);
    await panel(page).getByRole('button', { name: 'Tải lại tài khoản', exact: true }).click();
    await panel(page).getByRole('button', { name: /Synthetic archive target/ }).click();
    await panel(page).getByRole('button', { name: 'Lưu trữ', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Lưu trữ', exact: true });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
    expect((await request(page, 'accounts/' + created.body.account.id)).body.account.archivedAt).toBeNull();
    await panel(page).getByRole('button', { name: 'Lưu trữ', exact: true }).click();
    await page.getByRole('dialog', { name: 'Lưu trữ', exact: true }).getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(panel(page).getByRole('button', { name: /Synthetic archive target.*Đã lưu trữ/ })).toBeVisible();
    const detail = await request(page, 'accounts/' + created.body.account.id);
    expect(detail.body.account.archivedAt).not.toBeNull();
    expect(detail.body.account.openingMinor).toBe('123');
    await panel(page).getByRole('button', { name: 'Khôi phục tài khoản', exact: true }).click();
    await page.getByRole('dialog', { name: 'Khôi phục tài khoản', exact: true }).getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(panel(page).getByRole('button', { name: /Synthetic archive target.*Đã lưu trữ/ })).toHaveCount(0);
    expect((await request(page, 'accounts/' + created.body.account.id)).body.account).toMatchObject({ archivedAt: null, revision: 3, openingMinor: '123' });
});
test('W06 phone form keyboard focus, native date and custom selectors remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await panel(page).getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Tạo tài khoản', exact: true });
    await expect(dialog.getByLabel('Tên tài khoản', { exact: true })).toBeFocused();
    await dialog.getByLabel('Tên tài khoản', { exact: true }).fill('Synthetic mobile');
    await dialog.getByRole('button', { name: 'Tiền tệ', exact: true }).click();
    await page.getByRole('option', { name: 'USD', exact: true }).click();
    await dialog.getByLabel('Số dư ban đầu', { exact: true }).fill('-0,01');
    await dialog.getByLabel('Ngày số dư ban đầu', { exact: true }).fill('2026-10-17');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Tên tài khoản', { exact: true })).toBeFocused();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: `reports/wallet/${process.env.FO_WALLET_PROJECT}/account-phone.png` });
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const listed = await request(page, 'accounts');
    expect(listed.body.accounts.find((a: any) => a.name === 'Synthetic mobile')).toMatchObject({ currency: 'USD', openingMinor: '-1' });
});
test('W04 grant revocation removes a live edit form and financial details through the real SSE path',async({page})=>{
 await login(page);
 const loginOther=await page.request.post('/api/auth/login',{data:{username:'wallet-browser-other',password:'synthetic-browser-password'},maxRedirects:0});expect(loginOther.status()).toBe(200);const other=await loginOther.json();
 const commandOther=async(path:string,method:string,data:unknown)=>page.request.fetch('/api/wallet/'+path,{method,headers:{Authorization:'Bearer '+other.token,'x-request-id':crypto.randomUUID()},data,maxRedirects:0});
 const created=await commandOther('accounts','POST',{expectedRevision:0,input:{name:'Synthetic revocable account',type:'cash',currency:'VND',openingMinor:'345678',openingDate:'2026-10-17',accessMode:'private'}});expect(created.status()).toBe(200);const account=(await created.json()).account;
 const grant=await commandOther('accounts/'+account.id+'/grants/wallet-browser-member','PUT',{expectedRevision:1,permission:'manage'});expect(grant.status()).toBe(200);
 await panel(page).getByRole('button',{name:'Tải lại tài khoản',exact:true}).click();await panel(page).getByRole('button',{name:/Synthetic revocable account/}).click();await panel(page).getByRole('button',{name:'Sửa',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sửa tài khoản',exact:true});await expect(dialog.getByLabel('Tên tài khoản',{exact:true})).toHaveValue('Synthetic revocable account');
 const revoke=await commandOther('accounts/'+account.id+'/grants/wallet-browser-member','DELETE',{expectedRevision:2});expect(revoke.status()).toBe(200);await expect(dialog).toHaveCount(0);await expect(panel(page).getByRole('button',{name:/Synthetic revocable account/})).toHaveCount(0);expect((await request(page,'accounts/'+account.id)).status).toBe(404);
});
test('W04 a real cross-tab logout retires the session-owned financial draft',async({page,context})=>{
 await login(page);await panel(page).getByRole('button',{name:'Tạo tài khoản',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Tạo tài khoản',exact:true});await dialog.getByLabel('Tên tài khoản',{exact:true}).fill('SYNTHETIC_SESSION_PRIVATE_DRAFT');await dialog.getByLabel('Số dư ban đầu',{exact:true}).fill('987.654');
 const sibling=await context.newPage();try{await sibling.goto('/api/ready');await sibling.evaluate(()=>localStorage.removeItem('family_token'));await expect(page.getByPlaceholder('Nhập tên đăng nhập gia đình...')).toBeVisible();await expect(page.getByTestId('wallet-workspace')).toHaveCount(0);await expect(page.locator('input[value="SYNTHETIC_SESSION_PRIVATE_DRAFT"]')).toHaveCount(0);}finally{await sibling.close();}
});
