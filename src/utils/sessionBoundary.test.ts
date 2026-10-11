import { expect,it,vi } from 'vitest';
import { createSessionBoundary } from './sessionBoundary.js';
const origin='https://family.test';
async function fixture(){let token:string|null='A';const network=vi.fn(async(_input:any,_init:any)=>new Response(JSON.stringify({private:'A'}),{headers:{'Content-Type':'application/json'}}));const purge=vi.fn(async()=>{}),write=vi.fn((next:string|null)=>{token=next;});const boundary=createSessionBoundary({origin,request:network as typeof fetch,readToken:()=>token,writeToken:write,purge});await boundary.change('A');return {boundary,network,purge,write,read:()=>token,externalChange:(next:string|null)=>{token=next;}};}
const options={headers:{Authorization:'Bearer A'}};
it('aborts old requests, unmounts immediately and opens a new session only after private purge succeeds',async()=>{const f=await fixture();let release!:()=>void;f.network.mockImplementation(async()=>new Promise<Response>(()=>{}));const pending=f.boundary.request(origin+'/api/finance',options);pending.catch(()=>{});const signal=f.network.mock.calls[0][1].signal;f.purge.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));const change=f.boundary.change('B');expect(signal.aborted).toBe(true);expect(f.boundary.snapshot()).toMatchObject({status:'clearing',token:null});expect(f.read()).toBeNull();release();await change;expect(f.boundary.snapshot()).toMatchObject({status:'ready',token:'B'});expect(f.read()).toBe('B');});
it('rejects a response that arrives after switching users even when a test transport ignores cancellation',async()=>{const f=await fixture();let release!:(r:Response)=>void;f.network.mockImplementation(async()=>new Promise<Response>(resolve=>{release=resolve;}));const pending=f.boundary.request(origin+'/api/finance',options);await f.boundary.change('B');release(new Response('{"private":"A"}'));await expect(pending).rejects.toMatchObject({name:'AbortError'});});
it.each(['json','text','blob','arrayBuffer','formData'])('rejects stale %s body decoding after headers arrived',async method=>{const f=await fixture();const response=await f.boundary.request(origin+'/api/finance',options);await f.boundary.change('B');await expect((response as any)[method]()).rejects.toMatchObject({name:'AbortError'});});
it('guards clones and already acquired stream readers across logout',async()=>{const f=await fixture();const response=await f.boundary.request(origin+'/api/finance',options);const clone=response.clone(),reader=response.body!.getReader();await f.boundary.change(null);await expect(clone.json()).rejects.toMatchObject({name:'AbortError'});await expect(reader.read()).rejects.toMatchObject({name:'AbortError'});});
it('rejects an old captured Bearer before any network access',async()=>{const f=await fixture();await f.boundary.change('B');await expect(f.boundary.request(origin+'/api/finance',options)).rejects.toMatchObject({name:'AbortError'});expect(f.network).not.toHaveBeenCalled();});
it('sets no-store and forwards caller cancellation for internal requests',async()=>{const f=await fixture();const abort=new AbortController();await f.boundary.request(origin+'/api/finance',{...options,signal:abort.signal});const sent=f.network.mock.calls[0][1];expect(sent.cache).toBe('no-store');abort.abort();expect(sent.signal.aborted).toBe(true);});
it('invalidates the current session on authenticated HTTP401',async()=>{const f=await fixture();f.network.mockImplementation(async()=>new Response('{}',{status:401}));await expect(f.boundary.request(origin+'/api/finance',options)).rejects.toMatchObject({name:'AbortError'});expect(f.read()).toBeNull();expect(f.boundary.snapshot().token).toBeNull();});
it('does not allow a late HTTP401 from the old session to clear the new one',async()=>{const f=await fixture();let release!:(r:Response)=>void;f.network.mockImplementation(async()=>new Promise<Response>(resolve=>{release=resolve;}));const pending=f.boundary.request(origin+'/api/finance',options);await f.boundary.change('B');release(new Response('{}',{status:401}));await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(f.read()).toBe('B');});
it('fails closed on purge failure and retries cleanup before restoring the intended session',async()=>{const f=await fixture();f.purge.mockRejectedValueOnce(new Error('Synthetic cache failure'));await expect(f.boundary.change('B')).rejects.toThrow('Synthetic cache failure');expect(f.boundary.snapshot().status).toBe('error');expect(f.read()).toBeNull();await expect(f.boundary.request(origin+'/api/finance',{headers:{Authorization:'Bearer B'}})).rejects.toMatchObject({name:'AbortError'});await f.boundary.retry();expect(f.read()).toBe('B');});
it('keeps the most recent transition when earlier cleanup finishes late',async()=>{const f=await fixture();let release!:()=>void;f.purge.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));const old=f.boundary.change('B'),latest=f.boundary.change('C');expect(f.boundary.snapshot().status).toBe('clearing');release();await Promise.all([old,latest]);expect(f.read()).toBe('C');expect(f.boundary.snapshot().token).toBe('C');});
it('detects a cross-tab token change before its storage event is delivered',async()=>{const f=await fixture();const response=await f.boundary.request(origin+'/api/finance',options);f.externalChange('B');await expect(response.json()).rejects.toMatchObject({name:'AbortError'});await expect(f.boundary.request(origin+'/api/finance',options)).rejects.toMatchObject({name:'AbortError'});});
it('leaves static and external request behavior unchanged',async()=>{const f=await fixture();const response=await f.boundary.request(origin+'/assets/synthetic.js',{cache:'force-cache'});const external=await f.boundary.request('https://synthetic.invalid/public',{cache:'reload'});expect(f.network.mock.calls[0][1].cache).toBe('force-cache');expect(f.network.mock.calls[1][1].cache).toBe('reload');await f.boundary.change('B');expect(await response.json()).toEqual({private:'A'});expect(await external.json()).toEqual({private:'A'});});

