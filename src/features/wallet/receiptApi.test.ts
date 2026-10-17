import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createWalletApi,WalletApiError} from './api.js';
const id='b8ac02a3-655e-4d7d-9422-519b1403b270',png=new Uint8Array([137,80,78,71,13,10,26,10]),receipt={id,recordId:'r',fileKey:id+'.png',fileName:'Synthetic receipt.png',mime:'image/png',size:8,sha256:createHash('sha256').update(png).digest('hex'),createdAt:'2026-10-17T00:00:00.000Z',createdBy:'adult'};
function client(work:(path:string,init:RequestInit)=>Promise<Response>|Response,auth=()=>({Authorization:'Bearer synthetic'})){return createWalletApi({authHeaders:auth,request:async(path,init)=>work(String(path),init!)});}
it('decodes record-bound receipt lists without public URLs or duplicated IDs',async()=>{
 const api=client(path=>{expect(path).toBe('/api/wallet/records/r/receipts');return Response.json({recordId:'r',revision:2,receipts:[receipt]});});expect(await (api as any).receipts('r')).toEqual({recordId:'r',revision:2,receipts:[receipt]});
});
it.each([{recordId:'other'},{fileKey:'../bad.png'},{mime:'image/svg+xml'},{sha256:'bad'},{size:0},{createdAt:null},{url:'/uploads/synthetic.png'}])('rejects malformed receipt metadata %j',async patch=>{
 const api=client(()=>Response.json({recordId:'r',revision:2,receipts:[{...receipt,...patch}]}));await expect((api as any).receipts('r')).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:false});
});
it('attach and detach use explicit nonce/revision and validated immutable acknowledgements',async()=>{
 const calls:any[]=[],api=client((path,init)=>{calls.push({path,init});return Response.json(init.method==='POST'?{recordId:'r',revision:2,receipt}:{recordId:'r',revision:3,receiptId:id});});
 const input={fileName:'Synthetic receipt.png',dataUrl:'data:image/png;base64,synthetic'};
 expect(await (api as any).attachReceipt('r',1,input,'owned')).toEqual({recordId:'r',revision:2,receipt});expect(new Headers(calls[0].init.headers).get('x-request-id')).toBe('owned');expect(JSON.parse(calls[0].init.body)).toEqual({expectedRevision:1,input});
 expect(await (api as any).detachReceipt('r',2,id,'detach')).toEqual({recordId:'r',revision:3,receiptId:id});expect(calls[1].init.method).toBe('DELETE');
});
it('a malformed successful attach is an unknown outcome and never retries automatically',async()=>{
 let count=0;const api=client(()=>{count++;return Response.json({recordId:'other',revision:2,receipt});});await expect((api as any).attachReceipt('r',1,{},'owned')).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:true});expect(count).toBe(1);
});
it('downloads only authenticated same-origin no-store verified bytes',async()=>{
 const api=client((path,init)=>{expect(path).toBe('/api/wallet/records/r/receipts/'+id);expect(init).toMatchObject({cache:'no-store',redirect:'error',credentials:'same-origin'});expect(new Headers(init.headers).get('Authorization')).toBe('Bearer synthetic');return new Response(png,{headers:{'Content-Type':'image/png'}});});
 const blob=await (api as any).receiptFile('r',receipt);expect(blob.size).toBe(8);expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png);
});
it.each(['mime','size','hash'])('rejects downloaded %s drift rather than providing an object URL',async kind=>{
 const bytes=kind==='size'?new Uint8Array([1]):kind==='hash'?new Uint8Array(8):png,api=client(()=>new Response(bytes,{headers:{'Content-Type':kind==='mime'?'application/pdf':'image/png'}}));await expect((api as any).receiptFile('r',receipt)).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:false});
});
it('session change while consuming binary bytes rejects the body before it reaches the workspace',async()=>{
 let token='synthetic';const api=client(()=>{const response=new Response(png,{headers:{'Content-Type':'image/png'}});response.blob=async()=>{token='changed';return new Blob([png],{type:'image/png'});};return response;},()=>({Authorization:'Bearer '+token}));await expect((api as any).receiptFile('r',receipt)).rejects.toMatchObject({code:'SESSION_CHANGED'});
});
