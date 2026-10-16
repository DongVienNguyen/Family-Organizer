import type {BrowserContext} from '@playwright/test';
/** Intercept only foreign origins. Internal fetch/reload lifetimes stay with the
 * browser, avoiding driver route continuations for a disappearing document. */
export async function installOfflineNetworkBoundary(context:Pick<BrowserContext,'route'>,baseURL:string,unexpected:string[]):Promise<void>{
 let owned:URL;try{owned=new URL(baseURL);}catch{throw Error('OWNED_BROWSER_ORIGIN_REQUIRED');}
 if(!['http:','https:'].includes(owned.protocol)||owned.hostname!=='127.0.0.1'||!/^\d+$/.test(owned.port)||Number(owned.port)<1024||owned.username||owned.password||owned.pathname!=='/'||owned.search||owned.hash)throw Error('OWNED_BROWSER_ORIGIN_REQUIRED');
 await context.route(url=>url.origin!==owned.origin,async route=>{const url=new URL(route.request().url());if(url.protocol==='https:'&&['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.fulfill({status:200,contentType:'text/css',body:'/* synthetic offline font fallback */'});unexpected.push(url.origin+url.pathname);await route.abort('blockedbyclient');});
}
