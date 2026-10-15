import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {useTranslation} from 'react-i18next';
import {useTasks} from './useTasks.js';
import {createMatrixState} from './matrixState.js';
import {openCanonicalTask} from './openTask.js';
import type {MatrixPlan,MatrixPreviewInput} from '../../../server/productivity/matrix.js';
import type {SavedTaskView,SaveViewInput} from '../../../server/productivity/views.js';
export function useMatrixWorkspace(){
 const state=useTasks(),latest=useRef(state);latest.current=state;const {t}=useTranslation(),controller=useMemo(()=>createMatrixState(state.api),[state.api]),mounted=useRef<typeof controller|null>(null),snapshot=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
 const [views,setViews]=useState<SavedTaskView[]>([]),[selected,setSelected]=useState(''),[timezone,setTimezone]=useState('Asia/Saigon'),[displayed,setDisplayed]=useState<MatrixPlan|null>(null),[editing,setEditing]=useState<{view:SavedTaskView|null}|null>(null),[error,setError]=useState(''),[viewsEpoch,setViewsEpoch]=useState(0),lastIntent=useRef<MatrixPreviewInput|null>(null),loaded=useRef('');
 const ready=state.enabled&&!state.loading&&!state.error&&state.online;
 useEffect(()=>{mounted.current=controller;return()=>{mounted.current=null;queueMicrotask(()=>{if(mounted.current!==controller)controller.dispose();});};},[controller]);
 useEffect(()=>{let cancelled=false;if(!ready)return;setError('');state.api.views().then(rows=>{if(!cancelled)setViews(rows.filter(row=>row.kind==='matrix'));}).catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:t('matrixUi.loadFailed'));});return()=>{cancelled=true;};},[state.api,ready,state.queryEpoch,viewsEpoch,t]);
 useEffect(()=>{if(!state.enabled&&!state.loading){controller.clear();setDisplayed(null);lastIntent.current=null;loaded.current='';setViews([]);return;}if(!ready){controller.suspend();return;}if(!selected)return;
  const plan=controller.snapshot().plan;if(plan&&!state.cache.record(plan.taskId)){controller.clear();setDisplayed(null);lastIntent.current=null;loaded.current='';}
  if(loaded.current!==selected+'|'+timezone){loaded.current=selected+'|'+timezone;void controller.load(selected,timezone);}else void controller.refresh();
 },[controller,ready,state.enabled,state.loading,state.cache,selected,timezone,state.queryEpoch]);
 useEffect(()=>{if(snapshot.plan)setDisplayed(snapshot.plan);},[snapshot.plan]);
 useEffect(()=>{const result=snapshot.lastResult;if(!result)return;setDisplayed(null);lastIntent.current=null;if(result.taskChanged)void latest.current.refresh();},[snapshot.lastResult]);
 useEffect(()=>{if(snapshot.error&&!snapshot.projection&&!snapshot.plan&&lastIntent.current&&!snapshot.previewing&&!snapshot.writing){setError(snapshot.error);setDisplayed(null);lastIntent.current=null;loaded.current='';void latest.current.refresh();}},[snapshot.error,snapshot.projection,snapshot.plan,snapshot.previewing,snapshot.writing]);
 const choose=useCallback((id:string)=>{controller.clear();setDisplayed(null);lastIntent.current=null;loaded.current='';setSelected(id);setError('');},[controller]);
 const cancel=useCallback(()=>{if(controller.cancel()){setDisplayed(null);lastIntent.current=null;}},[controller]);
 const move=useCallback(async(input:MatrixPreviewInput)=>{const current=latest.current;if(!current.enabled||current.loading||current.error||!current.online||controller.snapshot().writing)return;setError('');
  if(!current.cache.record(input.taskId)){await current.refresh();if(mounted.current!==controller)return;if(!latest.current.cache.record(input.taskId)){setError(t('matrixUi.taskUnavailable'));return;}await controller.refresh();}
  if(mounted.current!==controller)return;lastIntent.current=structuredClone(input);await controller.preview(input);
 },[controller,t]);
 const repreview=useCallback((choice?:MatrixPreviewInput['choice'],mode?:MatrixPreviewInput['mode'])=>{if(!lastIntent.current)return;const next={...lastIntent.current,...(choice===undefined?{}:{choice}),...(mode?{mode}:{})};if(next.mode==='view_pin')delete next.choice;void move(next);},[move]);
 const open=useCallback(async(id:string)=>{const current=latest.current;if(current.loading||current.error||!current.online)return;setError('');try{const opened=await openCanonicalTask({...current,current:()=>mounted.current===controller},id);if(!opened&&mounted.current===controller)setError(t('matrixUi.taskUnavailable'));}catch(error){if(mounted.current===controller)setError(error instanceof Error?error.message:t('matrixUi.taskUnavailable'));}},[controller,t]);
 const save=useCallback((input:SaveViewInput,revision:number)=>latest.current.command('matrix-view:'+String(input.id??'new'),{input,revision},key=>latest.current.api.saveView(input,revision,key)),[]);
 const saved=useCallback((view:SavedTaskView)=>{setViews(before=>[...before.filter(row=>row.id!==view.id),view]);choose(view.id);setEditing(null);setViewsEpoch(value=>value+1);},[choose]);
 const changeTimezone=useCallback((value:string)=>{controller.clear();setDisplayed(null);lastIntent.current=null;loaded.current='';setTimezone(value);},[controller]);
 return {state,controller,snapshot,views,selected,timezone,ready,displayed,editing,error,setError,choose,changeTimezone,move,repreview,open,cancel,save,saved,setEditing,retry:()=>{setViewsEpoch(value=>value+1);void latest.current.refresh();},closeEditor:useCallback(()=>setEditing(null),[])};
}
