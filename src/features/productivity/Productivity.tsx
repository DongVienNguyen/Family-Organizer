import {useTaskViews} from './useTaskViews.js';
import {QueryWorkspace} from './QueryWorkspace.js';
import React,{useState,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {Plus} from 'lucide-react';
import {useTasks} from './useTasks.js';
import {ListView} from './ListView.js';
import {TaskDrawer} from './TaskDrawer.js';
import {FancySelect} from '../../components/FancySelect.js';
import {UserRole,type User,type Task} from '../../types.js';
export function Productivity({user,users,tasks,onComment,onAdvanced,actions,showList=true,overlayActive=false}:{user:User;users:User[];tasks:Task[];onComment:(id:string,text:string)=>Promise<unknown>;onAdvanced:(task:Task)=>void;actions:(task:Task,disabled:boolean)=>ReactNode;showList?:boolean;overlayActive?:boolean}){
 const views=useTaskViews(),state=useTasks(),{t}=useTranslation(),[title,setTitle]=useState(''),[listId,setListId]=useState(''),[newList,setNewList]=useState(''),[newSection,setNewSection]=useState(''),[newTag,setNewTag]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const writable=state.catalog.lists.filter(list=>user.role===UserRole.ADMIN||user.role===UserRole.CHILD&&list.isShared||user.role===UserRole.MEMBER&&(list.permission==='write'||list.permission==='manage')),target=writable.find(list=>list.id===listId)?.id??writable[0]?.id??'',adult=user.role===UserRole.ADMIN||user.role===UserRole.MEMBER,disabled=busy||!state.online||user.role===UserRole.GUEST;
 const perform=async(work:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await work();await state.refresh();}catch(error){setError((error as Error).message);}finally{setBusy(false);}};
 if(state.loading)return <p className="text-sm text-slate-400" aria-live="polite">{t('productivity.loading')}</p>;
 if(state.error)return <div className="space-y-3"><p role="alert" className="text-sm text-rose-400">{state.error}</p><button type="button" onClick={()=>void state.refresh()}>{t('productivity.retry')}</button></div>;
 return <section className="space-y-5" aria-label={t('productivity.workspace')}>
  <div className={showList?'space-y-5':'hidden'}>
  {error&&<p role="alert" className="text-sm text-rose-400">{error}</p>}
  {!state.online&&<p className="text-xs text-amber-400">{t('productivity.offline')}</p>}
  {user.role!==UserRole.GUEST&&<form className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3" onSubmit={event=>{event.preventDefault();const input={listId:target,title:title.trim(),priority:'none' as const,due:{kind:'none' as const}};void perform(async()=>{const task=await state.command('create-task',input,key=>state.api.create(input,key));setTitle('');return task;});}}>
   <input aria-label={t('productivity.newTask')} value={title} maxLength={500} onChange={event=>setTitle(event.target.value)} className="bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none"/>
   <FancySelect ariaLabel={t('productivity.newTaskList')} value={target} options={writable.map(list=>({value:list.id,label:list.title}))} onChange={setListId}/>
   <button type="submit" disabled={disabled||!title.trim()||!target} className="bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl px-4 py-2.5 font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"><Plus className="w-4 h-4"/>{t('productivity.addTask')}</button>
  </form>}
  {adult&&<details className="bg-slate-900 neu-raised rounded-2xl p-4"><summary className="text-sm font-bold text-slate-100 cursor-pointer">{t('productivity.organize')}</summary><div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
   <form onSubmit={event=>{event.preventDefault();void perform(async()=>{await state.command('create-list',{title:newList},key=>state.api.createList(newList.trim(),false,key));setNewList('');});}}><input aria-label={t('productivity.newList')} value={newList} onChange={event=>setNewList(event.target.value)} className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5"/><button type="submit" disabled={disabled||!newList.trim()} className="mt-2 text-xs text-sky-400 cursor-pointer">{t('productivity.addList')}</button></form>
   <form onSubmit={event=>{event.preventDefault();void perform(async()=>{await state.command('create-section',{listId:target,title:newSection},key=>state.api.createSection(target,newSection.trim(),key));setNewSection('');});}}><input aria-label={t('productivity.newSection')} value={newSection} onChange={event=>setNewSection(event.target.value)} className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5"/><button type="submit" disabled={disabled||!target||!newSection.trim()} className="mt-2 text-xs text-sky-400 cursor-pointer">{t('productivity.addSection')}</button></form>
   <form onSubmit={event=>{event.preventDefault();void perform(async()=>{await state.command('create-tag',{name:newTag},key=>state.api.createTag(newTag.trim(),key));setNewTag('');});}}><input aria-label={t('productivity.newTag')} value={newTag} onChange={event=>setNewTag(event.target.value)} className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5"/><button type="submit" disabled={disabled||!newTag.trim()} className="mt-2 text-xs text-sky-400 cursor-pointer">{t('productivity.addTag')}</button></form>
  </div></details>}
  <QueryWorkspace views={views} user={user} users={users}/>
  </div>
  {state.activeId&&<TaskDrawer key={state.activeId} user={user} users={users} legacyTasks={tasks} onComment={onComment} onAdvanced={onAdvanced} actions={actions} overlayActive={overlayActive}/>}
 </section>;
}
