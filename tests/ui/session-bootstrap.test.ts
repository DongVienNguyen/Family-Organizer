import fs from 'node:fs';
import vm from 'node:vm';
import {expect,it,vi} from 'vitest';
import {createSessionBoundary} from '../../src/utils/sessionBoundary.js';
const app=fs.readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
const source=app.slice(app.indexOf('  // Authentication persistence check'),app.indexOf('  // Fetch functions with Bearer'));
it('an old App bootstrap rejection cannot clear the replacement session',async()=>{
  let token:string|null='A';const network=vi.fn(async()=>new Promise<Response>(()=>{}));
  const boundary=createSessionBoundary({origin:'https://family.test',request:network as any,readToken:()=>token,writeToken:value=>{token=value;},purge:async()=>{}});await boundary.change('A');
  const initialized=vi.fn(),setUser=vi.fn();
  vm.runInNewContext(source,{useEffect:(effect:()=>void)=>effect(),localStorage:{getItem:()=>token},fetch:boundary.request,browserSession:boundary,setCurrentUser:setUser,setSessionInitialized:initialized});
  expect(network).toHaveBeenCalledOnce();await boundary.change('B');await new Promise(resolve=>setImmediate(resolve));
  expect(token).toBe('B');expect(boundary.snapshot().token).toBe('B');expect(setUser).not.toHaveBeenCalled();
});
