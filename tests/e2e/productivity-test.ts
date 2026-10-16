import{test as base,expect,type Page}from'@playwright/test';
import fs from'node:fs';import{createHash}from'node:crypto';
import{installOfflineNetworkBoundary}from'./offline-network-boundary.js';
import{productivityWorkerOrigin}from'../../scripts/ci/productivity-worker-contract.mjs';
import{productivityBrowserWorkers}from'../../scripts/ci/productivity-browser-contract.mjs';
export{expect};
export const password='synthetic-browser-password';
export async function login(page:Page,role:string,canonical=true){await page.goto('/');await page.getByPlaceholder('Nhập tên đăng nhập gia đình...').fill('browser-'+role);await page.getByPlaceholder('Mật khẩu của từng thành viên...').fill(password);await page.getByRole('button',{name:'Đăng nhập Gia Đình',exact:true}).click();await expect(page.getByRole('button',{name:'Mở hồ sơ của Synthetic '+role,exact:true})).toBeVisible();await page.locator('aside nav').getByRole('button',{name:'Nhóm Task',exact:true}).click();if(canonical)await expect(page.getByRole('button',{name:'Danh sách',exact:true})).toBeVisible();}
export async function matrixRequest(page:Page,route:string,method='GET',body?:unknown){return page.evaluate(async packet=>{const response=await fetch('/api/productivity'+packet.route,{method:packet.method,headers:{Authorization:'Bearer '+localStorage.getItem('family_token'),'Content-Type':'application/json','x-request-id':crypto.randomUUID()},...(packet.body===undefined?{}:{body:JSON.stringify(packet.body)})});return {status:response.status,body:await response.json()};},{route,method,body});}
export function createProductivityTest(){
 const test=base.extend({baseURL:async({browserName},use,info)=>{let origins;try{origins=JSON.parse(process.env.FO_PRODUCTIVITY_OWNED_ORIGINS??'null');}catch{throw Error('PRODUCTIVITY_WORKER_ORIGIN_REJECTED');}await use(productivityWorkerOrigin(origins,info.parallelIndex,productivityBrowserWorkers[browserName]));}});
 test.beforeAll(async({browser,browserName},info)=>{if(![0,1].includes(info.parallelIndex))throw Error('PRODUCTIVITY_WORKER_ORIGIN_REJECTED');fs.mkdirSync('reports',{recursive:true});const bytes=JSON.stringify({browserName,browserVersion:browser.version(),executableSha256:createHash('sha256').update(fs.readFileSync(browser.browserType().executablePath())).digest('hex'),nodeVersion:process.version,platform:process.platform,architecture:process.arch});fs.writeFileSync('reports/productivity-browser-runtime-'+browserName+'-worker'+info.parallelIndex+'.json',bytes);if(info.parallelIndex===0)fs.writeFileSync('reports/productivity-browser-runtime-'+browserName+'.json',bytes);});
const browserErrors=new WeakMap<Page,string[]>(),networkErrors=new WeakMap<Page,string[]>();
test.beforeEach(async({context,page,baseURL})=>{if(!baseURL)throw Error('Owned production server URL is required');const errors:string[]=[],external:string[]=[];networkErrors.set(page,external);browserErrors.set(page,errors);page.on('pageerror',error=>errors.push(error.message));await installOfflineNetworkBoundary(context,baseURL,external);await context.addInitScript(()=>localStorage.setItem('family_lang','vi'));});
test.afterEach(async({page})=>{await page.evaluate(()=>{(window as any).__p04FetchGate?.restore();(window as any).__p05SearchFaultRestore?.();(window as any).__p10SeriesDeniedRestore?.();});expect(browserErrors.get(page)??[],'uncaught browser errors').toEqual([]);expect(networkErrors.get(page)??[],'unexpected browser network destination').toEqual([]);});
 return test;
}

export async function togglePin(page:Page,id:string){return page.evaluate(async id=>{const headers={Authorization:'Bearer '+localStorage.getItem('family_token'),'Content-Type':'application/json'},path='/api/productivity/tasks/'+id+'/pin',before=await (await fetch(path,{headers})).json();const response=await fetch(path,{method:'POST',headers:{...headers,'x-request-id':crypto.randomUUID()},body:JSON.stringify({expectedRevision:before.pin.revision,input:{pinned:!before.pin.pinned}})});await response.json();return response.status;},id);}

export async function workflowView(page:Page,title:string){const listed=await matrixRequest(page,'/views');expect(listed.status).toBe(200);const source=listed.body.views.find((v:any)=>v.config.kind==='kanban'&&v.config.mode==='workflow'&&v.config.boardId);expect(source).toBeDefined();const saved=await matrixRequest(page,'/views','POST',{expectedRevision:0,input:{title,kind:'kanban',filter:{rootsOnly:true},config:{kind:'kanban',mode:'workflow',group:'none',sort:'rank',columns:[],boardId:source.config.boardId}}});expect(saved.status).toBe(200);return saved.body.view;}

/** C36 exercises workflow transitions; its sessions are real server-issued
 * synthetic preconditions. Keep the same visible role/workspace checks as the
 * UI login helper; the mandatory foundation suite still exercises the form. */
export async function loginWithSession(page:Page,role:string,canonical=true){
 const response=await page.request.post('/api/auth/login',{data:{username:'browser-'+role,password},maxRedirects:0});expect(response.status()).toBe(200);const body=await response.json();expect(body.user.id).toBe('browser-'+role);expect(body.user.role).toBe(role);expect(body.token).toMatch(/^fo1\./);
 const origin=new URL(response.url()).origin;await page.context().setStorageState({cookies:[],origins:[{origin,localStorage:[{name:'family_token',value:body.token},{name:'family_lang',value:'vi'}]}]});await page.goto('/');await expect(page.getByRole('button',{name:'Mở hồ sơ của Synthetic '+role,exact:true})).toBeVisible();await page.locator('aside nav').getByRole('button',{name:'Nhóm Task',exact:true}).click();if(canonical)await expect(page.getByRole('button',{name:'Danh sách',exact:true})).toBeVisible();
}
