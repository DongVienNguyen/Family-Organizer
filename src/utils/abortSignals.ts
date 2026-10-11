/** Explicit disposal keeps caller listeners/timers from retaining finished work. */
export function combineAbortSignals(signals:AbortSignal[]):{signal:AbortSignal;dispose:()=>void}{
  if(typeof AbortSignal.any==='function')return {signal:AbortSignal.any(signals),dispose:()=>{}};
  const controller=new AbortController(),listeners=new Map<AbortSignal,()=>void>();
  const dispose=()=>{for(const [signal,listener] of listeners)signal.removeEventListener('abort',listener);listeners.clear();};
  for(const signal of signals){
    const abort=()=>{controller.abort(signal.reason);dispose();};
    if(signal.aborted){abort();break;}
    listeners.set(signal,abort);signal.addEventListener('abort',abort,{once:true});
  }
  return {signal:controller.signal,dispose};
}
export function abortDeadline(ms:number):{signal:AbortSignal;dispose:()=>void}{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Request deadline exceeded','TimeoutError')),ms);
  timer.unref?.();return {signal:controller.signal,dispose:()=>clearTimeout(timer)};
}
