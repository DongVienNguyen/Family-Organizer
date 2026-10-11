export interface RealtimePayload {type:string}
export interface RealtimeClientOptions {token:string;request:typeof fetch;checkSession:()=>void;onOnline:(online:boolean)=>void;onMessage:(payload:RealtimePayload)=>void;retryMs?:number}
export function startAuthenticatedRealtime(options:RealtimeClientOptions):{close:()=>void;closed:Promise<void>}{
  const owner=new AbortController();let active=true,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const stale=()=>new DOMException('Realtime connection closed','AbortError');
  const assert=()=>{if(!active||owner.signal.aborted)throw stale();options.checkSession();};
  const valid=()=>{try{assert();return true;}catch{return false;}};
  let rejectAbort!:(reason:unknown)=>void;const aborted=new Promise<never>((_resolve,reject)=>{rejectAbort=()=>reject(stale());owner.signal.addEventListener('abort',rejectAbort,{once:true});});void aborted.catch(()=>{});
  const wait=()=>new Promise<void>((resolve,reject)=>{
    const dispose=()=>{clearTimeout(timer);owner.signal.removeEventListener('abort',stop);};
    const stop=()=>{dispose();reject(stale());};const timer=setTimeout(()=>{dispose();resolve();},options.retryMs??1000);owner.signal.addEventListener('abort',stop,{once:true});if(owner.signal.aborted)stop();
  });
  const close=()=>{active=false;owner.abort();if(reader)void reader.cancel().catch(()=>{});};
  const closed=(async()=>{
    try{while(valid()){
      let response:Response|undefined;
      try{
        assert();const pending=options.request('/api/realtime',{headers:{Authorization:'Bearer '+options.token,Accept:'text/event-stream'},cache:'no-store',signal:owner.signal});
        void pending.then(response=>{if(!active||owner.signal.aborted)void response.body?.cancel().catch(()=>{});},()=>{});
        response=await Promise.race([pending,aborted]);assert();
        if(response.status===401||response.status===403){await response.body?.cancel();if(valid())options.onOnline(false);return;}
        if(!response.ok||!/^text\/event-stream(?:;|$)/i.test(response.headers.get('Content-Type')??'')||!response.body){await response.body?.cancel();throw new Error('Invalid realtime response');}
        reader=response.body.getReader();options.onOnline(true);const decoder=new TextDecoder(),encoder=new TextEncoder();let buffer='';
        while(valid()){
          const next=await Promise.race([reader.read(),aborted]);assert();if(next.done)break;
          if(next.value.byteLength>1024*1024)throw new Error('Realtime chunk too large');
          buffer+=decoder.decode(next.value,{stream:true});let boundary:RegExpExecArray|null;
          while((boundary=/\r?\n\r?\n/.exec(buffer))){
            const frame=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);
            if(encoder.encode(frame).byteLength>65536)throw new Error('Realtime frame too large');
            const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
            if(!data)continue;const payload=JSON.parse(data);if(!payload||typeof payload.type!=='string'||!payload.type||payload.type.length>64)throw new Error('Invalid realtime event');
            assert();options.onMessage({type:payload.type});
          }
          if(encoder.encode(buffer).byteLength>65536)throw new Error('Realtime frame too large');
        }
      }catch{if(!valid())return;}
      finally{if(reader){try{await reader.cancel();}catch{/* Transport already aborted/errored. */}finally{reader.releaseLock();reader=undefined;}}else{try{await response?.body?.cancel();}catch{/* A stale boundary already aborted its transport. */}}}
      if(!valid())return;options.onOnline(false);await wait();
    }}catch{/* Owned close/session change terminates retries. */}
    finally{active=false;owner.abort();owner.signal.removeEventListener('abort',rejectAbort);}
  })();
  return {close,closed};
}
