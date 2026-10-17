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
const records=(page:Page)=>page.getByTestId('wallet-records');
async function recordsTab(page:Page){await page.getByTestId('wallet-home').getByRole('button',{name:'Ghi chép',exact:true}).click();await expect(records(page).getByRole('button',{name:'Tạo ghi chép',exact:true})).toBeEnabled();}
async function chooseRecord(page:Page,label:string,name:string){const dialog=page.getByRole('dialog',{name:/^(Tạo|Sửa) ghi chép$/});await expect(page.getByRole('listbox')).toHaveCount(0);await dialog.getByRole('button',{name:label,exact:true}).click();await page.getByRole('option',{name,exact:true}).click();await expect(page.getByRole('listbox')).toHaveCount(0);}
async function accountForRecord(page:Page,name:string,currency='VND',openingMinor='0'){
 const created=await request(page,'accounts','POST',{expectedRevision:0,input:{name,type:'cash',currency,openingMinor,openingDate:'2026-10-17',accessMode:'private'}});expect(created.status).toBe(200);return created.body.account;
}
test('W05 record income and expense use exact balances and save-and-add only clears after success',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic UI record cash','VND','1000');await recordsTab(page);await records(page).getByRole('button',{name:'Tạo ghi chép',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Tạo ghi chép',exact:true});await chooseRecord(page,'Tài khoản ghi chép',account.name+' · VND');await dialog.getByLabel('Số tiền',{exact:true}).fill('123');await dialog.getByLabel('Thời điểm giao dịch (có thể để trống)',{exact:true}).fill('2026-10-17T10:04:05.006');await dialog.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC_UI_EXPENSE');await dialog.getByRole('button',{name:'Lưu và tạo tiếp',exact:true}).click();await expect(dialog.getByLabel('Số tiền',{exact:true})).toHaveValue('');await expect(dialog.getByLabel('Ghi chú',{exact:true})).toHaveValue('');
 await chooseRecord(page,'Loại ghi chép','Thu nhập');await chooseRecord(page,'Tài khoản ghi chép',account.name+' · VND');await dialog.getByLabel('Số tiền',{exact:true}).fill('200');await dialog.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC_UI_INCOME');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await expect(dialog).toHaveCount(0);const balance=await request(page,'accounts/'+account.id+'/balance?date=2026-10-31');expect(balance.body.book.minor).toBe('1077');await expect(records(page).getByRole('button',{name:/SYNTHETIC_UI_INCOME/})).toBeVisible();const expense=await request(page,'records/query','POST',{filter:{period:{fromDate:'2026-10-01',toDateExclusive:'2026-11-01',timezone:'Asia/Ho_Chi_Minh'},referenceCurrency:'VND',query:'SYNTHETIC_UI_EXPENSE'}});expect(expense.status).toBe(200);expect(expense.body.items[0].metadata.occurredAt).toBe('2026-10-17T03:04:05.006Z');
});
test('W05 cross-currency transfer and separate fee are one confirmed intent; parent void reverses both',async({page})=>{
 await login(page);const usd=await accountForRecord(page,'Synthetic UI transfer USD','USD'),vnd=await accountForRecord(page,'Synthetic UI transfer VND');await recordsTab(page);await records(page).getByRole('button',{name:'Tạo ghi chép',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Tạo ghi chép',exact:true});await chooseRecord(page,'Loại ghi chép','Chuyển khoản');await chooseRecord(page,'Tài khoản nguồn',usd.name+' · USD');await chooseRecord(page,'Tài khoản đích',vnd.name+' · VND');await dialog.getByLabel('Số tiền nguồn',{exact:true}).fill('100,00');await dialog.getByLabel('Số tiền đích',{exact:true}).fill('2.500.000');await dialog.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC_UI_FX_TRANSFER');await dialog.getByLabel('Có phí chuyển khoản',{exact:true}).check();await chooseRecord(page,'Tài khoản trả phí',vnd.name+' · VND');await dialog.getByLabel('Số tiền phí',{exact:true}).fill('10.000');await dialog.getByLabel('Ghi chú phí',{exact:true}).fill('SYNTHETIC_UI_FX_FEE');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect((await request(page,'accounts/'+usd.id+'/balance?date=2026-10-31')).body.book.minor).toBe('-10000');expect((await request(page,'accounts/'+vnd.id+'/balance?date=2026-10-31')).body.book.minor).toBe('2490000');const detail=records(page).getByRole('region',{name:'Chi tiết ghi chép',exact:true});await expect(detail).toContainText('25000/1');await records(page).getByRole('button',{name:/SYNTHETIC_UI_FX_FEE/}).click();await expect(detail.getByRole('button',{name:'Mở chuyển khoản gốc',exact:true})).toBeVisible();await expect(detail.getByRole('button',{name:'Sửa ghi chép',exact:true})).toHaveCount(0);await expect(detail.getByRole('button',{name:'Hủy ghi chép',exact:true})).toHaveCount(0);await detail.getByRole('button',{name:'Mở chuyển khoản gốc',exact:true}).click();await expect(detail).toContainText('25000/1');await detail.getByRole('button',{name:'Hủy ghi chép',exact:true}).click();await page.getByRole('dialog',{name:'Hủy ghi chép',exact:true}).getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(detail).toContainText('Đã hủy');expect((await request(page,'accounts/'+usd.id+'/balance?date=2026-10-31')).body.book.minor).toBe('0');expect((await request(page,'accounts/'+vnd.id+'/balance?date=2026-10-31')).body.book.minor).toBe('0');
});
test('W06 scoped filters recover explicitly from a missing valuation rate',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic UI filter cash');const saved=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',accountId:account.id,money:{minor:'123',currency:'VND'},note:'SYNTHETIC_UI_FILTER_TARGET'}});expect(saved.status).toBe(200);await recordsTab(page);await records(page).getByText('Bộ lọc ghi chép',{exact:true}).click();await records(page).getByLabel('Tìm kiếm ghi chép',{exact:true}).fill('SYNTHETIC_UI_FILTER_TARGET');await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('heading',{name:'Ghi chép (1)',exact:true})).toBeVisible();await records(page).getByLabel(account.name,{exact:true}).check();await records(page).getByLabel(account.name,{exact:true}).uncheck();await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('heading',{name:'Ghi chép (1)',exact:true})).toBeVisible();
 await records(page).getByRole('button',{name:'Tiền tệ tham chiếu',exact:true}).click();await page.getByRole('option',{name:'USD',exact:true}).click();await records(page).getByLabel('Số tiền tuyệt đối từ',{exact:true}).fill('1,00');await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('alert')).toContainText('Thiếu tỷ giá');await records(page).getByRole('button',{name:'Khôi phục bộ lọc mặc định',exact:true}).click();await expect(records(page).getByRole('button',{name:'Tạo ghi chép',exact:true})).toBeEnabled();
});
test('W05 record edit retains conflict draft and replays the same note-only write after a lost acknowledgement',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic UI conflict cash');const created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'123',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_UI_EDIT_ORIGINAL'}});expect(created.status).toBe(200);const id=created.body.record.id;await recordsTab(page);await records(page).getByRole('button',{name:/SYNTHETIC_UI_EDIT_ORIGINAL/}).click();await records(page).getByRole('button',{name:'Sửa ghi chép',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sửa ghi chép',exact:true});await dialog.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC_UI_EDIT_DRAFT');const remote=await request(page,'records/'+id,'PATCH',{expectedRevision:1,patch:{note:'SYNTHETIC_UI_EDIT_REMOTE'}});expect(remote.status).toBe(200);await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Ghi chép đã thay đổi');await expect(dialog.getByLabel('Ghi chú',{exact:true})).toHaveValue('SYNTHETIC_UI_EDIT_DRAFT');await dialog.getByRole('button',{name:'Nạp bản hiện tại (thay dữ liệu nhập)',exact:true}).click();await expect(dialog.getByLabel('Ghi chú',{exact:true})).toHaveValue('SYNTHETIC_UI_EDIT_REMOTE');
 const calls:Array<{id:string;body:unknown}>=[];await page.route('**/api/wallet/records/'+id,async route=>{if(route.request().method()!=='PATCH')return route.continue();calls.push({id:route.request().headers()['x-request-id'],body:route.request().postDataJSON()});if(calls.length===1){const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('connectionreset');}else await route.continue();});await dialog.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC_UI_EDIT_CONFIRMED');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Chưa xác nhận');await dialog.getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true}).click();await expect(dialog).toHaveCount(0);expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);const saved=await request(page,'records/'+id);expect(saved.body.record).toMatchObject({revision:3,note:'SYNTHETIC_UI_EDIT_CONFIRMED'});expect(saved.body.metadata.occurredAt).toBeNull();expect(saved.body.postings[0].deltaMinor).toBe('-123');
});
test('W05 stale void confirmation shows inline failure without silently voiding a changed record',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic UI void conflict cash');const created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'123',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_UI_VOID_STALE'}});expect(created.status).toBe(200);const id=created.body.record.id;await recordsTab(page);await records(page).getByRole('button',{name:/SYNTHETIC_UI_VOID_STALE/}).click();const detail=records(page).getByRole('region',{name:'Chi tiết ghi chép',exact:true});await detail.getByRole('button',{name:'Hủy ghi chép',exact:true}).click();const confirm=page.getByRole('dialog',{name:'Hủy ghi chép',exact:true});await expect(confirm).toBeVisible();expect((await request(page,'records/'+id,'PATCH',{expectedRevision:1,patch:{note:'SYNTHETIC_UI_VOID_CHANGED'}})).status).toBe(200);await confirm.getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(records(page).getByRole('alert')).toContainText('Không thực hiện được thao tác');expect((await request(page,'records/'+id)).body.record.settlementStatus).toBe('cleared');await records(page).getByRole('button',{name:'Tải lại ghi chép',exact:true}).click();await detail.getByRole('button',{name:'Hủy ghi chép',exact:true}).click();await page.getByRole('dialog',{name:'Hủy ghi chép',exact:true}).getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(detail).toContainText('Đã hủy');
});

