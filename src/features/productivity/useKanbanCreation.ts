import {watchCatalogScope,type CatalogAuthority}from'./catalogAuthority.js';
import {UserRole}from'../../types.js';
import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import type {TaskApi} from './api.js';
import {createDraftCommandState} from './draftCommandState.js';
import {assertKanbanCreateDraft,type KanbanCreateDraft} from './kanbanCreateDraft.js';
type Result={kind:'view';result:Awaited<ReturnType<TaskApi['createKanbanView']>>}|{kind:'task';result:Awaited<ReturnType<TaskApi['createKanbanTask']>>};
export function useKanbanCreation({api,actorKey,actorRole,catalogAuthority,onCommitted}:{api:TaskApi;actorKey:string;actorRole?:UserRole;catalogAuthority:CatalogAuthority;onCommitted(result:Result):Promise<void>}){
 const latest=useRef({api,actorKey,onCommitted});latest.current={api,actorKey,onCommitted};
 const commands=useMemo(()=>createDraftCommandState<KanbanCreateDraft,Result>({validate:assertKanbanCreateDraft,send:async(draft,key)=>draft.kind==='view'?{kind:'view',result:await api.createKanbanView(draft.input,key)}:{kind:'task',result:await api.createKanbanTask(draft.board,draft.input,key)},onCommitted:result=>latest.current.api===api&&latest.current.actorKey===actorKey?latest.current.onCommitted(result):Promise.resolve()}),[api,actorKey]);
 const mounted=useRef<typeof commands|null>(null),snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot);
 useEffect(()=>{mounted.current=commands;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==commands)commands.dispose();});};},[commands]);
 useEffect(()=>watchCatalogScope(catalogAuthority,{scope:()=>{const s=commands.snapshot(),d=s.draft;if(d)return[d.kind==='view'?d.input.listId:d.board.listId];const r=s.last;return r?[r.kind==='view'?r.result.board.listId:r.result.task.listId]:[];},accepts:list=>actorRole===UserRole.ADMIN||actorRole===UserRole.MEMBER&&list.permission==='manage',onRevoked:commands.clear}),[catalogAuthority,commands,actorRole]);
 return {commands,snapshot};
}
