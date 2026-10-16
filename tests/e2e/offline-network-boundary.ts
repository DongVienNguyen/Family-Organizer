import type {BrowserContext} from '@playwright/test';
/** A serializable matcher lets Playwright's server filter owned traffic before
 * dispatching to test-client route callbacks. WebKit still enables its native
 * interception globally; this removes the avoidable test-client round trip. */
export async function installOfflineNetworkBoundary(context:Pick<BrowserContext,'route'>,baseURL:string,unexpected:string[]):Promise<void>{
 let owned:URL;try{owned=new URL(baseURL);}catch{throw Error('OWNED_BROWSER_ORIGIN_REQUIRED');}
 if(!['http:','https:'].includes(owned.protocol)||owned.hostname!=='127.0.0.1'||!/^\d+$/.test(owned.port)||Number(owned.port)<1024||owned.username||owned.password||owned.pathname!=='/'||owned.search||owned.hash)throw Error('OWNED_BROWSER_ORIGIN_REQUIRED');
 // The validated origin contains only scheme, fixed IPv4 address and numeric port.
 const escapedOrigin=owned.origin.replaceAll('.','\\.'),foreignOrigin=new RegExp('^(?!'+escapedOrigin+'(?:/|$))','i');
 await context.route(foreignOrigin,async route=>{const url=new URL(route.request().url());if(url.protocol==='https:'&&['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.fulfill({status:200,contentType:'text/css',body:'/* synthetic offline font fallback */'});unexpected.push(url.origin+url.pathname);await route.abort('blockedbyclient');});
}