test('W04 private receipt PDF/image attach, verified download and confirmed detach keep record money',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic receipt UI account');const created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'123',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_UI_RECEIPT_RECORD'}});expect(created.status).toBe(200);const id=created.body.record.id;
 await recordsTab(page);await records(page).getByRole('button',{name:/SYNTHETIC_UI_RECEIPT_RECORD/}).click();const receipts=records(page).getByRole('region',{name:'Hóa đơn',exact:true}),pdf=Buffer.from('%PDF-1.4\nSynthetic offline receipt\n%%EOF');
 await receipts.getByLabel('Đính kèm hóa đơn',{exact:true}).setInputFiles({name:'Hóa đơn synthetic.pdf',mimeType:'application/pdf',buffer:pdf});await expect(receipts.getByText('Hóa đơn synthetic.pdf',{exact:true})).toBeVisible();
 const list=await request(page,'records/'+id+'/receipts');expect(list.status).toBe(200);expect(list.body.revision).toBe(2);expect(list.body.receipts).toHaveLength(1);expect(list.body.receipts[0].sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
 const downloading=page.waitForEvent('download');await receipts.getByRole('button',{name:'Tải hóa đơn Hóa đơn synthetic.pdf',exact:true}).click();const downloaded=await downloading;expect(downloaded.suggestedFilename()).toBe('Hóa đơn synthetic.pdf');const file=await downloaded.path();expect(file).toBeTruthy();expect(fs.readFileSync(file!)).toEqual(pdf);
 const denied=await page.evaluate(async key=>{const response=await fetch('/uploads/wallet-receipts/'+key,{headers:{Authorization:'Bearer '+localStorage.getItem('family_token')}});return response.status;},list.body.receipts[0].fileKey);expect(denied).toBe(404);
 await receipts.getByRole('button',{name:'Gỡ hóa đơn Hóa đơn synthetic.pdf',exact:true}).click();await page.getByRole('dialog',{name:'Gỡ hóa đơn',exact:true}).getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(receipts.getByText('Chưa có hóa đơn.',{exact:true})).toBeVisible();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=','base64');await receipts.getByLabel('Đính kèm hóa đơn',{exact:true}).setInputFiles({name:'Synthetic optimized.png',mimeType:'image/png',buffer:png});await expect(receipts.getByText('Synthetic optimized.webp',{exact:true})).toBeVisible();
 const image=await request(page,'records/'+id+'/receipts');expect(image.body.receipts).toHaveLength(1);expect(image.body.receipts[0].mime).toBe('image/webp');expect(image.body.revision).toBe(4);expect((await request(page,'accounts/'+account.id+'/balance?date=2026-10-31')).body.book.minor).toBe('-123');
});
test('W04 an unknown receipt upload survives tab navigation and retries the same committed intent',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic receipt retry account'),created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'50',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_UI_RECEIPT_RETRY'}});expect(created.status).toBe(200);const id=created.body.record.id;await recordsTab(page);await records(page).getByRole('button',{name:/SYNTHETIC_UI_RECEIPT_RETRY/}).click();
 let first=true;const intents:{nonce:string|undefined;body:string|null}[]=[];
 await page.route('**/api/wallet/records/'+id+'/receipts',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}intents.push({nonce:route.request().headers()['x-request-id'],body:route.request().postData()});if(first){first=false;const committed=await route.fetch();expect(committed.status()).toBe(200);await route.abort('failed');}else await route.continue();});
 await records(page).getByLabel('Đính kèm hóa đơn',{exact:true}).setInputFiles({name:'Synthetic retry.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSynthetic retry')});await expect(records(page).getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true})).toBeVisible();
 await page.getByTestId('wallet-home').getByRole('button',{name:'Tài khoản',exact:true}).click();await page.getByTestId('wallet-home').getByRole('button',{name:'Ghi chép',exact:true}).click();await expect(records(page).getByRole('button',{name:'Tạo ghi chép',exact:true})).toBeDisabled();await expect(records(page).getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true})).toBeEnabled();await records(page).getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true}).click();await expect(records(page).getByText('Synthetic retry.pdf',{exact:true})).toBeVisible();expect(intents).toHaveLength(2);expect(intents[1]).toEqual(intents[0]);const list=await request(page,'records/'+id+'/receipts');expect(list.body.receipts).toHaveLength(1);expect(list.body.revision).toBe(2);expect((await request(page,'accounts/'+account.id+'/balance?date=2026-10-31')).body.book.minor).toBe('-50');
});

