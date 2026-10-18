import type {TaskQueryInput,TaskQueryPage,TaskRecord,QueryClock} from './contracts.js';
export type TaskQueryStart=Exclude<TaskQueryInput,{queryId:string;cursor:string}>;
export interface TaskQueryState {items:TaskRecord[];totalUnique:number;queryId:string|null;clock:QueryClock|null;nextCursor:string|null;loading:boolean;loadingMore:boolean;error:string}
const empty=():TaskQueryState=>({items:[],totalUnique:0,queryId:null,clock:null,nextCursor:null,loading:false,loadingMore:false,error:''});
/** A projection owns its responses, never the full authorized task cache or drafts. */
export function createTaskQueryState(ports:{query:(input:TaskQueryInput,signal?:AbortSignal)=>Promise<TaskQueryPage>}){
 let state=empty(),epoch=0,disposed=false,request:AbortController|undefined,lastInput:TaskQueryStart|undefined;const listeners=new Set<()=>void>();
 const publish=(value:TaskQueryState)=>{state=value;for(const listener of listeners)listener();};
 const valid=(page:TaskQueryPage,prior:TaskQueryState|null)=>{if(prior&&(page.queryId!==prior.queryId||JSON.stringify(page.clock)!==JSON.stringify(prior.clock)||page.totalUnique!==prior.totalUnique))throw Error('Kết quả công việc đã thay đổi; tải lại.');const items=[...(prior?.items??[]),...page.items];if(new Set(items.map(row=>row.id)).size!==items.length||items.length>page.totalUnique)throw Error('Kết quả công việc không nhất quán.');return {...page,items,loading:false,loadingMore:false,error:''};};
 const load=async(input:TaskQueryStart)=>{
  if(disposed)return;lastInput=structuredClone(input);request?.abort();const current=++epoch,controller=new AbortController();request=controller;publish({...empty(),loading:true});
  try{const page=await ports.query(structuredClone(input),controller.signal);if(!disposed&&current===epoch)publish(valid(page,null));}
  catch(error){if(!disposed&&current===epoch)publish({...empty(),error:error instanceof Error?error.message:'Không tải được công việc.'});}
 };
 return {snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},load,
  async more(){if(disposed||state.loading||state.loadingMore||!state.queryId||!state.nextCursor)return;const prior=state,current=epoch,controller=new AbortController();request=controller;publish({...state,loadingMore:true,error:''});try{const page=await ports.query({queryId:prior.queryId!,cursor:prior.nextCursor!},controller.signal);if(!disposed&&current===epoch)publish(valid(page,prior));}catch(error){if(!disposed&&current===epoch)publish({...empty(),error:error instanceof Error?error.message:'Không tải được công việc.'});}},
  clear(){epoch++;request?.abort();publish(empty());},
  refresh:()=>lastInput?load(lastInput):Promise.resolve(),
  dispose(){disposed=true;epoch++;request?.abort();state=empty();listeners.clear();},
 };
}
