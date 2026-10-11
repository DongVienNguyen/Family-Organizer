import type {SessionBoundary} from './sessionBoundary.js';
interface Dependencies {session:SessionBoundary;request:typeof fetch;publish:(url:string|undefined)=>void;createUrl:(blob:Blob)=>string;revokeUrl:(url:string)=>void;onUnavailable?:()=>void;subscribeInvalidations?:(listener:()=>void)=>()=>void}
export function createMediaResource(deps:Dependencies){
 let disposed=false,epoch=0,owned:string|undefined,controller:AbortController|undefined,selected:string|undefined;
 const clear=()=>{epoch++;controller?.abort();controller=undefined;if(owned){deps.revokeUrl(owned);owned=undefined;}deps.publish(undefined);};
 const load=async(url:string|undefined)=>{
  if(disposed)return;clear();selected=url;if(!url)return;
  if(!url.startsWith('/uploads/')){deps.publish(url);return;}
  const snapshot=deps.session.snapshot();if(snapshot.status!=='ready'||!snapshot.token)return;
  const checkSession=deps.session.capture(),generation=epoch,owner=new AbortController();controller=owner;
  const valid=()=>!disposed&&epoch===generation&&!owner.signal.aborted;
  try{
   const response=await deps.request(url,{headers:{Authorization:'Bearer '+snapshot.token},cache:'no-store',signal:owner.signal});
   if(!valid()){await response.body?.cancel().catch(()=>{});return;}checkSession();
   if(!response.ok){await response.body?.cancel().catch(()=>{});if(valid())deps.onUnavailable?.();return;}
   const blob=await response.blob();if(!valid())return;checkSession();
   owned=deps.createUrl(blob);deps.publish(owned);
  }catch{if(valid()){deps.publish(undefined);deps.onUnavailable?.();}}finally{if(controller===owner)controller=undefined;}
 };
 const unsubscribe=deps.session.subscribe(()=>{selected=undefined;clear();});
 const unwatch=deps.subscribeInvalidations?.(()=>{if(selected?.startsWith('/uploads/')){const url=selected;clear();void load(url);}});
 return {load,dispose:()=>{if(disposed)return;disposed=true;selected=undefined;clear();unsubscribe();unwatch?.();}};
}

const invalidators=new Set<()=>void>();
export function subscribeMediaInvalidation(listener:()=>void):()=>void {invalidators.add(listener);return()=>{invalidators.delete(listener);};}
export function invalidateManagedMedia():void {for(const listener of [...invalidators])listener();}
