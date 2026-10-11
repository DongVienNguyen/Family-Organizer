import fs from 'node:fs';
import vm from 'node:vm';
import { expect,it,vi } from 'vitest';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(){
  const handlers=new Map<string,Function>(),stores=new Map<string,Map<string,Response>>();
  const key=(request:any)=>new URL(typeof request==='string'?request:request.url,'https://family.test').href;
  const caches={keys:async()=>[...stores.keys()],delete:async(name:string)=>stores.delete(name),open:async(name:string)=>{
    if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name)!;
    return {addAll:async()=>{},put:async(req:any,res:Response)=>{store.set(key(req),res);},match:async(req:any)=>store.get(key(req))};
  },match:async(req:any)=>{for(const store of stores.values())if(store.has(key(req)))return store.get(key(req));}};
  const network=vi.fn(async()=>new Response('synthetic-private',{status:200,headers:{'Cache-Control':'no-store'}}));
  const self={location:{origin:'https://family.test'},addEventListener:(name:string,fn:Function)=>handlers.set(name,fn),clients:{claim:async()=>{}},skipWaiting:vi.fn()};
  vm.runInNewContext(source,{self,caches,fetch:network,URL,console});
  return {stores,caches,network,self,async dispatch(request:Request){let response:Promise<Response>|undefined;handlers.get('fetch')!({request,respondWith:(value:Promise<Response>)=>{response=value;}});if(response)await response;await new Promise(resolve=>setImmediate(resolve));},async lifecycle(name:string){let waiting:Promise<unknown>|undefined;handlers.get(name)!({waitUntil:(value:Promise<unknown>)=>{waiting=value;}});await waiting;},message(data:any){const port={postMessage:vi.fn()};handlers.get('message')!({data,ports:[port]});return port;}};
}
it('never persists authenticated API data even when the server succeeds',async()=>{const w=worker();await w.dispatch(new Request('https://family.test/api/finance',{headers:{Authorization:'Bearer synthetic'}}));expect([...w.stores.values()].flatMap(s=>[...s.keys()])).toEqual([]);});
it('never persists private uploads through static-image matching',async()=>{const w=worker();await w.dispatch(new Request('https://family.test/uploads/receipts/synthetic.png'));expect([...w.stores.values()].flatMap(s=>[...s.keys()])).toEqual([]);});
it('removes old family API and mixed static caches during activation but preserves other applications',async()=>{const w=worker();w.stores.set('family-api-v4',new Map());w.stores.set('family-static-v4',new Map());w.stores.set('unrelated-public-cache',new Map());await w.lifecycle('activate');expect(w.stores.has('family-api-v4')).toBe(false);expect(w.stores.has('family-static-v4')).toBe(false);expect(w.stores.has('unrelated-public-cache')).toBe(true);});
it('refuses to store a no-store response even at a public static asset URL',async()=>{const w=worker();await w.dispatch(new Request('https://family.test/assets/synthetic.js'));expect([...w.stores.values()].flatMap(s=>[...s.keys()])).toEqual([]);});
it.each([{'Cache-Control':'private'},{Vary:'Authorization'},{Vary:'*'},{'Set-Cookie':'synthetic=private'}])('refuses private or varying static response %j',async headers=>{const w=worker();w.network.mockImplementation(async()=>new Response('synthetic',{headers}));await w.dispatch(new Request('https://family.test/assets/synthetic.js'));expect([...w.stores.values()].flatMap(s=>[...s.keys()])).toEqual([]);});
it('preserves caching of uncredentialed public assets',async()=>{const w=worker();w.network.mockImplementation(async()=>new Response('synthetic-public',{headers:{'Cache-Control':'public,max-age=60'}}));await w.dispatch(new Request('https://family.test/assets/synthetic.js'));expect([...w.stores.values()].flatMap(s=>[...s.keys()])).toEqual(['https://family.test/assets/synthetic.js']);});
it('does not cache a credentialed request even at an assets URL',async()=>{const w=worker();w.network.mockImplementation(async()=>new Response('synthetic',{headers:{'Cache-Control':'public'}}));await w.dispatch(new Request('https://family.test/assets/synthetic.js',{headers:{Authorization:'Bearer synthetic'}}));expect([...w.stores.values()].flatMap(s=>[...s.keys()])).toEqual([]);});
it('automatically activates the security migration over legacy workers but retains waiting for later ordinary updates',async()=>{const old=worker();old.stores.set('family-static-v4',new Map());await old.lifecycle('install');expect(old.self.skipWaiting).toHaveBeenCalledOnce();const current=worker();current.stores.set('family-static-v5',new Map());await current.lifecycle('install');expect(current.self.skipWaiting).not.toHaveBeenCalled();});
it('acknowledges the private-cache policy before a page may restore its session',()=>{expect(worker().message('GET_PRIVACY_POLICY').postMessage).toHaveBeenCalledWith({privacyPolicy:1});});
