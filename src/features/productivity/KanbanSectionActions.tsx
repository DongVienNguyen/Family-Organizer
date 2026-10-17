import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import type {TaskApi} from './api.js';
import type {BoardPage} from './boardClient.js';
import {createKanbanCommandState} from './kanbanCommandState.js';
import {KanbanSectionDialog} from './KanbanSectionDialog.js';
/** Mounted only for the current authorized section/rank projection. */
export function KanbanSectionActions({api,page,ready,onRefresh,children}:{api:TaskApi;page:BoardPage;ready:boolean;onRefresh():Promise<void>;children:(onMove:(id:string,targetColumnId?:string)=>void)=>ReactNode}){
 const latest=useRef({api,ready,onRefresh});latest.current={api,ready,onRefresh};
 const commands=useMemo(()=>createKanbanCommandState({...api,onCommitted:()=>latest.current.api===api&&latest.current.ready?latest.current.onRefresh():Promise.resolve()}),[api]),snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot),mounted=useRef<typeof commands|null>(null);
 const [choice,setChoice]=useState<{owner:typeof commands;taskId:string;target:string;beforeTaskId:string|null}|null>(null);
 useEffect(()=>{mounted.current=commands;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==commands)commands.dispose();});};},[commands]);
 useEffect(()=>{commands.select(ready?{kind:'canonical',page,rankSorted:true}:null);},[commands,ready,page]);
 const code=snapshot.error?.status;
 useEffect(()=>{if(code!==undefined&&code!==null&&[401,403,404].includes(code)){commands.clear();setChoice(null);if(latest.current.api===api&&latest.current.ready)void latest.current.onRefresh();}},[commands,api,code]);
 const task=ready&&choice?.owner===commands?page.columns.flatMap(c=>c.cards).find(c=>c.task.id===choice.taskId)?.task:undefined;
 const open=(id:string,targetColumnId?:string)=>{if(!ready||snapshot.writing||snapshot.previewing||!page.columns.some(c=>c.cards.some(card=>card.task.id===id)))return;commands.cancel();setChoice({owner:commands,taskId:id,target:targetColumnId&&page.columns.some(c=>c.id===targetColumnId)?targetColumnId:'',beforeTaskId:null});};
 const close=()=>{if(commands.cancel())setChoice(null);};
 return <>{children(open)}{task&&choice&&<KanbanSectionDialog task={task} columns={page.columns} target={choice.target} beforeTaskId={choice.beforeTaskId} orderCandidates={page.columns.find(c=>c.id===choice.target)?.cards.map(c=>({id:c.task.id,title:c.task.title}))??[]} plan={snapshot.plan?.kind==='physical'?snapshot.plan.value:null} busy={snapshot.writing||snapshot.previewing} ready={ready} error={snapshot.error}
  onTarget={target=>{if(snapshot.writing||snapshot.previewing)return;commands.cancel();setChoice({...choice,target,beforeTaskId:null});}}
  onBefore={beforeTaskId=>{if(snapshot.writing||snapshot.previewing)return;commands.cancel();setChoice({...choice,beforeTaskId});}}
  onPreview={()=>{if(choice.target)void commands.previewPhysical({viewId:page.viewId,taskId:task.id,targetColumnId:choice.target,beforeTaskId:choice.beforeTaskId,timezone:page.clock.timezone});}}
  onApply={()=>void commands.apply()} onCancel={close}/>}</>;
}
