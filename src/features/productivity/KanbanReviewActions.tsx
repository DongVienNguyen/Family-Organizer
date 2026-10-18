import React,{useEffect,useRef,useSyncExternalStore,type ReactNode}from'react';
import type {TaskApi}from'./api.js';
import type {TaskRecord}from'./contracts.js';
import type {BoardPage}from'./boardClient.js';
import type {createReviewCommandState}from'./reviewCommandState.js';
import {KanbanReviewDialog}from'./KanbanReviewDialog.js';
export interface ReviewDraft{taskId:string;operation:'approve'|'reject';reason:string}
/** The API-session owner is supplied by the persistent workspace. */
export function KanbanReviewActions({api,commands,page,ready,allowed,draft,onDraft,onReload,onRefresh,children}:{api:TaskApi;commands:ReturnType<typeof createReviewCommandState>;page:BoardPage;ready:boolean;allowed(task:TaskRecord):boolean;draft:ReviewDraft|null;onDraft(value:ReviewDraft|null):void;onReload():Promise<void>;onRefresh():Promise<void>;children:(review:(id:string,operation:'approve'|'reject')=>void)=>ReactNode}){
 const latest=useRef({api,ready,onRefresh});latest.current={api,ready,onRefresh};const snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot);
 const status=snapshot.error?.status,candidate=draft?page.columns.flatMap(c=>c.cards).find(c=>c.task.id===draft.taskId)?.task:undefined,terminal=!!candidate&&(!candidate.pendingApproval||candidate.deletedAt!==null||candidate.lifecycle!=='in_progress'),denied=!!candidate&&!allowed(candidate),task=ready&&!terminal&&!denied&&![401,403,404].includes(status??0)?candidate:undefined;
 useEffect(()=>{commands.select(task??null);},[commands,task]);
 useEffect(()=>{if(terminal||denied)onDraft(null);},[terminal,denied,onDraft]);
 useEffect(()=>{if(status!==undefined&&status!==null&&[401,403,404].includes(status)){commands.select(null);onDraft(null);if(latest.current.api===api&&latest.current.ready)void latest.current.onRefresh();}},[commands,api,status,onDraft]);
 const open=(id:string,operation:'approve'|'reject')=>{if(!ready||page.mode!=='workflow'||snapshot.writing||snapshot.locked)return;const task=page.columns.flatMap(c=>c.cards).find(c=>c.task.id===id)?.task;if(!task||!allowed(task)||!task.pendingApproval||task.deletedAt!==null||task.lifecycle!=='in_progress')return;if(!commands.cancel())return;commands.select(task);onDraft({taskId:id,operation,reason:''});},close=()=>{const reread=snapshot.locked||snapshot.error!==null;if(commands.cancel()){onDraft(null);if(reread){commands.select(null);void onReload();}}};
 return <>{children(open)}{task&&draft&&<KanbanReviewDialog task={task} operation={draft.operation} reason={draft.reason} ready={ready} busy={snapshot.writing} locked={snapshot.locked} error={snapshot.error} onReason={reason=>{if(!snapshot.locked&&!snapshot.writing)onDraft({...draft,reason});}} onApply={()=>void commands.apply(draft.operation,draft.reason)} onReload={()=>{if(commands.cancel()){commands.select(null);void onReload();}}} onCancel={close}/>}</>;
}
