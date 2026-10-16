import type {BoardPage,GroupedBoardPage,BoardReadOptions} from './boardClient.js';
import {appendCanonicalBoardPage,appendGroupedBoardPage} from './kanbanPages.js';
import {text,choice,keys,object} from './validation.js';
import {timezoneFormatter} from './dates.js';
export interface KanbanSelection {viewId:string;kind:'canonical'|'grouped';timezone:string}
export type KanbanProjection={kind:'canonical';value:BoardPage}|{kind:'grouped';value:GroupedBoardPage};
export interface KanbanReadState {selection:KanbanSelection|null;page:BoardPage|GroupedBoardPage|null;loading:boolean;loadingMore:boolean;error:{kind:'read-failed';status:number|null}|null}
const empty=():KanbanReadState=>({selection:null,page:null,loading:false,loadingMore:false,error:null});
const errorValue=(error:unknown):KanbanReadState['error']=>({kind:'read-failed',status:typeof(error as any)?.status==='number'&&Number.isInteger((error as any).status)&&(error as any).status>=400&&(error as any).status<=599?(error as any).status:null});
/** One transient actor/view read, independent of canonical cache and drafts.
 * Any new selection/authority clear invalidates every older async result. */
export function createKanbanState(ports:{board(id:string,options:BoardReadOptions):Promise<BoardPage>;groupedBoard(id:string,options:BoardReadOptions):Promise<GroupedBoardPage>}){
 let state=empty(),epoch=0,disposed=false,request:AbortController|undefined,last:KanbanSelection|undefined;const listeners=new Set<()=>void>();
 const publish=(next:KanbanReadState)=>{state=next;for(const listener of listeners)listener();};
 const read=(selection:KanbanSelection,signal:AbortSignal,cursor?:string)=>{const options={timezone:selection.timezone,signal,...(cursor===undefined?{}:{cursor})};return selection.kind==='canonical'?ports.board(selection.viewId,options):ports.groupedBoard(selection.viewId,options);};
 const load=async(input:KanbanSelection)=>{
  if(disposed)return;request?.abort();const current=++epoch,controller=new AbortController();request=controller;
  try{keys(object(input),['viewId','kind','timezone']);text(input.viewId,256);choice(input.kind,['canonical','grouped']);text(input.timezone,100);timezoneFormatter(input.timezone);}catch{last=undefined;publish({...empty(),error:errorValue(null)});return;}
  const selected=structuredClone(input);last=selected;publish({...empty(),selection:structuredClone(selected),loading:true});
  try{const page=await read(selected,controller.signal);if(!disposed&&current===epoch)publish({selection:structuredClone(selected),page:structuredClone(page),loading:false,loadingMore:false,error:null});}
  catch(error){if(!disposed&&current===epoch)publish({...empty(),selection:structuredClone(selected),error:errorValue(error)});}
 };
 return {snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},load,
  async more(){if(disposed||state.loading||state.loadingMore||state.error||!state.selection||!state.page?.nextCursor)return;const prior=state,selection=structuredClone(state.selection),cursor=state.page.nextCursor,current=epoch,controller=new AbortController();request=controller;publish({...state,loadingMore:true});
   try{const incoming=await read(selection,controller.signal,cursor);if(disposed||current!==epoch)return;const page=selection.kind==='canonical'?appendCanonicalBoardPage(prior.page as BoardPage,incoming as BoardPage,cursor):appendGroupedBoardPage(prior.page as GroupedBoardPage,incoming as GroupedBoardPage,cursor);publish({selection,page,loading:false,loadingMore:false,error:null});}
   catch(error){if(!disposed&&current===epoch)publish({...empty(),selection,error:errorValue(error)});}
  },
  refresh:()=>last?load(structuredClone(last)):Promise.resolve(),
  clear(){if(disposed)return;epoch++;request?.abort();request=undefined;last=undefined;publish(empty());},
  dispose(){if(disposed)return;disposed=true;epoch++;request?.abort();request=undefined;last=undefined;state=empty();listeners.clear();},
 };
}
