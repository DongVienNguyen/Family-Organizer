import {afterEach,expect,it,vi} from 'vitest';
import {startAuthenticatedRealtime} from './realtimeClient.js';
afterEach(()=>vi.useRealTimers());
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){let token='A';const onOnline=vi.fn(),onMessage=vi.fn(),cancel=vi.fn();let controller!:ReadableStreamDefaultController<Uint8Array>;
  const stream=new ReadableStream<Uint8Array>({start(value){controller=value;},cancel});
  const request=vi.fn(async(_input:any,_init:any)=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
  const options={token:'synthetic-A',request:request as typeof fetch,checkSession:()=>{if(token!=='A')throw new DOMException('Synthetic stale session','AbortError');},onOnline,onMessage,retryMs:1000};return {options,request,onOnline,onMessage,cancel,push:(text:string)=>controller.enqueue(new TextEncoder().encode(text)),controller:()=>controller,switchUser:()=>{token='B';}};
}
it('uses Bearer headers and no-store without putting tokens in the realtime URL',async()=>{
  const f=fixture(),client=startAuthenticatedRealtime(f.options);try{await flush();expect(f.request).toHaveBeenCalledWith('/api/realtime',expect.objectContaining({headers:{Authorization:'Bearer synthetic-A',Accept:'text/event-stream'},cache:'no-store',signal:expect.any(AbortSignal)}));expect(f.onOnline).toHaveBeenCalledWith(true);}finally{client.close();await client.closed;}expect(f.cancel).toHaveBeenCalledOnce();
});
it('parses fragmented UTF8, CRLF and multiline SSE data while ignoring heartbeat comments',async()=>{
  const f=fixture(),client=startAuthenticatedRealtime(f.options);try{await flush();const bytes=new TextEncoder().encode(': heartbeat\r\n\r\ndata: {"type":\r\ndata: "NOTES_UPDATE","text":"synthetic Tiếng Việt"}\r\n\r\n');for(const byte of bytes)f.controller().enqueue(new Uint8Array([byte]));await vi.waitFor(()=>expect(f.onMessage).toHaveBeenCalledOnce());expect(f.onMessage).toHaveBeenCalledWith({type:'NOTES_UPDATE'});}finally{client.close();await client.closed;}
});
it.each(['invalid-json','invalid-shape','oversized','wrong-content-type'])('closes %s input before any private callback',async kind=>{
  vi.useFakeTimers();const f=fixture();if(kind==='wrong-content-type')f.request.mockImplementation(async()=>new Response('synthetic html',{headers:{'Content-Type':'text/html'}}));
  const client=startAuthenticatedRealtime(f.options);try{await flush();if(kind!=='wrong-content-type')f.push(kind==='invalid-json'?'data: {invalid}\n\n':kind==='invalid-shape'?'data: {"amount":17}\n\n':'data: '+ 'x'.repeat(65537));await flush();expect(f.onMessage).not.toHaveBeenCalled();expect(f.onOnline).toHaveBeenCalledWith(false);expect(f.request).toHaveBeenCalledOnce();}finally{client.close();await client.closed;}expect(vi.getTimerCount()).toBe(0);
});
it('does not deliver an old frame or reconnect under B after A loses its session',async()=>{
  const f=fixture(),client=startAuthenticatedRealtime(f.options);await flush();f.switchUser();f.push('data: {"type":"NOTES_UPDATE"}\n\n');await client.closed;expect(f.onMessage).not.toHaveBeenCalled();expect(f.request).toHaveBeenCalledOnce();expect(f.cancel).toHaveBeenCalledOnce();
});
it('owns and cancels the EOF reconnect timer on close',async()=>{
  vi.useFakeTimers();const f=fixture(),client=startAuthenticatedRealtime(f.options);await flush();f.controller().close();await flush();expect(f.onOnline).toHaveBeenCalledWith(false);expect(vi.getTimerCount()).toBe(1);client.close();await client.closed;await vi.advanceTimersByTimeAsync(2000);expect(f.request).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('reconnects after EOF with the original credentials and one active attempt',async()=>{
  vi.useFakeTimers();const f=fixture(),client=startAuthenticatedRealtime(f.options);await flush();f.request.mockImplementation(async()=>new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'text/event-stream'}}));f.controller().close();await flush();await vi.advanceTimersByTimeAsync(1000);await flush();expect(f.request).toHaveBeenCalledTimes(2);expect(f.onOnline.mock.calls.filter(([online])=>online)).toHaveLength(2);client.close();await client.closed;expect(vi.getTimerCount()).toBe(0);
});
it.each([401,403])('does not retry HTTP%s or pretend an unauthorized response is a stream',async status=>{
  vi.useFakeTimers();const f=fixture();f.request.mockImplementation(async()=>new Response('{}',{status}));const client=startAuthenticatedRealtime(f.options);await client.closed;expect(f.onOnline).toHaveBeenCalledWith(false);expect(f.onMessage).not.toHaveBeenCalled();expect(f.request).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('closes before headers even if a synthetic transport ignores its abort signal',async()=>{
  const f=fixture();f.request.mockImplementation(async()=>new Promise<Response>(()=>{}));const client=startAuthenticatedRealtime(f.options);await flush();client.close();await client.closed;expect(f.request.mock.calls[0][1].signal.aborted).toBe(true);expect(f.onMessage).not.toHaveBeenCalled();
});

it('cancels a late response body when the initiating session ends before headers arrive',async()=>{
  const f=fixture();let finish!:(response:Response)=>void;f.request.mockImplementation(async()=>new Promise<Response>(resolve=>{finish=resolve;}));const client=startAuthenticatedRealtime(f.options);await flush();f.switchUser();finish(new Response(new ReadableStream({start(){},cancel:f.cancel}),{headers:{'Content-Type':'text/event-stream'}}));await client.closed;expect(f.onMessage).not.toHaveBeenCalled();expect(f.cancel).toHaveBeenCalledOnce();
});
