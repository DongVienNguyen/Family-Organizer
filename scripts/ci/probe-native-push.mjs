import http from 'node:http';
import fs from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {webkit} from '@playwright/test';
// Two owned synthetic pages differ only in whether the existing native read runs.
// This is driver diagnosis, not a functional acceptance or notification test.
const sha=process.env.TEST_COMMIT_SHA;assert.match(sha??'',/^[a-f0-9]{40}$/);
const report='reports/browser-native-push-diagnostic.json',rows=[];
const server=http.createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/sw.js'){res.setHeader('Content-Type','application/javascript');res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));");}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><main id="native-control">Synthetic native control</main></body></html>');}}).listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let failure;
try{
 for(const nativeRead of [false,true]){
  const browser=await webkit.launch(),context=await browser.newContext(),page=await context.newPage(),events=[];let readyResolve;
  const ready=new Promise(resolve=>readyResolve=resolve);page.on('console',message=>{if(message.type()==='log'&&/^PUSH_DIAG (ready|called|fulfilled|rejected|timer|unsupported)$/.test(message.text())){events.push(message.text().slice(10));if(['PUSH_DIAG ready','PUSH_DIAG unsupported'].includes(message.text()))readyResolve();}});
  const row={nativeRead,events};rows.push(row);
  try{
   await page.goto(origin);assert.equal(await page.locator('#native-control').textContent(),'Synthetic native control');row.beforeLocator=true;
   row.capabilities=await page.evaluate(()=>({permission:typeof Notification==='undefined'?'unsupported':Notification.permission,serviceWorker:'serviceWorker'in navigator,pushManager:'PushManager'in window}));
   await page.evaluate(enabled=>{setTimeout(async()=>{if(!('serviceWorker'in navigator)||!('PushManager'in window)){console.log('PUSH_DIAG unsupported');return;}await navigator.serviceWorker.register('/sw.js');const registration=await navigator.serviceWorker.ready;console.log('PUSH_DIAG ready');if(enabled){const subscription=registration.pushManager.getSubscription();console.log('PUSH_DIAG called');subscription.then(()=>console.log('PUSH_DIAG fulfilled'),()=>console.log('PUSH_DIAG rejected'));}setTimeout(()=>console.log('PUSH_DIAG timer'),0);},0);},nativeRead);
   let timer;try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_PUSH_READY_DEADLINE')),10000);})]);}finally{clearTimeout(timer);}
   // The ready console event is delivered before the optional native read. Query
   // after the owned timer marker or a bounded diagnostic deadline, never retry.
   const start=Date.now();while(!events.includes('timer')&&Date.now()-start<2000)await new Promise(resolve=>setTimeout(resolve,20));
   try{assert.equal(await page.locator('#native-control').textContent({timeout:5000}),'Synthetic native control');row.afterLocator=true;}catch{row.afterLocator=false;}
  }finally{await context.close();await browser.close();row.cleanup=true;}
 }
 assert.equal(rows[0].beforeLocator,true);assert.equal(rows[0].afterLocator,true);assert(rows.every(row=>row.cleanup===true));
}catch{failure='NATIVE_PUSH_DIAGNOSTIC_REJECTED';}
finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.mkdirSync('reports',{recursive:true});fs.writeFileSync(report,JSON.stringify({commitSha:sha,nodeVersion:process.version,platform:process.platform,architecture:process.arch,scope:'synthetic-native-driver-diagnostic-only',rows,fixtureCleanup:true,server2019Acceptance:'not-run',failure},null,2)+'\n');}
if(failure){console.error(failure);process.exitCode=1;}else console.log('NATIVE_PUSH_DIAGNOSTIC_RECORDED');
