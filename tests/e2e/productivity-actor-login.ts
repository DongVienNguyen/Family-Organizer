import {expect,type Page} from '@playwright/test';
/** Bootstrap a synthetic actor on a fresh document. Replacing storage on the
 * live previous actor dispatches clear/refill storage events while its privacy
 * cleanup is still running; that is a separate cross-tab boundary scenario.
 * Keep the real worker/session startup and the existing readiness assertion. */
export async function loginProductivityActor(page:Page,role='admin'):Promise<string>{
 const response=await page.request.post('/api/auth/login',{data:{username:'browser-'+role,password:'synthetic-browser-password'},maxRedirects:0});expect(response.status()).toBe(200);const body=await response.json();expect(body.user.id).toBe('browser-'+role);const origin=new URL(response.url()).origin;
 await page.goto('about:blank');
 await page.context().setStorageState({cookies:[],origins:[{origin,localStorage:[{name:'family_token',value:body.token},{name:'family_lang',value:'vi'},{name:'family_theme',value:'light'}]}]});
 await page.goto('/?tab=tasks');await expect(page.getByRole('button',{name:'Lịch công việc',exact:true})).toBeEnabled();return body.token as string;
}
