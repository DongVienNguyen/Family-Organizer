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

it('overlapping tab logins converge on the stored token despite earlier queued events',async()=>{
  let stored:string|null=null;const events:{tab:number;newValue:string|null}[]=[],handlers:Function[]=[];
  const storage={getItem:()=>stored};
  const boundaries=[0,1].map(tab=>createSessionBoundary({origin:'https://family.test',readToken:()=>stored,writeToken:value=>{if(stored!==value){stored=value;events.push({tab:1-tab,newValue:value});}},purge:async()=>{},request:vi.fn() as any}));
  const main=fs.readFileSync(new URL('../../src/main.tsx',import.meta.url),'utf8');const listener=main.slice(main.indexOf("window.addEventListener('storage'"),main.indexOf('\n\ncreateRoot'));
  for(const boundary of boundaries)vm.runInNewContext(listener,{window:{addEventListener:(_event:string,handler:Function)=>handlers.push(handler)},localStorage:storage,browserSession:boundary});
  await Promise.all(boundaries.map(boundary=>boundary.change(null,false)));
  await Promise.all([boundaries[0].change('A'),boundaries[1].change('B')]);expect(stored).toBe('B');
  for(const event of events)handlers[event.tab]({...event,key:'family_token',storageArea:storage});
  await new Promise(resolve=>setImmediate(resolve));
  expect(boundaries.map(boundary=>boundary.snapshot())).toEqual([expect.objectContaining({status:'ready',token:'B'}),expect.objectContaining({status:'ready',token:'B'})]);
  const writes=events.length;await boundaries[1].retry();expect(boundaries[1].snapshot()).toMatchObject({status:'ready',token:'B'});expect(events).toHaveLength(writes);
});
