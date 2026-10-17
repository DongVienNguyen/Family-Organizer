import {createProductivityTest,expect,loginWithSession,matrixRequest} from './productivity-test.js';
import type {Page} from '@playwright/test';

export function registerProductivityRoster(test:ReturnType<typeof createProductivityTest>){
 test('P10 C43 ordered rotation draft survives drawer close and saves once without changing Task proof deadline or points',async({page,browserName})=>{
  await loginWithSession(page,'admin');
  const title='Synthetic ordered roster '+browserName,created=await matrixRequest(page,'/tasks','POST',{expectedRevision:0,input:{listId:'legacy-family',title,assigneeId:'browser-child',isShared:true,due:{kind:'all_day',date:'2027-11-05',timezone:'Asia/Saigon'}}});expect(created.status).toBe(200);const id=created.body.task.id;
  const setup=await page.evaluate(async id=>{const r=await fetch('/api/tasks',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('family_token'),'Content-Type':'application/json','x-request-id':crypto.randomUUID()},body:JSON.stringify({id,rewardPoints:10,proofNote:'Synthetic roster retained proof'})});return r.status;},id);expect(setup).toBe(200);
  const facts=async()=>{const canonical=await matrixRequest(page,'/tasks/'+id);expect(canonical.status).toBe(200);const legacy=await page.evaluate(async id=>{const r=await fetch('/api/tasks/'+id,{headers:{Authorization:'Bearer '+localStorage.getItem('family_token')}});if(r.status!==200)throw Error('Synthetic roster facts');return(await r.json()).task;},id);return {canonical:canonical.body.task,legacy};};
  const rewards=async()=>page.evaluate(async()=>{const r=await fetch('/api/rewards',{headers:{Authorization:'Bearer '+localStorage.getItem('family_token')}});if(r.status!==200)throw Error('Synthetic roster rewards');return r.json();});
  const before=await facts(),points=await rewards(),writes:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/productivity/tasks/series')writes.push(r.postData()??'');});
  const open=async()=>{await page.getByRole('button',{name:'Tìm kiếm toàn cục',exact:true}).click();const search=page.getByRole('dialog',{name:'Tìm kiếm toàn cục',exact:true});await search.getByPlaceholder('Tìm công việc, ghi chú, thu chi, giấy tờ...').fill(title);await search.getByRole('button').filter({has:page.getByText(title,{exact:true})}).click();const drawer=page.getByRole('dialog',{name:'Chi tiết công việc',exact:true});await expect(drawer).toBeVisible();const panel=drawer.getByRole('region',{name:'Lịch lặp',exact:true});const toggle=panel.getByRole('button',{name:'Lịch lặp',exact:true});if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();await expect(panel.getByRole('button',{name:'Tạo lịch lặp',exact:true})).toBeVisible();return {drawer,panel};};
  let {drawer,panel}=await open();await panel.getByRole('button',{name:'Cách xử lý kỳ bị lỡ',exact:true}).click();await page.getByRole('option',{name:'Lần lượt từng kỳ',exact:true}).click();
  for(const name of ['admin','child','member'])await panel.getByRole('checkbox',{name:'Synthetic '+name,exact:true}).check();
  const keyboardMove=async(name:string)=>{await panel.getByRole('button',{name:'Đưa Synthetic '+name+' lên trước',exact:true}).focus();await page.keyboard.press('Enter');};
  await keyboardMove('member');await keyboardMove('member');await keyboardMove('child');
  await expect(panel.getByRole('list',{name:'Thứ tự luân phiên',exact:true}).getByRole('listitem')).toHaveText(['1. Synthetic member↑↓×','2. Synthetic child↑↓×','3. Synthetic admin↑↓×']);
  expect(writes).toEqual([]);expect((await matrixRequest(page,'/tasks/'+id+'/series')).body.series).toBeNull();expect(await facts()).toEqual(before);
  await drawer.getByRole('button',{name:'Đóng',exact:true}).click();await expect(drawer).toHaveCount(0);({drawer,panel}=await open());
  await expect(panel.getByRole('list',{name:'Thứ tự luân phiên',exact:true}).getByRole('listitem')).toHaveText(['1. Synthetic member↑↓×','2. Synthetic child↑↓×','3. Synthetic admin↑↓×']);expect(writes).toEqual([]);
  const saving=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/productivity/tasks/series');await panel.getByRole('button',{name:'Tạo lịch lặp',exact:true}).click();const saved=await saving;expect(saved.status()).toBe(200);const series=(await saved.json()).series;
  expect(series).toMatchObject({taskId:id,acceptedCount:0,rotationCursor:1,policy:{rotationMembers:['browser-member','browser-child','browser-admin']}});expect(writes).toHaveLength(1);expect((await matrixRequest(page,'/tasks/'+id+'/series')).body.series.policy.rotationMembers).toEqual(['browser-member','browser-child','browser-admin']);
  expect(await facts()).toEqual(before);expect(await rewards()).toEqual(points);await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 });
}
