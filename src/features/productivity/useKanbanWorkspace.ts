import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {useTasks} from './useTasks.js';
import {createKanbanState} from './kanbanState.js';
import {openCanonicalTask} from './openTask.js';
import type {SavedTaskView} from '../../../server/productivity/views.js';
export function useKanbanWorkspace(){
 const state=useTasks(),latest=useRef(state);latest.current=state;const controller=useMemo(()=>createKanbanState(state.api),[state.api]),mounted=useRef<typeof controller|null>(null),snapshot=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
 const [owned,setOwned]=useState<{owner:typeof controller;rows:SavedTaskView[]}|null>(null),[choice,setChoice]=useState<{owner:typeof controller;id:string}|null>(null),[timezone,setTimezone]=useState('Asia/Saigon'),[error,setError]=useState(false);
 const ready=state.enabled&&!state.loading&&!state.error&&state.online,views=ready&&owned?.owner===controller?owned.rows:[],selected=choice?.owner===controller?choice.id:'',view=views.find(v=>v.id===selected),selection=useRef(selected);selection.current=selected;
 useEffect(()=>{mounted.current=controller;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==controller)controller.dispose();});};},[controller]);
 useEffect(()=>{let cancelled=false;if(!ready){controller.clear();setOwned(null);return;}setError(false);state.api.views().then(rows=>{if(!cancelled)setOwned({owner:controller,rows:rows.filter(row=>row.config.kind==='kanban'&&row.config.boardId!==undefined&&['none','priority','assignee','due','tag'].includes(row.config.group))});}).catch(()=>{if(!cancelled){setOwned(null);controller.clear();setError(true);}});return()=>{cancelled=true;};},[controller,state.api,ready,state.queryEpoch]);
 const revision=view?.revision,group=view?.config.kind==='kanban'?view.config.group:undefined;
 useEffect(()=>{if(!ready||!view||group===undefined){controller.clear();return;}void controller.load({viewId:view.id,kind:group==='none'?'canonical':'grouped',timezone});},[controller,ready,selected,revision,group,timezone,state.queryEpoch]);
 const choose=(id:string)=>{controller.clear();setError(false);setChoice({owner:controller,id});};
 const open=async(id:string)=>{const current=latest.current,viewId=selection.current;if(!current.enabled||current.loading||current.error||!current.online||!viewId||mounted.current!==controller)return;setError(false);try{const opened=await openCanonicalTask({...current,current:()=>mounted.current===controller&&selection.current===viewId&&latest.current.enabled&&!latest.current.loading&&!latest.current.error&&latest.current.online},id);if(!opened&&mounted.current===controller)setError(true);}catch{if(mounted.current===controller)setError(true);}};
 return {state,controller,snapshot,ready,views,selected,choose,timezone,setTimezone,error,open};
}
