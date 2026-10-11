import { expect,it,vi } from 'vitest';
import { endClientSession } from './clientSession.js';
it('clears client state immediately then revokes the captured internal Bearer with a bounded request',async()=>{
  const events:string[]=[];const request=vi.fn(async(_url:any,options:any)=>{events.push('request');expect(options.headers.Authorization).toBe('Bearer synthetic-token');expect(options.method).toBe('POST');expect(options.signal).toBeInstanceOf(AbortSignal);return new Response('{}');});
  await endClientSession('synthetic-token',()=>events.push('clear'),request as any);
  expect(events).toEqual(['clear','request']);expect(request.mock.calls[0][0]).toBe('/api/auth/logout');
});
it('clears local state when an offline revocation request fails',async()=>{
  const clear=vi.fn(),request=vi.fn(async()=>{throw new Error('Synthetic offline');});await expect(endClientSession('synthetic-token',clear,request as any)).resolves.toBeUndefined();expect(clear).toHaveBeenCalledOnce();
});
it('does not send an unauthenticated revocation when no session exists',async()=>{const clear=vi.fn(),request=vi.fn();await endClientSession(null,clear,request as any);expect(clear).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();});
