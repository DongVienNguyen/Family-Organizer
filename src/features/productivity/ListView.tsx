import type {TaskRecord} from './contracts.js';
import React from 'react';
import {useTranslation} from 'react-i18next';
import {Pin} from 'lucide-react';
import {useTasks} from './useTasks.js';
import {tagLabel} from '../../utils/taskTagLabels.js';
export function ListView({items,totalUnique,onOpen}:{items?:TaskRecord[];totalUnique?:number;onOpen?:(task:TaskRecord)=>void}={}){
 const {t}=useTranslation(),state=useTasks(),roots=items??state.records.filter(task=>task.parentId===null);
 return <div className="space-y-3" aria-label={t('productivity.listView')}>
  <p className="text-xs text-slate-400" aria-live="polite">{t(items?'productivityQuery.taskCount':'productivity.rootCount',{count:totalUnique??roots.length})}</p>
  {roots.length===0&&<p className="text-sm text-slate-400">{t('productivity.empty')}</p>}
  {roots.map(task=><button key={task.id} type="button" data-task-id={task.id} onClick={()=>onOpen?onOpen(task):state.open(task.id)} className="w-full bg-slate-900 neu-raised rounded-2xl p-4 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/40">
   <span className="flex gap-2 items-center text-sm font-bold text-slate-100">{state.pins.some(pin=>pin.taskId===task.id&&pin.pinned)&&<Pin className="w-4 h-4 text-amber-400" aria-label={t('productivity.personalPin')}/>} {task.title}</span>
   <span className="block mt-2 text-xs text-slate-400">{state.catalog.lists.find(list=>list.id===task.listId)?.title??t('productivity.unknownList')} · {task.priority==='none'?t('productivity.priorityNone'):t('tasks.priority'+task.priority[0].toUpperCase()+task.priority.slice(1))} · {task.due.kind==='none'?t('productivity.noDue'):task.due.kind==='all_day'?task.due.date:task.due.instantUtc}</span>
   {task.pendingApproval&&<span className="block mt-2 text-xs text-amber-400">{t('productivity.awaitingApproval')}</span>}
   {task.tagIds.length>0&&<span className="block mt-2 text-xs text-slate-400">{task.tagIds.map(id=>tagLabel(id,state.catalog.tags)).join(' · ')}</span>}
  </button>)}
 </div>;
}
