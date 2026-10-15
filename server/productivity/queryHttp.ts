import {randomUUID} from 'node:crypto';
import type {AppActor,QueryClock,TaskFilter} from '../../src/features/productivity/contracts.js';
import {assertTaskFilter} from '../../src/features/productivity/filters.js';
import {timezoneFormatter} from '../../src/features/productivity/dates.js';
import {object,keys,text,choice} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
import {assertContext} from './tasks.js';
import type {TaskReader} from './access.js';
import {createTaskQuery,smartTaskFilter,type SelectionBudget} from './query.js';
interface QuerySession {actor:AppActor;filter:TaskFilter;clock:QueryClock;expiresAt:number}
/** Process-local opaque references retain a server-owned clock; every use rechecks ACL. */
export function createTaskQueryHttp(ports:{reader:TaskReader;now?:()=>number;pageSize?:number;selectionBudget?:SelectionBudget}){
 const now=ports.now??Date.now,engine=createTaskQuery(ports),sessions=new Map<string,QuerySession>(),ttl=15*60000;
 const authorize=(actor:AppActor)=>assertContext({actor,expectedRevision:0,requestId:'query:http'},ports.reader);
 const lookup=(actor:AppActor,id:string)=>{
  authorize(actor);try{text(id,256);}catch{throw new AppStoreError('Mã truy vấn không hợp lệ.',400);}
  const value=sessions.get(id);if(!value||value.actor.userId!==actor.userId||value.actor.role!==actor.role)throw new AppStoreError('Không tìm thấy truy vấn công việc.',404);
  if(value.expiresAt<=now())throw new AppStoreError('Truy vấn đã hết hạn; tải lại công việc.',409);
  return value;
 };
 const input=<T>(fn:()=>T):T=>{try{return fn();}catch(error){if(error instanceof AppStoreError)throw error;throw new AppStoreError('Bộ lọc công việc không hợp lệ.',400);}};
 return {
  query(actor:AppActor,body:unknown){
   authorize(actor);const value=input(()=>object(body));
   if(value.queryId!==undefined){input(()=>{keys(value,['queryId','cursor']);text(value.queryId,256);text(value.cursor,2048);});const saved=lookup(actor,value.queryId as string);return {...engine.queryTasks(actor,saved.filter,saved.clock,value.cursor as string),queryId:value.queryId,clock:structuredClone(saved.clock)};}
   const captured=now(),clock:QueryClock={nowUtc:new Date(captured).toISOString(),timezone:'Asia/Saigon'};
   const filter=input(()=>{
    keys(value,['filter','smart','completedWindowDays','timezone','refine']);if(value.timezone!==undefined){text(value.timezone,100);clock.timezone=value.timezone as string;}timezoneFormatter(clock.timezone);
    if(value.smart!==undefined){if(value.filter!==undefined)throw Error();choice(value.smart,['inbox','today','next7','assigned','overdue','completed','wont_do','trash']);if(value.completedWindowDays!==undefined&&![7,30,90,'all'].includes(value.completedWindowDays as any))throw Error();const base=smartTaskFilter(value.smart as Parameters<typeof smartTaskFilter>[0],actor,clock,value.completedWindowDays as 7|30|90|'all'|undefined),refine=value.refine===undefined?{}:object(value.refine);keys(refine,['query','listIds','sectionIds','tagIds','tagMatch','assigneeIds','priority']);assertTaskFilter({...refine,rootsOnly:true});const merged={...base,...structuredClone(refine)} as TaskFilter;if(base.assigneeIds&&merged.assigneeIds)merged.assigneeIds=merged.assigneeIds.filter(id=>base.assigneeIds!.includes(id));return merged;}
    if(value.completedWindowDays!==undefined||value.refine!==undefined)throw Error();assertTaskFilter(value.filter);return structuredClone(value.filter);
   });
   for(const [id,row]of sessions)if(row.expiresAt+ttl<=captured)sessions.delete(id);
   if(sessions.size>=4096)throw new AppStoreError('Quá nhiều truy vấn đang mở; vui lòng thử lại sau.',429);
   const page=engine.queryTasks(actor,filter,clock,null),queryId=randomUUID();sessions.set(queryId,{actor:structuredClone(actor),filter,clock,expiresAt:captured+ttl});return {...page,queryId,clock:structuredClone(clock)};
  },
  select(actor:AppActor,id:string){const saved=lookup(actor,id);return engine.selectTaskIds(actor,saved.filter,saved.clock,new Date(now()).toISOString());},
  resolve(actor:AppActor,id:string){return engine.resolveSelection(actor,id,{nowUtc:new Date(now()).toISOString(),timezone:'Asia/Saigon'});},
  task(actor:AppActor,id:string){return engine.readTask(actor,id,{includeTrash:true});},
 };
}
