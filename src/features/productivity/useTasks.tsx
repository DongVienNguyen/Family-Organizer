import React,{createContext,useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore,useCallback,type ReactNode} from 'react';
import type {TaskRecord} from './contracts.js';
import {createTaskCache,type TaskCache} from './taskCache.js';
import {createTaskApi,TaskApiError,type TaskApi,type TaskCatalog} from './api.js';
import type {TaskPin} from '../../../server/productivity/pins.js';
const emptyCatalog:TaskCatalog={lists:[],sections:[],tags:[]};
interface TaskState {cache:TaskCache;api:TaskApi;ids:string[];catalog:TaskCatalog;pins:TaskPin[];pinEnabled:boolean;enabled:boolean;loading:boolean;error:string;online:boolean;activeId:string|null;command<T>(scope:string,payload:unknown,work:(key:string)=>Promise<T>):Promise<T>;open(id:string):void;close():void;refresh():Promise<void>}
const TaskContext=createContext<TaskState|null>(null);
/** Lives above view components and beneath the existing BrowserSessionRoot epoch. */
export function TaskProvider({sessionKey,request,authHeaders,online,refreshEpoch,children}:{sessionKey:string;request:typeof fetch;authHeaders:()=>HeadersInit;online:boolean;refreshEpoch:number;children:ReactNode}){
 const cache=useMemo(()=>createTaskCache(),[sessionKey]),api=useMemo(()=>createTaskApi({request,authHeaders}),[request,sessionKey]);
 const commands=useRef(new Map<string,{signature:string;key:string}>());
 const mountedCache=useRef<TaskCache|null>(null),sequence=useRef(0),alive=useRef(true),known=useRef<string[]>([]);
 const [ids,setIds]=useState<string[]>([]),[catalog,setCatalog]=useState<TaskCatalog>(emptyCatalog),[pins,setPins]=useState<TaskPin[]>([]),[pinEnabled,setPinEnabled]=useState(false),[enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[activeId,setActiveId]=useState<string|null>(null);
 const refresh=useCallback(async()=>{
  const current=++sequence.current;setLoading(true);setError('');setCatalog(emptyCatalog);setPins([]);for(const id of known.current)cache.invalidate(id);
  try{
   const tasks=await api.tasks(),nextCatalog=await api.catalog();let nextPins:TaskPin[]=[],hasPins=true;
   try{nextPins=await api.pins();}catch(error){if(error instanceof TaskApiError&&error.status===409)hasPins=false;else throw error;}
   if(!alive.current||sequence.current!==current)return;cache.replaceVisible(tasks);known.current=tasks.map(task=>task.id);setIds(known.current);setCatalog(nextCatalog);setPins(nextPins);setPinEnabled(hasPins);setEnabled(true);
  }catch(error){if(!alive.current||sequence.current!==current)return;setIds([]);setCatalog(emptyCatalog);setPins([]);if(error instanceof TaskApiError&&[401,403,404,409].includes(error.status)){cache.replaceVisible([]);known.current=[];}if(error instanceof TaskApiError&&error.status===409)setEnabled(false);else{setEnabled(true);setError(error instanceof Error?error.message:'Không tải được công việc.');}}
  finally{if(alive.current&&sequence.current===current)setLoading(false);}
 },[cache,api]);
 useEffect(()=>{mountedCache.current=cache;alive.current=true;return()=>{alive.current=false;sequence.current++;cache.clear();commands.current.clear();mountedCache.current=null;queueMicrotask(()=>{if(mountedCache.current!==cache)cache.dispose();});};},[cache]);
 useEffect(()=>{void refresh();},[refresh,refreshEpoch]);
 const command=useCallback(async<T,>(scope:string,payload:unknown,work:(key:string)=>Promise<T>)=>{const signature=JSON.stringify(payload),prior=commands.current.get(scope),operation=prior?.signature===signature?prior:{signature,key:crypto.randomUUID()};commands.current.set(scope,operation);const value=await work(operation.key);if(commands.current.get(scope)===operation)commands.current.delete(scope);return value;},[]);
 const open=useCallback((id:string)=>{if(cache.open(id))setActiveId(id);},[cache]),close=useCallback(()=>setActiveId(null),[]);
 return <TaskContext.Provider value={{cache,api,ids,catalog,pins,pinEnabled,enabled,loading,error,online,activeId,command,open,close,refresh}}>{children}</TaskContext.Provider>;
}
export function useTasks(){const context=useContext(TaskContext);if(!context)throw Error('TaskProvider required');useSyncExternalStore(context.cache.subscribe,context.cache.snapshot,context.cache.snapshot);return {...context,records:context.ids.map(id=>context.cache.record(id)).filter((task):task is TaskRecord=>!!task)};}
