import {expect,type Locator,type Page} from '@playwright/test';
export async function assertChildMemberBoundary(members:Locator,expectedNames:readonly string[],timeout=10_000){
  expect(expectedNames.length).toBeGreaterThan(0);
  for(const name of expectedNames)await expect(members.getByText(name,{exact:true})).toBeVisible({timeout});
  await expect(members.getByRole('button',{name:'Kích hoạt tài khoản',exact:true})).toHaveCount(0,{timeout});
  for(const title of ['Sửa thông tin & vai trò của','Đặt lại mật khẩu cho','Xóa tài khoản'])await expect(members.locator('button[title^="'+title+'"]')).toHaveCount(0,{timeout});
}
export async function exerciseMemberBoundaryFixtures(page:Page){
  const names=['Synthetic fixture admin','Synthetic fixture child'];
  await page.setContent('<div id="members"></div>');
  await expect(assertChildMemberBoundary(page.locator('#members'),names,250)).rejects.toThrow();
  const content='<div id="members"><p>Synthetic fixture admin</p><p>Synthetic fixture child</p></div>';
  await page.setContent(content);
  await assertChildMemberBoundary(page.locator('#members'),names,250);
  await page.setContent(content.replace('</div>','<button title="Sửa thông tin &amp; vai trò của Synthetic fixture child">Synthetic forbidden control</button></div>'));
  await expect(assertChildMemberBoundary(page.locator('#members'),names,250)).rejects.toThrow();
}
