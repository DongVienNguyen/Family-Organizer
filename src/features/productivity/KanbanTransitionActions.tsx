import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import type {TaskApi} from './api.js';
import type {BoardPage} from './boardClient.js';
import {createKanbanCommandState} from './kanbanCommandState.js';
import {KanbanTransitionDialog} from './KanbanTransitionDialog.js';
/** Mounted only for the current authorized active workflow projection. */
export function KanbanTransitionActions({api,page,ready,onRefresh,children}:{api:TaskApi;page:BoardPage;ready:boolean;onRefresh():Promise<void>;children:(onTransition:(id:string,targetColumnId?:string)=>void)=>ReactNode}){
 const latest=useRef({api,ready,onRefresh});latest.current={api,ready,onRefresh};
 const commands=useMemo(()=>createKanbanCommandState({...api,onCommitted:()=>latest.current.api===api&&latest.current.ready?latest.current.onRefresh():Promise.resolve()}),[api]),snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot),mounted=useRef<typeof commands|null>(null);
 const [choice,setChoice]=useState<{owner:typeof commands;taskId:string;target:string}|null>(null);
 useEffect(()=>{mounted.current=commands;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==commands)commands.dispose();});};},[commands]);
 useEffect(()=>{commands.select(ready?{kind:'canonical',page,rankSorted:false}:null);},[commands,ready,page]);
 const code=snapshot.error?.status;
 useEffect(()=>{if(code!==undefined&&code!==null&&[401,403,404].includes(code)){commands.clear();setChoice(null);if(latest.current.api===api&&latest.current.ready)void latest.current.onRefresh();}},[commands,api,code]);
 const candidate=ready&&choice?.owner===commands?page.columns.flatMap(c=>c.cards).find(c=>c.task.id===choice.taskId)?.task:undefined,task=candidate&&!candidate.pendingApproval&&candidate.deletedAt===null&&['todo','in_progress'].includes(candidate.lifecycle)?candidate:undefined,columns=page.columns.filter(c=>['todo','doing','waiting'].includes(c.columnKey??'')&&!c.cards.some(card=>card.task.id===task?.id));
 const open=(id:string,targetColumnId?:string)=>{if(!ready||snapshot.writing||snapshot.previewing||!page.columns.some(c=>c.cards.some(card=>card.task.id===id&&!card.task.pendingApproval&&card.task.deletedAt===null&&['todo','in_progress'].includes(card.task.lifecycle))))return;if(targetColumnId&&!page.columns.some(c=>c.id===targetColumnId&&['todo','doing','waiting'].includes(c.columnKey)&&!c.cards.some(card=>card.task.id===id)))return;commands.cancel();setChoice({owner:commands,taskId:id,target:targetColumnId??''});};
 const close=()=>{if(commands.cancel())setChoice(null);};
 return <>{children(open)}{task&&choice&&<KanbanTransitionDialog task={task} columns={columns} target={choice.target} plan={snapshot.plan?.kind==='active'?snapshot.plan.value:null} busy={snapshot.writing||snapshot.previewing} ready={ready} error={snapshot.error}
  onTarget={target=>{if(snapshot.writing||snapshot.previewing)return;commands.cancel();setChoice({...choice,target});}}
  onPreview={()=>{if(columns.some(c=>c.id===choice.target))void commands.previewTransition({viewId:page.viewId,taskId:task.id,targetColumnId:choice.target,timezone:page.clock.timezone});}}
  onApply={()=>void commands.apply()} onCancel={close}/>}</>;
}
