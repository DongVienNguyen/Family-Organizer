import {expect,it,vi} from 'vitest';
import {createSessionBoundary} from './sessionBoundary.js';
import {completeNotificationRead} from './notificationRead.js';

async function fixture(){
 let token:string|null='SyntheticA';
 const network=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({success:true}),{headers:{'Content-Type':'application/json'}}));
 const boundary=createSessionBoundary({origin:'https://family.test',request:network,readToken:()=>token,writeToken:value=>{token=value;},purge:async()=>{}});
 await boundary.change(token);return {boundary,network};
}
it.each(['one','all'])('releases a completed %s read acknowledgement before refreshing and later logout',async mode=>{
 const f=await fixture(),refresh=vi.fn(),url=mode==='one'?'/api/notifications/synthetic/read':'/api/notifications/read-all';
 await completeNotificationRead(()=>f.boundary.request(url,{method:'POST',headers:{Authorization:'Bearer SyntheticA'}}),refresh);
 expect(refresh).toHaveBeenCalledTimes(1);
 const signal=f.network.mock.calls[0][1]!.signal!;
 await f.boundary.change(null);
 // A completed operation must no longer retain an owner that logout aborts.
 expect(signal.aborted).toBe(false);
});
it.each(['one','all'])('does not refresh an obsolete actor when the %s acknowledgement body completes after user switch',async mode=>{
 const f=await fixture();let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});
 const raw=new Response('{"success":true}');raw.json=async()=>{await hold;return {success:true};};
 f.network.mockImplementation(async()=>raw);
 const response=await f.boundary.request(mode==='one'?'/api/notifications/synthetic/read':'/api/notifications/read-all',{method:'POST',headers:{Authorization:'Bearer SyntheticA'}});
 const refresh=vi.fn(),pending=completeNotificationRead(async()=>response,refresh);void pending.catch(()=>{});
 try{
  await Promise.resolve();await Promise.resolve();
  expect(refresh).not.toHaveBeenCalled();
  await f.boundary.change('SyntheticB');release();
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
  expect(refresh).not.toHaveBeenCalled();
 }finally{release();await pending.catch(()=>{});await f.boundary.change(null);}
});