it('keeps cloned response bodies owned until each copy is consumed or the session ends',async()=>{
  const f=await fixture(),response=await f.boundary.request(origin+'/api/finance',options),clone=response.clone();await response.json();
  const signal=f.network.mock.calls[0][1].signal;await f.boundary.change(null);expect(signal.aborted).toBe(true);await expect(clone.json()).rejects.toMatchObject({name:'AbortError'});
});

it('preserves internal requests on browsers without AbortSignal.any',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(AbortSignal,'any')!;Object.defineProperty(AbortSignal,'any',{value:undefined,configurable:true});
  try{const f=await fixture(),abort=new AbortController();const response=await f.boundary.request(origin+'/api/finance',{...options,signal:abort.signal});expect(await response.json()).toEqual({private:'A'});await f.boundary.change(null);}
  finally{Object.defineProperty(AbortSignal,'any',descriptor);}
});

it('reconciles the latest cross-tab token if storage changes again during cleanup',async()=>{
  const f=await fixture();let finish!:()=>void;f.purge.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));f.externalChange('B');
  const pending=f.boundary.change('B',false);f.externalChange('C');finish();await pending;
  expect(f.boundary.snapshot()).toMatchObject({status:'ready',token:'C'});expect(f.read()).toBe('C');expect(f.write).toHaveBeenCalledTimes(2);
});

it.each(['body','iterator','reader-error'])('releases completed %s stream ownership and preserves cancellation',async method=>{
  const f=await fixture(),cancel=vi.fn(),stream=new ReadableStream<Uint8Array>({start(controller){if(method==='reader-error')controller.error(new Error('Synthetic stream failure'));else controller.enqueue(new Uint8Array([1]));},cancel});
  f.network.mockImplementation(async()=>new Response(stream));const response=await f.boundary.request(origin+'/api/realtime',options),signal=f.network.mock.calls[0][1].signal;
  if(method==='body')await response.body!.cancel();
  else if(method==='iterator'){for await(const chunk of response.body! as any){expect(chunk).toEqual(new Uint8Array([1]));break;}}
  else await expect(response.body!.getReader().read()).rejects.toThrow('Synthetic stream failure');
  expect(cancel).toHaveBeenCalledTimes(method==='reader-error'?0:1);await f.boundary.change('B');expect(signal.aborted).toBe(false);
});

it('preserves preventCancel iteration while retaining ownership of the remaining body',async()=>{
  const f=await fixture(),cancel=vi.fn();let controller!:ReadableStreamDefaultController<Uint8Array>;
  f.network.mockImplementation(async()=>new Response(new ReadableStream<Uint8Array>({start(value){controller=value;controller.enqueue(new Uint8Array([1]));},cancel})));
  const response=await f.boundary.request(origin+'/api/realtime',options);for await(const chunk of (response.body as any).values({preventCancel:true})){expect(chunk).toEqual(new Uint8Array([1]));break;}
  expect(cancel).not.toHaveBeenCalled();controller.enqueue(new Uint8Array([2]));controller.close();const reader=response.body!.getReader();expect(await reader.read()).toEqual({done:false,value:new Uint8Array([2])});expect((await reader.read()).done).toBe(true);reader.releaseLock();await f.boundary.change('B');expect(f.network.mock.calls[0][1].signal.aborted).toBe(false);
});

it('retains a body after failed pipeTo with preventCancel until it is cancelled or the session ends',async()=>{
  const f=await fixture(),cancel=vi.fn();f.network.mockImplementation(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));},cancel})));
  const response=await f.boundary.request(origin+'/api/realtime',options);
  await expect(response.body!.pipeTo(new WritableStream({write(){throw new Error('Synthetic destination failure');}}),{preventCancel:true})).rejects.toThrow('Synthetic destination failure');
  expect(cancel).not.toHaveBeenCalled();await f.boundary.change('B');expect(f.network.mock.calls[0][1].signal.aborted).toBe(true);
});
