export interface WorkerWatchDependencies {container?:ServiceWorkerContainer;onWaiting:(worker:ServiceWorker)=>void;onControllerChanged:()=>void;onError:(error:unknown)=>void}
export function watchServiceWorker(deps:WorkerWatchDependencies):()=>void {
  const container=deps.container;if(!container)return()=>{};
  const hadController=!!container.controller;
  let alive=true,registration:ServiceWorkerRegistration|undefined,installing:ServiceWorker|null= null;
  const controllerChanged=()=>{if(alive&&hadController)deps.onControllerChanged();};
  const stateChanged=()=>{if(alive&&installing?.state==='installed'&&container.controller)deps.onWaiting(registration?.waiting??installing);};
  const updateFound=()=>{
    installing?.removeEventListener('statechange',stateChanged);
    installing=registration?.installing??null;installing?.addEventListener('statechange',stateChanged);
    stateChanged();
  };
  container.addEventListener('controllerchange',controllerChanged);
  void container.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
    if(!alive)return;registration=reg;
    if(reg.waiting)deps.onWaiting(reg.waiting);
    reg.addEventListener('updatefound',updateFound);updateFound();
  }).catch(error=>{if(alive)deps.onError(error);});
  return ()=>{
    alive=false;container.removeEventListener('controllerchange',controllerChanged);
    registration?.removeEventListener('updatefound',updateFound);installing?.removeEventListener('statechange',stateChanged);
  };
}
