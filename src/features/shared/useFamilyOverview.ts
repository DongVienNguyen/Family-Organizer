import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import type {User} from '../../types.js';
import {useTasks} from '../productivity/useTasks.js';
import type {CalendarRange} from '../productivity/calendarContracts.js';
import {createFamilyOverviewWorkspace} from './familyOverviewWorkspace.js';
export function useFamilyOverview(user:User,range:CalendarRange){
 const tasks=useTasks(),ready=tasks.enabled&&!tasks.loading&&!tasks.error&&tasks.online,readyRef=useRef(ready);readyRef.current=ready;
 // A changed actor/authority epoch owns a new empty workspace immediately,
 // before effects run. Old labels cannot flash during the invalidating render.
 const workspace=useMemo(()=>createFamilyOverviewWorkspace({actor:{userId:user.id,role:user.role},api:tasks.api,ready:()=>readyRef.current}),[tasks.api,user.id,user.role,tasks.familyEpoch,tasks.queryEpoch]),state=useSyncExternalStore(workspace.subscribe,workspace.snapshot,workspace.snapshot),signature=JSON.stringify(range);
 useEffect(()=>{void workspace.refresh(range);return()=>workspace.invalidate();},[workspace,signature,ready]);
 useEffect(()=>{const wake=()=>{if(document.visibilityState!=='hidden'){workspace.invalidate();void workspace.refresh();}};window.addEventListener('focus',wake);window.addEventListener('pageshow',wake);document.addEventListener('visibilitychange',wake);return()=>{window.removeEventListener('focus',wake);window.removeEventListener('pageshow',wake);document.removeEventListener('visibilitychange',wake);};},[workspace]);
 useEffect(()=>()=>workspace.invalidate(),[workspace]);
 return {tasks,workspace,state:ready?state:{...state,value:null},ready};
}
