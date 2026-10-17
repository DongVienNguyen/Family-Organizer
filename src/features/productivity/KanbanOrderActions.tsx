import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import type {TaskApi} from './api.js';
import {createKanbanCommandState,type KanbanCommandSelection} from './kanbanCommandState.js';
import {KanbanOrderDialog,type KanbanOrderSource} from './KanbanOrderDialog.js';
/** Pure rank confirmation. Cross-lane Workflow changes keep their P10 owner. */
export function KanbanOrderActions({api,selection,ready,onRefresh,children}:{api:TaskApi;selection:KanbanCommandSelection;ready:boolean;onRefresh():Promise<void>;children:(onOrder:((taskId:string,source:KanbanOrderSource)=>void)|undefined)=>ReactNode}){
 const latest=useRef({api,ready,onRefresh});latest.current={api,ready,onRefresh};const commands=useMemo(()=>createKanbanCommandState({...api,onCommitted:()=>latest.current.api===api&&latest.current.ready?latest.current.onRefresh():Promise.resolve()}),[api]),snapshot=useSyncExternalStore(commands.subscribe,commands.snapshot,commands.snapshot),mounted=useRef<typeof commands|null>(null);
 const [choice,setChoice]=useState<{owner:typeof commands;taskId:string;source:KanbanOrderSource;beforeTaskId:string|null}|null>(null);
 useEffect(()=>{mounted.current=commands;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==commands)commands.dispose();});};},[commands]);
 const enabled=ready&&selection.rankSorted&&(selection.kind==='grouped'||selection.page.mode==='workflow');
 useEffect(()=>{commands.select(enabled?selection:null);},[commands,enabled,selection]);
 const code=snapshot.error?.status;useEffect(()=>{if(code!==undefined&&code!==null&&[401,403,404].includes(code)){commands.clear();setChoice(null);if(latest.current.api===api&&latest.current.ready)void latest.current.onRefresh();}},[commands,api,code]);
 const cards=(source:KanbanOrderSource)=>selection.kind==='canonical'&&source.kind==='column'?(selection.page.columns.find(c=>c.id===source.id)?.cards.map(c=>c.task)??[]):selection.kind==='grouped'&&source.kind!=='column'?selection.page.cards.filter(c=>c.group.kind===source.kind&&c.group.value===source.value).map(c=>selection.page.tasks.find(t=>t.id===c.taskId)!).filter(Boolean):[];
 const rows=choice?.owner===commands?cards(choice.source):[],task=enabled&&choice?.owner===commands?rows.find(t=>t.id===choice.taskId):undefined;
 const open=(taskId:string,source:KanbanOrderSource)=>{if(!enabled||snapshot.writing||snapshot.previewing||!cards(source).some(t=>t.id===taskId))return;commands.cancel();setChoice({owner:commands,taskId,source:structuredClone(source),beforeTaskId:null});};
 const close=()=>{if(commands.cancel())setChoice(null);};
 return <>{children(enabled?open:undefined)}{task&&choice&&<KanbanOrderDialog task={task} source={choice.source} beforeTaskId={choice.beforeTaskId} candidates={rows} plan={snapshot.plan} ready={enabled} busy={snapshot.writing||snapshot.previewing} error={snapshot.error} onBefore={beforeTaskId=>{if(snapshot.writing||snapshot.previewing)return;commands.cancel();setChoice({...choice,beforeTaskId});}} onPreview={()=>{if(choice.source.kind==='column')void commands.previewOrder({viewId:selection.page.viewId,taskId:task.id,targetColumnId:choice.source.id,beforeTaskId:choice.beforeTaskId,timezone:selection.page.clock.timezone});else void commands.previewGroupedRank({viewId:selection.page.viewId,taskId:task.id,group:choice.source,beforeTaskId:choice.beforeTaskId,timezone:selection.page.clock.timezone});}} onApply={()=>void commands.apply()} onClose={close}/>}</>;
}