test('W06 combined scoped facets, label any/all and clearing the final choice use one shared filter',async({page})=>{
 await login(page);const cash=await accountForRecord(page,'Synthetic facet VND'),usd=await accountForRecord(page,'Synthetic facet USD','USD');
 for(const [note,kind,account,money,status,paymentMethod,labelIds]of [
  ['SYNTHETIC_FACET_TARGET','expense',cash,{minor:'100',currency:'VND'},'cleared','Synthetic cash facet',['synthetic-filter-label-a','synthetic-filter-label-b']],
  ['SYNTHETIC_FACET_OTHER','expense',usd,{minor:'100',currency:'USD'},'uncleared','Synthetic card facet',['synthetic-filter-label-a']],
  ['SYNTHETIC_FACET_INCOME','income',cash,{minor:'100',currency:'VND'},'cleared','Synthetic cash facet',['synthetic-filter-label-b']],
 ]as const){expect((await request(page,'records','POST',{expectedRevision:0,input:{kind,accountId:account.id,money,effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note,settlementStatus:status,paymentMethod,labelIds}})).status).toBe(200);}
 await recordsTab(page);await records(page).getByText('Bộ lọc ghi chép',{exact:true}).click();await records(page).getByLabel('Tìm kiếm ghi chép',{exact:true}).fill('SYNTHETIC_FACET_');
 await records(page).getByRole('group',{name:'Loại ghi chép lọc',exact:true}).getByLabel('Chi tiêu',{exact:true}).check();const statuses=records(page).getByRole('group',{name:'Trạng thái lọc',exact:true});await statuses.getByLabel('Đã thanh toán',{exact:true}).uncheck();await statuses.getByLabel('Đã đối soát',{exact:true}).uncheck();await statuses.getByLabel('Chưa thanh toán',{exact:true}).check();
 const currencies=records(page).getByRole('group',{name:'Tiền tệ lọc',exact:true});await currencies.getByLabel('USD',{exact:true}).check();await records(page).getByRole('group',{name:'Người tạo lọc',exact:true}).getByLabel('Synthetic wallet member',{exact:true}).check();await records(page).getByRole('group',{name:'Phương thức thanh toán lọc',exact:true}).getByLabel('Synthetic card facet',{exact:true}).check();await records(page).getByLabel('Synthetic filter label A',{exact:true}).check();
 const submitted=page.waitForRequest(r=>r.url().endsWith('/api/wallet/records/query')&&r.method()==='POST'&&r.postDataJSON()?.filter?.paymentMethods?.includes('Synthetic card facet'));await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();const filter=(await submitted).postDataJSON().filter;expect(filter).toMatchObject({query:'SYNTHETIC_FACET_',kinds:['expense'],statuses:['uncleared'],currencies:['USD'],creatorIds:['wallet-browser-member'],paymentMethods:['Synthetic card facet'],labelIds:['synthetic-filter-label-a']});await expect(records(page).getByRole('heading',{name:'Ghi chép (1)',exact:true})).toBeVisible();await expect(records(page).getByRole('button',{name:/SYNTHETIC_FACET_OTHER/})).toBeVisible();
 await records(page).getByLabel('Synthetic filter label B',{exact:true}).check();await records(page).getByRole('button',{name:'Điều kiện nhãn',exact:true}).click();await page.getByRole('option',{name:'Tất cả nhãn đã chọn',exact:true}).click();await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('heading',{name:'Ghi chép (0)',exact:true})).toBeVisible();
 await records(page).getByRole('button',{name:'Điều kiện nhãn',exact:true}).click();await page.getByRole('option',{name:'Bất kỳ nhãn nào',exact:true}).click();await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('heading',{name:'Ghi chép (1)',exact:true})).toBeVisible();await currencies.getByLabel('USD',{exact:true}).uncheck();
 const cleared=page.waitForRequest(r=>r.url().endsWith('/api/wallet/records/query')&&r.method()==='POST'&&r.postDataJSON()?.filter?.paymentMethods?.includes('Synthetic card facet'));await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();expect((await cleared).postDataJSON().filter).not.toHaveProperty('currencies');await expect(records(page).getByRole('heading',{name:'Ghi chép (1)',exact:true})).toBeVisible();
 await records(page).getByRole('button',{name:'Khôi phục bộ lọc mặc định',exact:true}).click();await expect(records(page).getByRole('button',{name:/SYNTHETIC_FACET_TARGET/})).toBeVisible();await expect(records(page).getByRole('button',{name:/SYNTHETIC_FACET_INCOME/})).toBeVisible();await page.setViewportSize({width:390,height:844});expect(await records(page).evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await records(page).getByLabel('Tìm kiếm ghi chép',{exact:true}).focus();await page.keyboard.press('Tab');await expect(records(page).getByRole('button',{name:"Chuyển khoản trong bộ lọc",exact:true})).toBeFocused();
});
async function bulkScope(page:Page,query:string){
 await records(page).getByText('Bộ lọc ghi chép',{exact:true}).click();await records(page).getByLabel('Tìm kiếm ghi chép',{exact:true}).fill(query);await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('button',{name:'Tạo ghi chép',exact:true})).toBeEnabled();
}
async function bulkNote(page:Page,note:string){const bulk=page.getByTestId('wallet-bulk');await bulk.getByLabel('Đổi ghi chú',{exact:true}).check();await bulk.getByLabel('Ghi chú',{exact:true}).fill(note);await expect(bulk.getByLabel('Ghi chú',{exact:true})).toHaveValue(note);await bulk.getByRole('button',{name:'Xem trước cập nhật',exact:true}).click();await expect(bulk.getByRole('button',{name:'Xác nhận cập nhật',exact:true})).toBeEnabled();}
test('W06 loaded checked rows and a cross-page captured scope remain distinct; later records stay excluded from atomic metadata bulk',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic bulk scope account'),ids:string[]=[];
 for(let index=0;index<51;index++){const created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'100',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_BULK_SCOPE_'+index}});expect(created.status).toBe(200);ids.push(created.body.record.id);}
 await recordsTab(page);await bulkScope(page,'SYNTHETIC_BULK_SCOPE_');await expect(records(page).getByRole('heading',{name:'Ghi chép (51)',exact:true})).toBeVisible();await records(page).getByRole('button',{name:'Tải thêm',exact:true}).click();
 const bulk=page.getByTestId('wallet-bulk');for(const id of ids.slice(0,2))await records(page).getByRole('checkbox',{name:'Chọn giao dịch '+id,exact:true}).check();await expect(bulk).toContainText('Dòng đã tải được tích chọn: 2');await bulk.getByRole('button',{name:'Bỏ vùng chọn',exact:true}).click();await bulk.getByRole('button',{name:'Chọn toàn bộ 51 giao dịch phù hợp',exact:true}).click();await expect(bulk).toContainText('Giao dịch trong vùng đã chụp được chọn: 51');
 const late=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'100',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_BULK_SCOPE_LATE'}});expect(late.status).toBe(200);await expect(records(page).getByRole('heading',{name:'Ghi chép (52)',exact:true})).toBeVisible();await records(page).getByRole('button',{name:'Tải thêm',exact:true}).click();await expect(records(page).getByRole('checkbox',{name:'Chọn giao dịch '+late.body.record.id,exact:true})).not.toBeChecked();for(const id of ids.slice(0,2))await expect(records(page).getByRole('checkbox',{name:'Chọn giao dịch '+id,exact:true})).toBeChecked();
 const before=await request(page,'accounts/'+account.id+'/balance?date=2026-10-31');expect(before.status).toBe(200);await bulkNote(page,'SYNTHETIC_BULK_CONFIRMED');await expect(bulk).toContainText('Phạm vi: 51; thay đổi: 51; giữ nguyên: 0.');
 await page.setViewportSize({width:390,height:844});for(const theme of ['dark','light']){await page.getByTitle(theme==='dark'?'Chuyển sang Giao diện Tối':'Chuyển sang Giao diện Sáng',{exact:true}).click();const colors=await bulk.evaluate(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node.querySelector('h3')!).color}));expect(colors.background).not.toBe(colors.color);expect(await bulk.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await bulk.screenshot({path:`reports/wallet/${process.env.FO_WALLET_PROJECT}/bulk-${theme}.png`});}
 const apply=bulk.getByRole('button',{name:'Xác nhận cập nhật',exact:true});await apply.focus();await page.keyboard.press('Tab');expect(await apply.evaluate(node=>document.activeElement===node)).toBe(false);await apply.click();await page.getByRole('dialog',{name:'Xác nhận cập nhật hàng loạt',exact:true}).getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(bulk).toContainText('Đã cập nhật 51/51 giao dịch; 0 giữ nguyên.');
 const changed=await request(page,'records/query','POST',{filter:{period:{fromDate:'2026-10-01',toDateExclusive:'2026-11-01',timezone:'Asia/Ho_Chi_Minh'},referenceCurrency:'VND',query:'SYNTHETIC_BULK_CONFIRMED'},limit:100});expect(changed.status).toBe(200);expect(changed.body.total).toBe(51);expect(new Set(changed.body.items.map((row:any)=>row.record.id))).toEqual(new Set(ids));for(const row of changed.body.items){expect(row.record.revision).toBe(2);expect(row.postings[0].deltaMinor).toBe('-100');}expect((await request(page,'records/'+late.body.record.id)).body.record).toMatchObject({revision:1,note:'SYNTHETIC_BULK_SCOPE_LATE'});expect((await request(page,'accounts/'+account.id+'/balance?date=2026-10-31')).body.book).toEqual(before.body.book);
});
test('W06 an unknown bulk result survives Finance navigation and explicitly replays the identical committed selection patch and nonce',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic bulk unknown account'),created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'123',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_BULK_UNKNOWN_ORIGINAL'}});expect(created.status).toBe(200);await recordsTab(page);await bulkScope(page,'SYNTHETIC_BULK_UNKNOWN_ORIGINAL');await records(page).getByRole('checkbox',{name:'Chọn giao dịch '+created.body.record.id,exact:true}).check();await bulkNote(page,'SYNTHETIC_BULK_UNKNOWN_CONFIRMED');const calls:{id:string;body:unknown}[]=[];await page.route('**/api/wallet/records/bulk-metadata',async route=>{calls.push({id:route.request().headers()['x-request-id'],body:route.request().postDataJSON()});if(calls.length===1){const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('connectionreset');}else await route.continue();});
 const bulk=page.getByTestId('wallet-bulk');await bulk.getByRole('button',{name:'Xác nhận cập nhật',exact:true}).click();await page.getByRole('dialog',{name:'Xác nhận cập nhật hàng loạt',exact:true}).getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(bulk.getByRole('alert')).toContainText('Chưa xác nhận');await expect(records(page).getByRole('button',{name:'Tạo ghi chép',exact:true})).toBeDisabled();await expect(records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true})).toBeDisabled();
 await page.getByTestId('wallet-home').getByRole('button',{name:'Tài khoản',exact:true}).click();await page.getByTestId('wallet-home').getByRole('button',{name:'Ghi chép',exact:true}).click();await expect(bulk.getByRole('alert')).toContainText('Chưa xác nhận');await bulk.getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true}).click();await expect(bulk).toContainText('Đã cập nhật 1/1 giao dịch; 0 giữ nguyên.');expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);const saved=await request(page,'records/'+created.body.record.id);expect(saved.status).toBe(200);expect(saved.body.record).toMatchObject({revision:2,note:'SYNTHETIC_BULK_UNKNOWN_CONFIRMED'});expect(saved.body.postings[0].deltaMinor).toBe('-123');
});
test('W06 a stale bulk confirmation keeps the independent edit and requires a fresh preview without sending a replacement write',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic bulk conflict account'),created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'123',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_BULK_CONFLICT_ORIGINAL'}});expect(created.status).toBe(200);await recordsTab(page);await bulkScope(page,'SYNTHETIC_BULK_CONFLICT_');await records(page).getByRole('checkbox',{name:'Chọn giao dịch '+created.body.record.id,exact:true}).check();await bulkNote(page,'SYNTHETIC_BULK_CONFLICT_DRAFT');const bulk=page.getByTestId('wallet-bulk');await bulk.getByRole('button',{name:'Xác nhận cập nhật',exact:true}).click();const confirm=page.getByRole('dialog',{name:'Xác nhận cập nhật hàng loạt',exact:true});await expect(confirm).toBeVisible();const remote=await request(page,'records/'+created.body.record.id,'PATCH',{expectedRevision:1,patch:{note:'SYNTHETIC_BULK_CONFLICT_REMOTE'}});expect(remote.status).toBe(200);await expect(records(page).getByRole('button',{name:/SYNTHETIC_BULK_CONFLICT_REMOTE/})).toBeVisible();let writes=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/wallet/records/bulk-metadata')writes++;});await confirm.getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(bulk.getByRole('alert')).toContainText('CONFLICT');expect(writes).toBe(0);expect((await request(page,'records/'+created.body.record.id)).body.record).toMatchObject({revision:2,note:'SYNTHETIC_BULK_CONFLICT_REMOTE'});await expect(bulk.getByLabel('Ghi chú',{exact:true})).toHaveValue('SYNTHETIC_BULK_CONFLICT_DRAFT');
});
test('W06 a held privacy refresh preserves an open confirmation so Escape can release its focus and scroll ownership',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic bulk confirmation refresh account'),created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'123',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_BULK_MODAL_ORIGINAL'}});expect(created.status).toBe(200);await recordsTab(page);await bulkScope(page,'SYNTHETIC_BULK_MODAL_');await records(page).getByRole('checkbox',{name:'Chọn giao dịch '+created.body.record.id,exact:true}).check();await bulkNote(page,'SYNTHETIC_BULK_MODAL_DRAFT');const bulk=page.getByTestId('wallet-bulk');await bulk.getByRole('button',{name:'Xác nhận cập nhật',exact:true}).click();const confirm=page.getByRole('dialog',{name:'Xác nhận cập nhật hàng loạt',exact:true});await expect(confirm).toBeVisible();let release!:()=>void,observed!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),held=new Promise<void>(resolve=>observed=resolve);await page.route('**/api/wallet/status',async route=>{observed();await gate;await route.continue();});
 try{const remote=await request(page,'records/'+created.body.record.id,'PATCH',{expectedRevision:1,patch:{note:'SYNTHETIC_BULK_MODAL_REMOTE'}});expect(remote.status).toBe(200);await held;await expect(confirm).toBeVisible();await expect(bulk).toHaveCount(0);await page.keyboard.press('Escape');await expect(confirm).toHaveCount(0);expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');}finally{release();}
 await expect(records(page).getByRole('button',{name:/SYNTHETIC_BULK_MODAL_REMOTE/})).toBeVisible();await expect(bulk.getByLabel('Ghi chú',{exact:true})).toHaveValue('SYNTHETIC_BULK_MODAL_DRAFT');await expect(bulk.getByRole('button',{name:'Xác nhận cập nhật',exact:true})).toHaveCount(0);expect((await request(page,'records/'+created.body.record.id)).body.record).toMatchObject({revision:2,note:'SYNTHETIC_BULK_MODAL_REMOTE'});
});
