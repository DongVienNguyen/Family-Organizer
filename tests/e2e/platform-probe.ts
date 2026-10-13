// Static test-only JavaScript avoids serializing transpiler helper references.
// Never log arguments/results; native receivers, returns and errors are retained.
export const platformProbeSource=String.raw`function installPlatformProbe(target){
 const emit=(name,phase)=>target.console.log('B09_PLATFORM_BOUNDARY '+JSON.stringify({name,phase}));
 const wrap=(object,key,name)=>{
  if(!object){emit(name,'unavailable');return;}
  let owner=object,descriptor;
  while(owner&&!(descriptor=Object.getOwnPropertyDescriptor(owner,key)))owner=Object.getPrototypeOf(owner);
  if(!descriptor||!descriptor.configurable){emit(name,'unobservable');return;}
  const original=descriptor.get??descriptor.value;if(typeof original!=='function'){emit(name,'unobservable');return;}
  const observed=function(...args){emit(name,'before');try{const value=Reflect.apply(original,this,args);emit(name,'returned');return value;}catch(error){emit(name,'threw');throw error;}};
  Object.defineProperty(owner,key,{...descriptor,...(descriptor.get?{get:observed}:{value:observed})});emit(name,'installed');
 };
 wrap(target.Notification,'permission','Notification.permission');
 wrap(target.ServiceWorkerContainer?.prototype,'ready','ServiceWorkerContainer.ready');
 wrap(target.ServiceWorkerRegistration?.prototype,'pushManager','ServiceWorkerRegistration.pushManager');
 wrap(target.PushManager?.prototype,'getSubscription','PushManager.getSubscription');
}
`;
export const platformProbeScript=`(${platformProbeSource})(globalThis);`;
export function installPlatformProbe(target:any=globalThis){return new Function("target",`return (${platformProbeSource})(target);`)(target);}
