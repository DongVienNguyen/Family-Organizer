export interface PrivacyWorkerDependencies {container?:ServiceWorkerContainer;query?:(worker:ServiceWorker|null)=>Promise<boolean>;timeoutMs?:number}
export async function queryPrivacyPolicy(worker:ServiceWorker|null):Promise<boolean>{
  if(!worker)return false;
  return new Promise<boolean>(resolve=>{
    const channel=new MessageChannel();
    const finish=(safe:boolean)=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(safe);};
    const timer=setTimeout(()=>finish(false),500);
    channel.port1.onmessage=event=>finish(event.data?.privacyPolicy===1);
    try{worker.postMessage('GET_PRIVACY_POLICY',[channel.port2]);}catch{finish(false);}
  });
}
export async function ensurePrivacyWorker(deps:PrivacyWorkerDependencies):Promise<void>{
  const container=deps.container;if(!container)return;
  const query=deps.query??queryPrivacyPolicy;
  if(await query(container.controller))return;
  const timeout=deps.timeoutMs??15000,deadline=Date.now()+timeout;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const expired=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Privacy worker verification timed out')),timeout);});
  try{
    await Promise.race([(async()=>{
      const registration=await container.register('/sw.js',{updateViaCache:'none'});
      // Registration already attempts update; an unavailable network must not
      // prevent an installed safe worker from taking control.
      void registration.update().catch(()=>{});
      while(Date.now()<deadline){
        registration.waiting?.postMessage('SKIP_WAITING');
        if(await query(container.controller))return;
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      throw new Error('Privacy worker did not take control');
    })(),expired]);
  }finally{clearTimeout(timer);}
}
