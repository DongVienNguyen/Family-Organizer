import {createContentCommandSession,type ContentCommandSession} from './contentCommandSession.js';
import type {Note} from '../../types.js';
import {createTemplateCommandSession,type TemplateCommandSession} from './templateCommandSession.js';
import {createNotificationCommandSession,type NotificationCommandSession} from './notificationCommandSession.js';
import {createListGrantSession,type ListGrantSession} from './listGrantSession.js';
import {createCommentSession,type CommentSession} from './commentSession.js';
import {createCalendarCommandState,type CalendarCommandState} from './calendarCommandState.js';
import {createCatalogAuthority,type CatalogAuthority}from'./catalogAuthority.js';
import React,{createContext,useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore,useCallback,type ReactNode} from 'react';
import type {TaskRecord} from './contracts.js';
import {createTaskCache,type TaskCache} from './taskCache.js';
import {createTaskApi,TaskApiError,type TaskApi,type TaskCatalog} from './api.js';
import type {TaskPin} from '../../../server/productivity/pins.js';
const emptyNotes:Note[]=[];
const emptyCatalog:TaskCatalog={lists:[],sections:[],tags:[]};
interface TaskState {contentCommands:ContentCommandSession;visibleNoteIds:readonly string[];openNote(id:string):void;navigateTask(id:string):boolean;templateCommands:TemplateCommandSession;notificationCommands:NotificationCommandSession;sharing:ListGrantSession;comments:CommentSession;calendarCommands:CalendarCommandState;catalogAuthority:CatalogAuthority;queryEpoch:number;cache:TaskCache;api:TaskApi;ids:string[];catalog:TaskCatalog;pins:TaskPin[];pinEnabled:boolean;enabled:boolean;loading:boolean;error:string;online:boolean;activeId:string|null;command<T>(scope:string,payload:unknown,work:(key:string)=>Promise<T>):Promise<T>;open(id:string):boolean;close():void;refresh():Promise<void>}
const TaskContext=createContext<TaskState|null>(null);
/** Lives above view components and beneath the existing BrowserSessionRoot epoch. */
export function TaskProvider({sessionKey,request,authHeaders,online,refreshEpoch,queryEpoch=0,available,notes=emptyNotes,onOpenNote,onOpenTasks,children}:{sessionKey:string;request:typeof fetch;authHeaders:()=>HeadersInit;online:boolean;refreshEpoch:number;queryEpoch?:number;available:boolean|undefined;notes?:Note[];onOpenNote?:(id:string)=>void;onOpenTasks?:()=>void;children:ReactNode}){
 const catalogAuthority=useMemo(()=>createCatalogAuthority(),[sessionKey]),cache=useMemo(()=>createTaskCache(),[sessionKey]),api=useMemo(()=>createTaskApi({request,authHeaders}),[request,sessionKey]);
 const contentRef=useRef<ContentCommandSession|null>(null),visibleNoteIds=useMemo(()=>notes.map(note=>note.id),[notes]);
 const templateRef=useRef<TemplateCommandSession|null>(null);
 const notificationRef=useRef<NotificationCommandSession|null>(null);
 const sharingRef=useRef<ListGrantSession|null>(null);
 const commentRef=useRef<CommentSession|null>(null);
 const calendarCommandRef=useRef<CalendarCommandState|null>(null);
 const commands=useRef(new Map<string,{signature:string;key:string}>());
 const mountedCache=useRef<TaskCache|null>(null),sequence=useRef(0),alive=useRef(true),known=useRef<string[]>([]);
 const [ids,setIds]=useState<string[]>([]),[catalog,setCatalog]=useState<TaskCatalog>(emptyCatalog),[pins,setPins]=useState<TaskPin[]>([]),[pinEnabled,setPinEnabled]=useState(false),[enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[activeId,setActiveId]=useState<string|null>(null);
 const refresh=useCallback(async()=>{
  const current=++sequence.current;if(available!==true){contentRef.current?.clear();templateRef.current?.clear();notificationRef.current?.clear();sharingRef.current?.clear();commentRef.current?.clear();calendarCommandRef.current?.clear();catalogAuthority.confirm([]);cache.clear();known.current=[];commands.current.clear();setIds([]);setCatalog(emptyCatalog);setPins([]);setPinEnabled(false);setEnabled(false);setLoading(false);setError('');setActiveId(null);return;}setLoading(true);setError('');setCatalog(emptyCatalog);setPins([]);for(const id of known.current)cache.invalidate(id);
  try{
   const tasks=await api.tasks(),nextCatalog=await api.catalog();
   // Retire revoked drafts synchronously while this catalog result is current.
   // A later refresh may replace React state before the pins request completes.
   if(!alive.current||sequence.current!==current)return;contentRef.current?.reconcileTasks(tasks.map(task=>task.id),nextCatalog.lists.map(list=>list.id));templateRef.current?.reconcile(tasks.map(task=>task.id),nextCatalog.lists.map(list=>list.id));notificationRef.current?.reconcile(tasks.map(task=>task.id));commentRef.current?.reconcile(tasks.map(task=>task.id));sharingRef.current?.reconcile(nextCatalog.lists.filter(list=>list.permission==='manage').map(list=>list.id));catalogAuthority.confirm(nextCatalog.lists);let nextPins:TaskPin[]=[],hasPins=true;
   try{nextPins=await api.pins();}catch(error){if(error instanceof TaskApiError&&error.status===409)hasPins=false;else throw error;}
   if(!alive.current||sequence.current!==current)return;const calendarState=calendarCommandRef.current?.snapshot(),calendarTaskId=calendarState?.draft?.preview.taskId??calendarState?.last?.task.id;if(calendarTaskId&&!tasks.some(task=>task.id===calendarTaskId))calendarCommandRef.current?.clear();cache.replaceVisible(tasks);known.current=tasks.map(task=>task.id);setIds(known.current);setCatalog(nextCatalog);setPins(nextPins);setPinEnabled(hasPins);setEnabled(true);
  }catch(error){if(!alive.current||sequence.current!==current)return;setIds([]);setCatalog(emptyCatalog);setPins([]);if(error instanceof TaskApiError&&[401,403,404,409].includes(error.status)){contentRef.current?.clear();templateRef.current?.clear();notificationRef.current?.clear();sharingRef.current?.clear();commentRef.current?.clear();calendarCommandRef.current?.clear();catalogAuthority.confirm([]);cache.replaceVisible([]);known.current=[];}if(error instanceof TaskApiError&&error.status===409)setEnabled(false);else{setEnabled(true);setError(error instanceof Error?error.message:'Không tải được công việc.');}}
  finally{if(alive.current&&sequence.current===current)setLoading(false);}
 },[cache,api,available,catalogAuthority]);
 const refreshLatest=useRef(refresh);refreshLatest.current=refresh;
 const contentCommands=useMemo(()=>createContentCommandSession({api,onCommitted:async()=>{await refreshLatest.current();}}),[api]);contentRef.current=contentCommands;
 const mountedContent=useRef<ContentCommandSession|null>(null);useEffect(()=>{mountedContent.current=contentCommands;return()=>{contentCommands.clear();mountedContent.current=null;queueMicrotask(()=>{if(mountedContent.current!==contentCommands)contentCommands.dispose();});};},[contentCommands]);
 useEffect(()=>{contentCommands.reconcileNotes(visibleNoteIds);},[contentCommands,visibleNoteIds]);
 const templateCommands=useMemo(()=>createTemplateCommandSession({api,onCommitted:async()=>{await refreshLatest.current();}}),[api]);templateRef.current=templateCommands;
 const mountedTemplates=useRef<TemplateCommandSession|null>(null);useEffect(()=>{mountedTemplates.current=templateCommands;return()=>{templateCommands.clear();mountedTemplates.current=null;queueMicrotask(()=>{if(mountedTemplates.current!==templateCommands)templateCommands.dispose();});};},[templateCommands]);
 const notificationCommands=useMemo(()=>createNotificationCommandSession({api,onCommitted:()=>refreshLatest.current()}),[api]);notificationRef.current=notificationCommands;
 const mountedNotifications=useRef<NotificationCommandSession|null>(null);useEffect(()=>{mountedNotifications.current=notificationCommands;return()=>{notificationCommands.clear();mountedNotifications.current=null;queueMicrotask(()=>{if(mountedNotifications.current!==notificationCommands)notificationCommands.dispose();});};},[notificationCommands]);
 const sharing=useMemo(()=>createListGrantSession({api,onCommitted:()=>refreshLatest.current()}),[api]);sharingRef.current=sharing;
 const mountedSharing=useRef<ListGrantSession|null>(null);useEffect(()=>{mountedSharing.current=sharing;return()=>{sharing.clear();mountedSharing.current=null;queueMicrotask(()=>{if(mountedSharing.current!==sharing)sharing.dispose();});};},[sharing]);
 const comments=useMemo(()=>createCommentSession({api,onCommitted:async id=>{cache.acknowledgeComment(id);await refreshLatest.current();}}),[api,cache]);commentRef.current=comments;
 const mountedComments=useRef<CommentSession|null>(null);useEffect(()=>{mountedComments.current=comments;return()=>{comments.clear();mountedComments.current=null;queueMicrotask(()=>{if(mountedComments.current!==comments)comments.dispose();});};},[comments]);
 const calendarCommands=useMemo(()=>createCalendarCommandState({api,onCommitted:()=>refreshLatest.current()}),[api]);calendarCommandRef.current=calendarCommands;
 const mountedCalendar=useRef<CalendarCommandState|null>(null);useEffect(()=>{mountedCalendar.current=calendarCommands;return()=>{calendarCommands.clear();mountedCalendar.current=null;queueMicrotask(()=>{if(mountedCalendar.current!==calendarCommands)calendarCommands.dispose();});};},[calendarCommands]);
 useEffect(()=>{mountedCache.current=cache;alive.current=true;return()=>{alive.current=false;sequence.current++;cache.clear();commands.current.clear();mountedCache.current=null;queueMicrotask(()=>{if(mountedCache.current!==cache){cache.dispose();catalogAuthority.dispose();}});};},[cache,catalogAuthority]);
 useEffect(()=>{void refresh();},[refresh,refreshEpoch]);
 const command=useCallback(async<T,>(scope:string,payload:unknown,work:(key:string)=>Promise<T>)=>{const signature=JSON.stringify(payload),prior=commands.current.get(scope),operation=prior?.signature===signature?prior:{signature,key:crypto.randomUUID()};commands.current.set(scope,operation);const value=await work(operation.key);if(commands.current.get(scope)===operation)commands.current.delete(scope);return value;},[]);
 const open=useCallback((id:string)=>{if(cache.open(id)){setActiveId(id);return true;}return false;},[cache]),close=useCallback(()=>setActiveId(null),[]);
 const openNote=useCallback((id:string)=>{if(visibleNoteIds.includes(id))onOpenNote?.(id);},[visibleNoteIds,onOpenNote]),navigateTask=useCallback((id:string)=>{if(!open(id))return false;onOpenTasks?.();return true;},[open,onOpenTasks]);
 return <TaskContext.Provider value={{contentCommands,visibleNoteIds,openNote,navigateTask,templateCommands,notificationCommands,sharing,comments,calendarCommands,catalogAuthority,queryEpoch,cache,api,ids,catalog,pins,pinEnabled,enabled,loading,error,online,activeId,command,open,close,refresh}}>{children}</TaskContext.Provider>;
}
export function useTasks(){const context=useContext(TaskContext);if(!context)throw Error('TaskProvider required');useSyncExternalStore(context.cache.subscribe,context.cache.snapshot,context.cache.snapshot);return {...context,records:context.ids.map(id=>context.cache.record(id)).filter((task):task is TaskRecord=>!!task)};}
