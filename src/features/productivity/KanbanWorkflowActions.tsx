import {workflowCompletionProof}from'./workflowApi.js';
import React,{useEffect,useMemo,useRef,useSyncExternalStore,type ReactNode}from'react';
import type {TaskApi}from'./api.js';
import type {BoardPage}from'./boardClient.js';
import {createKanbanCommandState}from'./kanbanCommandState.js';
import {KanbanWorkflowDialog}from'./KanbanWorkflowDialog.js';
export interface WorkflowDraft{taskId:string;proof:string}
/** Draft ownership lives above projection reloads; plans/UUIDs stay transient. */
export function KanbanWorkflowActions({api,page,ready,draft,onDraft,onReload,onRefresh,children}:{api:TaskApi;page:BoardPage;ready:boolean;draft:WorkflowDraft|null;onDraft(value:WorkflowDraft|null):void;onReload():Promise<void>;onRefresh():Promise<void>;children:(complete:(id:string)=>void)=>ReactNode}){
 const latest=useRef({api,ready,onRefresh});latest.current={api,ready,onRefresh};const commands=useMemo(()=>createKanbanCommandState({...api,onCommitted:()=>latest.current.api===api&&latest.current.ready?latest.current.onRefresh():Promise.resolve()}),[api]),snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot),mounted=useRef<typeof commands|null>(null);
 useEffect(()=>{mounted.current=commands;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==commands)commands.dispose();});};},[commands]);useEffect(()=>{commands.select(ready?{kind:'canonical',page,rankSorted:false}:null);},[commands,ready,page]);
 const status=snapshot.error?.status;useEffect(()=>{if(status!==undefined&&status!==null&&[401,403,404].includes(status)){commands.clear();onDraft(null);if(latest.current.api===api&&latest.current.ready)void latest.current.onRefresh();}},[commands,api,status,onDraft]);
 const candidate=draft?page.columns.flatMap(c=>c.cards).find(c=>c.task.id===draft.taskId)?.task:undefined,terminal=!!candidate&&(candidate.pendingApproval||candidate.deletedAt!==null||['completed','wont_do'].includes(candidate.lifecycle)),task=ready&&![401,403,404].includes(status??0)&&!terminal?candidate:undefined,target=page.columns.find(c=>c.columnKey==='done')?.id;
 useEffect(()=>{if(terminal)onDraft(null);},[terminal,onDraft]);
 const open=(id:string)=>{if(!ready||snapshot.writing||snapshot.previewing||!target)return;const task=page.columns.flatMap(c=>c.cards).find(c=>c.task.id===id)?.task;if(!task||task.pendingApproval||task.deletedAt!==null||['completed','wont_do'].includes(task.lifecycle))return;commands.cancel();onDraft({taskId:id,proof:''});};const close=()=>{if(commands.cancel())onDraft(null);};
 return <>{children(open)}{task&&target&&draft&&<KanbanWorkflowDialog task={task} target={target} plan={snapshot.plan?.kind==='workflow'?snapshot.plan.value:null} proofNote={draft.proof} proofLocked={!commands.canEditProof()} ready={ready} busy={snapshot.writing||snapshot.previewing} error={snapshot.error} onProof={proof=>{if(commands.canEditProof())onDraft({...draft,proof});}} onPreview={()=>void commands.previewWorkflow({viewId:page.viewId,taskId:task.id,targetColumnId:target,timezone:page.clock.timezone})} onApply={()=>void commands.apply(workflowCompletionProof(draft.proof))} onReload={()=>{if(commands.cancel())void onReload();}} onCancel={close}/>}</>;
}
