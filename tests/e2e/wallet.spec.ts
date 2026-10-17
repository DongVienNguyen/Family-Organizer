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
 expect((await request(page,'accounts/'+usd.id+'/balance?date=2026-10-31')).body.book.minor).toBe('-10000');expect((await request(page,'accounts/'+vnd.id+'/balance?date=2026-10-31')).body.book.minor).toBe('2490000');const detail=records(page).getByRole('region',{name:'Chi tiết ghi chép',exact:true});await expect(detail).toContainText('25000/1');await detail.getByRole('button',{name:'Hủy ghi chép',exact:true}).click();await page.getByRole('dialog',{name:'Hủy ghi chép',exact:true}).getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(detail).toContainText('Đã hủy');expect((await request(page,'accounts/'+usd.id+'/balance?date=2026-10-31')).body.book.minor).toBe('0');expect((await request(page,'accounts/'+vnd.id+'/balance?date=2026-10-31')).body.book.minor).toBe('0');
});
test('W06 scoped filters recover explicitly from a missing valuation rate',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic UI filter cash');const saved=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',accountId:account.id,money:{minor:'123',currency:'VND'},note:'SYNTHETIC_UI_FILTER_TARGET'}});expect(saved.status).toBe(200);await recordsTab(page);await records(page).getByText('Bộ lọc ghi chép',{exact:true}).click();await records(page).getByLabel('Tìm kiếm ghi chép',{exact:true}).fill('SYNTHETIC_UI_FILTER_TARGET');await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('heading',{name:'Ghi chép (1)',exact:true})).toBeVisible();await records(page).getByLabel(account.name,{exact:true}).check();await records(page).getByLabel(account.name,{exact:true}).uncheck();await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('heading',{name:'Ghi chép (1)',exact:true})).toBeVisible();
 await records(page).getByRole('button',{name:'Tiền tệ tham chiếu',exact:true}).click();await page.getByRole('option',{name:'USD',exact:true}).click();await records(page).getByLabel('Số tiền tuyệt đối từ',{exact:true}).fill('1,00');await records(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await expect(records(page).getByRole('alert')).toContainText('Thiếu tỷ giá');await records(page).getByRole('button',{name:'Khôi phục bộ lọc mặc định',exact:true}).click();await expect(records(page).getByRole('button',{name:'Tạo ghi chép',exact:true})).toBeEnabled();
});
test('W05 record edit retains conflict draft and replays the same note-only write after a lost acknowledgement',async({page})=>{
 await login(page);const account=await accountForRecord(page,'Synthetic UI conflict cash');const created=await request(page,'records','POST',{expectedRevision:0,input:{kind:'expense',accountId:account.id,money:{minor:'123',currency:'VND'},effectiveDate:'2026-10-17',timezone:'Asia/Ho_Chi_Minh',note:'SYNTHETIC_UI_EDIT_ORIGINAL'}});expect(created.status).toBe(200);const id=created.body.record.id;await recordsTab(page);await records(page).getByRole('button',{name:/SYNTHETIC_UI_EDIT_ORIGINAL/}).click();await records(page).getByRole('button',{name:'Sửa ghi chép',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sửa ghi chép',exact:true});await dialog.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC_UI_EDIT_DRAFT');const remote=await request(page,'records/'+id,'PATCH',{expectedRevision:1,patch:{note:'SYNTHETIC_UI_EDIT_REMOTE'}});expect(remote.status).toBe(200);await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Ghi chép đã thay đổi');await expect(dialog.getByLabel('Ghi chú',{exact:true})).toHaveValue('SYNTHETIC_UI_EDIT_DRAFT');await dialog.getByRole('button',{name:'Nạp bản hiện tại (thay dữ liệu nhập)',exact:true}).click();await expect(dialog.getByLabel('Ghi chú',{exact:true})).toHaveValue('SYNTHETIC_UI_EDIT_REMOTE');
 const calls:Array<{id:string;body:unknown}>=[];await page.route('**/api/wallet/records/'+id,async route=>{if(route.request().method()!=='PATCH')return route.continue();calls.push({id:route.request().headers()['x-request-id'],body:route.request().postDataJSON()});if(calls.length===1){const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('connectionreset');}else await route.continue();});await dialog.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC_UI_EDIT_CONFIRMED');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Chưa xác nhận');await dialog.getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true}).click();await expect(dialog).toHaveCount(0);expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);const saved=await request(page,'records/'+id);expect(saved.body.record).toMatchObject({revision:3,note:'SYNTHETIC_UI_EDIT_CONFIRMED'});expect(saved.body.metadata.occurredAt).toBeNull();expect(saved.body.postings[0].deltaMinor).toBe('-123');
});
