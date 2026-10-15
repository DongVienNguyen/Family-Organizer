import type {TaskCache} from './taskCache.js';
/** Query projections never establish full-cache visibility. */
export async function openCanonicalTask(ports:{cache:Pick<TaskCache,'record'>;refresh:()=>Promise<void>;open:(id:string)=>boolean;current:()=>boolean},id:string):Promise<boolean>{
 if(!ports.current())return false;
 if(!ports.cache.record(id))await ports.refresh();
 return ports.current()&&!!ports.cache.record(id)&&ports.open(id);
}
/** A known create result still waits for the latest full authorization refresh. */
export function openCreatedCanonicalTask(ports:{ready:boolean;cache:Pick<TaskCache,'record'>;open:(id:string)=>boolean;current:()=>boolean},id:string):'waiting'|'opened'|'unavailable' {
 if(!ports.current())return 'unavailable';if(!ports.ready)return 'waiting';return ports.cache.record(id)&&ports.open(id)?'opened':'unavailable';
}
