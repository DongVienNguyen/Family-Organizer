import {watchCatalogScope,type CatalogAuthority}from'./catalogAuthority.js';
import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import type {TaskApi} from './api.js';
import type {SavedTaskView} from '../../../server/productivity/views.js';
import {createKanbanViewEditorState} from './kanbanViewEditorState.js';
/** Session owner remains mounted while an authorized catalog refresh hides UI. */
export function useKanbanViewEditor({api,actorKey,ready,viewsLoaded,view,allowed,readableListIds,catalogAuthority,authorityStatus,onCommitted}:{api:TaskApi;actorKey:string;ready:boolean;viewsLoaded:boolean;view?:SavedTaskView;allowed:boolean;readableListIds:string[];catalogAuthority:CatalogAuthority;authorityStatus?:number|null;onCommitted():Promise<void>}){
 const latest=useRef({api,actorKey,onCommitted});latest.current={api,actorKey,onCommitted};
 const commands=useMemo(()=>createKanbanViewEditorState({...api,onCommitted:()=>latest.current.api===api&&latest.current.actorKey===actorKey?latest.current.onCommitted():Promise.resolve()}),[api,actorKey]),mounted=useRef<typeof commands|null>(null),snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot),selected=useRef(view?.id);
 useEffect(()=>{mounted.current=commands;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==commands)commands.dispose();});};},[commands]);
 const scopes=snapshot.draft?.base.filter.listIds;
 // The completed Task catalog is authoritative before the owned-view reread
 // finishes. Retire inaccessible drafts then, rather than allowing a fast grant
 // restoration to resurrect their contents during that second async read.
 useEffect(()=>{if(!ready)return;if(scopes?.some(id=>!readableListIds.includes(id)))commands.clear();if(!viewsLoaded)return;if(selected.current!==view?.id){commands.clear();selected.current=view?.id;}if(!view||!allowed||authorityStatus!==undefined&&authorityStatus!==null&&[401,403,404].includes(authorityStatus))commands.clear();},[commands,ready,viewsLoaded,view?.id,allowed,authorityStatus,JSON.stringify(readableListIds),JSON.stringify(scopes)]);
 useEffect(()=>watchCatalogScope(catalogAuthority,{scope:()=>commands.snapshot().draft?.base.filter.listIds??[],accepts:()=>true,onRevoked:commands.clear}),[catalogAuthority,commands]);
 return {commands,snapshot};
}
