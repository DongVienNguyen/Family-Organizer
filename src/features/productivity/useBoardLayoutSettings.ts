import {useEffect,useMemo,useRef,useSyncExternalStore}from'react';
import type {TaskApi}from'./api.js';
import type {SavedTaskView}from'../../../server/productivity/views.js';
import {createBoardLayoutState}from'./boardLayoutState.js';
/** Above transient board renders: authorization reads hide data, not intent. */
export function useBoardLayoutSettings({api,actorKey,ready,viewsLoaded,canManage,view,queryEpoch,onCommitted}:{api:TaskApi;actorKey:string;ready:boolean;viewsLoaded:boolean;canManage:boolean;view:SavedTaskView|undefined;queryEpoch:number;onCommitted():Promise<void>}){
 const latest=useRef({api,actorKey,ready,onCommitted});latest.current={api,actorKey,ready,onCommitted};const commands=useMemo(()=>createBoardLayoutState({...api,onCommitted:()=>latest.current.api===api&&latest.current.actorKey===actorKey&&latest.current.ready?latest.current.onCommitted():Promise.resolve()}),[api,actorKey]),mounted=useRef<typeof commands|null>(null),snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot);
 useEffect(()=>{mounted.current=commands;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==commands)commands.dispose();});};},[commands]);
 const c=view?.config,boardId=c?.kind==='kanban'?c.boardId:undefined,mode=c?.kind==='kanban'?c.mode:undefined,group=c?.kind==='kanban'?c.group:undefined;
 useEffect(()=>{if(!canManage){commands.clear();return;}if(!ready||!viewsLoaded){commands.suspend();return;}if(!view||!boardId||mode!=='sections'||group!=='none'){commands.clear();return;}void commands.load({viewId:view.id,boardId});},[commands,ready,viewsLoaded,canManage,view?.id,view?.revision,boardId,mode,group,queryEpoch]);
 const reload=()=>{if(ready&&canManage&&view&&boardId&&mode==='sections'&&group==='none')void commands.load({viewId:view.id,boardId});};
 return{commands,snapshot,reload};
}
