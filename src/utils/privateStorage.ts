export interface PrivateStorageDependencies {caches?:CacheStorage;indexedDB?:IDBFactory;ensureWorker:()=>Promise<void>}
const privateCache=(name:string)=>name.startsWith('family-api-')||name.startsWith('family-private-')||name==='family-wallet'||name.startsWith('family-wallet-');
const privateDatabase=(name:string)=>name==='family-organizer'||name==='family-private'||name.startsWith('family-organizer-')||name.startsWith('family-private-')||name==='family-wallet'||name.startsWith('family-wallet-');
export async function purgePrivateStorage(deps:PrivateStorageDependencies):Promise<void>{
  await deps.ensureWorker(); // An old controlling worker must not refill the caches.
  if(deps.caches){
    const storage=deps.caches;
    for(const name of await storage.keys()){
      if(privateCache(name)){
        await storage.delete(name);
        if((await storage.keys()).includes(name))throw new Error('Private cache deletion failed');
      }else if(name.startsWith('family-static-')){
        const cache=await storage.open(name);
        for(const request of await cache.keys()){
          if(request.headers.has('Authorization')||/^\/(?:api|uploads)(?:\/|$)/.test(new URL(request.url).pathname)){
            await cache.delete(request);
            if(await cache.match(request))throw new Error('Private cache entry deletion failed');
          }
        }
      }
    }
  }
  if(deps.indexedDB){
    const db=deps.indexedDB;
    const names=new Set(['family-organizer','family-private']);
    if(typeof db.databases==='function')for(const item of await db.databases())if(item.name&&privateDatabase(item.name))names.add(item.name);
    for(const name of names)await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('IndexedDB deletion timed out')),5000);
      try{
        const request=db.deleteDatabase(name);
        request.onsuccess=()=>{clearTimeout(timer);resolve();};
        request.onerror=()=>{clearTimeout(timer);reject(new Error('IndexedDB deletion failed'));};
        request.onblocked=()=>{clearTimeout(timer);reject(new Error('IndexedDB deletion blocked'));};
      }catch(error){clearTimeout(timer);reject(error);}
    });
  }
}
