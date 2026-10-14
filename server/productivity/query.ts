import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,TaskFilter,QueryClock,Page,TaskRecord} from '../../src/features/productivity/contracts.js';
import {assertTaskFilter,matchesFilter} from '../../src/features/productivity/filters.js';
import {utcInstant,timezoneFormatter,localDateAt,calendarDate,localDayStart} from '../../src/features/productivity/dates.js';
import {integer,text,object,keys} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
import {taskScope,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
import {decodeTaskRow,type StoredTask} from './store.js';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalized=(value:any):any=>Array.isArray(value)?value.map(normalized):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])])):value;
const conflict=()=>new AppStoreError('Kết quả công việc đã thay đổi; tải lại lựa chọn.',409,'query-conflict');
const clockValid=(clock:QueryClock)=>{utcInstant(clock.nowUtc);timezoneFormatter(clock.timezone);};
function project(task:StoredTask):TaskRecord {
 const fields=['id','listId','sectionId','parentId','title','body','lifecycle','priority','due','scheduledStart','scheduledEnd','creatorId','assigneeId','isShared','tagIds','blocked','blockedReason','pendingApproval','rewardPoints','revision','deletedAt'] as const;let completedReferenceAt:string|null=null;
 if(task.lifecycle==='completed')for(const value of [task.legacy.completedAt,task.legacy.updatedAt]){if(typeof value!=='string')continue;try{completedReferenceAt=new Date(utcInstant(value)).toISOString();break;}catch{}}
 return {...structuredClone(Object.fromEntries(fields.map(field=>[field,task[field]]))) as TaskRecord,completedReferenceAt};
}
export function smartTaskFilter(kind:'inbox'|'today'|'next7'|'assigned'|'overdue'|'completed'|'wont_do'|'trash',actor:AppActor,clock:QueryClock,completedWindowDays:7|30|90|'all'='all'):TaskFilter {
 clockValid(clock);const filter:TaskFilter={rootsOnly:true},today=localDateAt(utcInstant(clock.nowUtc),clock.timezone),date=(offset:number)=>new Date(calendarDate(today)+offset*86400000).toISOString().slice(0,10);
 switch(kind){case 'inbox':return {...filter,dueKinds:['none'],lifecycle:['todo','in_progress']};case 'today':case 'next7':return {...filter,lifecycle:['todo','in_progress'],dueRange:{from:new Date(localDayStart(today,clock.timezone)).toISOString(),toExclusive:new Date(localDayStart(date(kind==='today'?1:7),clock.timezone)).toISOString()}};case 'assigned':return {...filter,assigneeIds:[actor.userId],lifecycle:['todo','in_progress']};case 'overdue':return {...filter,overdue:true};case 'completed':return {...filter,lifecycle:['completed'],completedWindowDays};case 'wont_do':return {...filter,lifecycle:['wont_do']};case 'trash':return {...filter,includeTrash:true,trashOnly:true};default:throw new AppStoreError('Bộ lọc công việc không hợp lệ.',400,'query-filter');}
}
interface Selection {id:string;actor:AppActor;filter:TaskFilter;clock:QueryClock;expiresAt:number;rows:{id:string;revision:number}[]}
export function createTaskQuery(ports:{reader:TaskReader;pageSize?:number}) {
 const pageSize=ports.pageSize??100;integer(pageSize,1,100);const selections=new Map<string,Selection>(),expiredOwners=new Map<string,AppActor>();
 const authorize=(actor:AppActor)=>assertContext({actor,requestId:'query:read',expectedRevision:0},ports.reader);
 const collect=(actor:AppActor,filter:TaskFilter,clock:QueryClock)=>{
  authorize(actor);try{assertTaskFilter(filter);clockValid(clock);}catch{throw new AppStoreError('Bộ lọc hoặc thời điểm không hợp lệ.',400,'query-filter');}
  const scope=taskScope(actor,{includeTrash:filter.includeTrash===true}),where=[scope.sql],args:any[]=[...scope.args];
  for(const [field,column] of [['listIds','list_id'],['sectionIds','section_id'],['assigneeIds','assignee_id'],['priority','priority'],['lifecycle','lifecycle'],['dueKinds','due_kind']] as const){const values=filter[field];if(values!==undefined){where.push(values.length?'t.'+column+' IN('+values.map(()=>'?').join(',')+')':'0');args.push(...values);}}
  if(filter.rootsOnly)where.push('t.parent_id IS NULL');if(filter.trashOnly!==undefined)where.push('t.deleted_at IS '+(filter.trashOnly?'NOT ':'')+'NULL');
  if(filter.tagIds!==undefined){if(!filter.tagIds.length)where.push('0');else if(filter.tagMatch==='all')for(const id of [...new Set(filter.tagIds)]){where.push('EXISTS(SELECT 1 FROM productivity_task_tags tg WHERE tg.task_id=t.id AND tg.tag_id=?)');args.push(id);}else{where.push('EXISTS(SELECT 1 FROM productivity_task_tags tg WHERE tg.task_id=t.id AND tg.tag_id IN('+filter.tagIds.map(()=>'?').join(',')+'))');args.push(...filter.tagIds);}}
  const condition=where.map(value=>'('+value+')').join(' AND '),tagRows=ports.reader.all('SELECT tg.task_id,tg.tag_id FROM productivity_task_tags tg JOIN productivity_tasks t ON t.id=tg.task_id WHERE '+condition+' ORDER BY tg.task_id,tg.tag_id',...args),tags=new Map<string,string[]>();for(const row of tagRows)tags.set(row.task_id,[...(tags.get(row.task_id)??[]),row.tag_id]);
  return ports.reader.all('SELECT t.* FROM productivity_tasks t WHERE '+condition+' ORDER BY t.rank,t.id',...args).map(row=>{const stored=decodeTaskRow(row,tags.get(row.id)??[]);return {task:project(stored),rank:stored.rank};}).filter(row=>matchesFilter(row.task,filter,clock));
 };
 const binding=(actor:AppActor,filter:TaskFilter,clock:QueryClock)=>hash(normalized({actor,filter,clock}));
 const digest=(rows:ReturnType<typeof collect>)=>hash(rows.map(row=>[row.task.id,row.task.revision,row.rank]));
 return {
  queryTasks(actor:AppActor,filter:TaskFilter,clock:QueryClock,cursor:string|null):Page<TaskRecord>{
   const rows=collect(actor,filter,clock),bound=binding(actor,filter,clock),state=digest(rows);let start=0;
   if(cursor!==null){let value:any;try{text(cursor,2048);value=object(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));keys(value,['version','binding','digest','id','rank']);integer(value.rank,-Number.MAX_SAFE_INTEGER);text(value.id,256);}catch{throw new AppStoreError('Con trỏ công việc không hợp lệ.',400,'query-cursor');}if(value.version!==1||value.binding!==bound||value.digest!==state)throw conflict();const index=rows.findIndex(row=>row.task.id===value.id&&row.rank===value.rank);if(index<0)throw conflict();start=index+1;}
   const page=rows.slice(start,start+pageSize),last=page.at(-1);return {items:page.map(row=>row.task),totalUnique:rows.length,nextCursor:last&&start+page.length<rows.length?Buffer.from(JSON.stringify({version:1,binding:bound,digest:state,id:last.task.id,rank:last.rank})).toString('base64url'):null};
  },
  selectTaskIds(actor:AppActor,filter:TaskFilter,clock:QueryClock){
   const rows=collect(actor,filter,clock),now=utcInstant(clock.nowUtc);for(const [id,selection]of selections)if(selection.expiresAt<=now){expiredOwners.set(id,selection.actor);selections.delete(id);}const value:Selection={id:randomUUID(),actor:structuredClone(actor),filter:structuredClone(filter),clock:structuredClone(clock),expiresAt:now+15*60000,rows:rows.map(row=>({id:row.task.id,revision:row.task.revision}))};selections.set(value.id,value);return {id:value.id,taskIds:value.rows.map(row=>row.id),totalUnique:value.rows.length,expiresAt:new Date(value.expiresAt).toISOString(),clock:structuredClone(value.clock)};
  },
  resolveSelection(actor:AppActor,id:string,clock:QueryClock):{id:string;revision:number}[]{
   authorize(actor);try{text(id,256);clockValid(clock);}catch{throw new AppStoreError('Lựa chọn hoặc thời điểm không hợp lệ.',400,'query-selection');}const value=selections.get(id),owner=value?.actor??expiredOwners.get(id);if(!owner||owner.userId!==actor.userId||owner.role!==actor.role)throw new AppStoreError('Không tìm thấy lựa chọn công việc.',404,'query-selection');if(!value||value.expiresAt<=utcInstant(clock.nowUtc))throw conflict();const rows=collect(actor,value.filter,value.clock).map(row=>({id:row.task.id,revision:row.task.revision}));if(hash(rows)!==hash(value.rows))throw conflict();return structuredClone(value.rows);
  },
 };
}
