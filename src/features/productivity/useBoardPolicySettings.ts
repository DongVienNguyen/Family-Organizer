import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import type {TaskApi} from './api.js';
import {createBoardPolicyState} from './boardPolicyState.js';
export function useBoardPolicySettings({api,actorKey,viewId,boardId,ready,canManage,queryEpoch,onCommitted}:{api:TaskApi;actorKey:string;viewId?:string;boardId?:string;ready:boolean;canManage:boolean;queryEpoch:number;onCommitted():Promise<void>}){
 const latest=useRef({api,actorKey,ready,onCommitted});latest.current={api,actorKey,ready,onCommitted};
 const commands=useMemo(()=>createBoardPolicyState({...api,onCommitted:()=>latest.current.api===api&&latest.current.actorKey===actorKey&&latest.current.ready?latest.current.onCommitted():Promise.resolve()}),[api,actorKey]);
 const mounted=useRef<typeof commands|null>(null),snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot),selected=useRef(viewId);
 useEffect(()=>{mounted.current=commands;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==commands)commands.dispose();});};},[commands]);
 // An unloaded view during authorized refresh is not an explicit view change.
 // Hide its metadata first; only a completed read may retire the command owner.
 useEffect(()=>{if(!ready){commands.suspend();return;}if(selected.current!==viewId){commands.clear();selected.current=viewId;}if(!canManage||!boardId||!viewId){commands.clear();return;}void commands.load(boardId);},[commands,viewId,boardId,ready,canManage,queryEpoch]);
 const reload=()=>{if(ready&&canManage&&boardId&&commands.cancel())void commands.load(boardId);};
 return {commands,snapshot,reload};
}
