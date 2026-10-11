import {combineAbortSignals,abortDeadline} from './abortSignals.js';
export interface SessionSnapshot {revision:number;status:'clearing'|'ready'|'error';token:string|null;error?:string}
export interface SessionBoundaryDependencies {origin:string;request:typeof fetch;readToken:()=>string|null;writeToken:(token:string|null)=>void;purge:()=>Promise<void>}
export interface SessionBoundary {snapshot:()=>SessionSnapshot;subscribe:(listener:()=>void)=>()=>void;change:(token:string|null,persist?:boolean)=>Promise<void>;retry:()=>Promise<void>;capture:()=>()=>void;request:typeof fetch}
const stale=()=>new DOMException('Phiên đăng nhập đã kết thúc.','AbortError');
export function createSessionBoundary(deps:SessionBoundaryDependencies):SessionBoundary {
  let current:SessionSnapshot={revision:0,status:'clearing',token:null};
  const listeners=new Set<()=>void>(),owners=new Set<AbortController>();
  let intendedToken:string|null=null,intendedPersist=true,cleanup:Promise<void>|undefined;
  const publish=(next:SessionSnapshot)=>{current=next;for(const listener of listeners)listener();};
  const purge=()=>{
    const pending=cleanup?cleanup.catch(()=>{}).then(()=>deps.purge()):deps.purge();
    cleanup=pending;
    void pending.finally(()=>{if(cleanup===pending)cleanup=undefined;}).catch(()=>{});
    return pending;
  };
  const change=async(token:string|null,persist=true)=>{
    intendedToken=token;intendedPersist=persist;
    const revision=current.revision+1;
    for(const owner of owners)owner.abort();owners.clear();
    publish({revision,status:'clearing',token:null});
    try {
      if(persist)deps.writeToken(null);
      await purge();
      if(current.revision!==revision)return;
      if(persist)deps.writeToken(token);
      // Storage events are queued notifications; their values may already be obsolete.
      // A non-writing transition adopts the authoritative token after cleanup.
      const readyToken=persist?token:deps.readToken();
      intendedToken=readyToken;
      publish({revision,status:'ready',token:readyToken});
    } catch(error) {
      if(current.revision===revision)publish({revision,status:'error',token:null,error:'Không thể dọn dữ liệu phiên. Hãy thử lại.'});
      throw error;
    }
  };
  const request:typeof fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),deps.origin);
    const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
    const internal=url.origin===deps.origin && (/^\/(?:api|uploads)(?:\/|$)/.test(url.pathname)||headers.has('Authorization'));
    if(!internal)return deps.request(input,init);
    const captured=current,owner=new AbortController();
    const caller=init?.signal??(input instanceof Request?input.signal:undefined);
    const deadline=abortDeadline(120000),combined=combineAbortSignals([owner.signal,deadline.signal,...(caller?[caller]:[])]),signal=combined.signal;
    const releaseOwner=()=>{owners.delete(owner);combined.dispose();deadline.dispose();};
    const assert=()=>{
      if(current.status!=='ready'||current.revision!==captured.revision||current.token!==captured.token||deps.readToken()!==captured.token||signal.aborted)throw stale();
    };
    try{assert();if(headers.has('Authorization') && headers.get('Authorization')!=='Bearer '+captured.token)throw stale();}catch(error){releaseOwner();throw error;}
    owners.add(owner);signal.addEventListener('abort',releaseOwner,{once:true});
    let copies=0;
    const guardStream=(stream:ReadableStream<Uint8Array>,complete:()=>void):ReadableStream<Uint8Array>=>new Proxy(stream,{
      get(target,property){
        if(property==='getReader')return (...args:any[])=>{
          assert();const reader=(target.getReader as Function).apply(target,args);
          return new Proxy(reader,{get(r,p){
            if(p==='read')return async(...values:any[])=>{assert();const result=await r.read(...values);assert();if(result.done)complete();return result;};
            if(p==='cancel')return async(...values:any[])=>{try{return await r.cancel(...values);}finally{complete();}};
            const value=Reflect.get(r,p,r);return typeof value==='function'?value.bind(r):value;
          }});
        };
        if(property==='tee')return ()=>{assert();let remaining=2;return target.tee().map(stream=>{let done=false;return guardStream(stream,()=>{if(!done){done=true;if(--remaining===0)complete();}});});};
        if(property==='pipeTo')return (destination:WritableStream,options:StreamPipeOptions={})=>{assert();const pipe=combineAbortSignals([signal,...(options.signal?[options.signal]:[])]);return target.pipeTo(destination,{...options,signal:pipe.signal}).finally(()=>{pipe.dispose();complete();});};
        if(property==='pipeThrough')return (transform:ReadableWritablePair,options:StreamPipeOptions={})=>{assert();const pipe=combineAbortSignals([signal,...(options.signal?[options.signal]:[])]);try{return guardStream(target.pipeThrough(transform,{...options,signal:pipe.signal}),()=>{pipe.dispose();complete();});}catch(error){pipe.dispose();throw error;}};
        if(property===Symbol.asyncIterator||property==='values')return async function*(){const reader=guardStream(target,complete).getReader();try{while(true){const next=await reader.read();if(next.done)return;yield next.value;}}finally{reader.releaseLock();}};
        const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
      },
    });
    const guardResponse=(response:Response):Response=>{
      copies++;let completed=false;const complete=()=>{if(!completed){completed=true;if(--copies===0)releaseOwner();}};
      return new Proxy(response,{
      get(target,property){
        if(['json','text','blob','arrayBuffer','formData','bytes'].includes(String(property)))return async(...args:any[])=>{
          assert();try{const result=await (target as any)[property](...args);assert();return result;}finally{complete();}
        };
        if(property==='clone')return ()=>{assert();return guardResponse(target.clone());};
        if(property==='body'){assert();return target.body?guardStream(target.body,complete):null;}
        const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
      },
    });};
    let rejectAbort!:(reason:unknown)=>void;
    const aborted=new Promise<never>((_resolve,reject)=>{rejectAbort=()=>reject(stale());signal.addEventListener('abort',rejectAbort,{once:true});});
    try {
      const response=await Promise.race([deps.request(input,{...init,cache:'no-store',signal}),aborted]);
      assert();
      if(response.status===401 && captured.token){void change(null).catch(()=>{});throw stale();}
      return guardResponse(response);
    } catch(error) {releaseOwner();throw error;}
    finally {signal.removeEventListener('abort',rejectAbort);}
  };
  const capture=()=>{const revision=current.revision,token=current.token;return()=>{if(current.status!=='ready'||current.revision!==revision||current.token!==token||deps.readToken()!==token)throw stale();};};
  return {snapshot:()=>current,subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},change,retry:()=>change(intendedToken,intendedPersist),capture,request};
}
