import type {createBoardProjection} from '../../../server/productivity/boardProjection.js';
import type {createGroupedBoardProjection} from '../../../server/productivity/groupedBoard.js';
import type {QueryClock,TaskRecord} from './contracts.js';
import {object,keys,text,integer,choice} from './validation.js';
import {calendarDate,resolveDue,timezoneFormatter} from './dates.js';
export type BoardPage=ReturnType<ReturnType<typeof createBoardProjection>['project']>;
export type GroupedBoardPage=ReturnType<ReturnType<typeof createGroupedBoardProjection>['project']>;
export interface BoardReadOptions {cursor?:string;timezone?:string;signal?:AbortSignal}
type Read=(path:string,method?:string,body?:unknown,requestId?:string,signal?:AbortSignal)=>Promise<Record<string,any>>;
type Group={kind:'priority'|'assignee'|'due'|'tag';value:string|null};
const kinds=['priority','assignee','due','tag']as const,workflow=['todo','doing','waiting','review','done','wont_do','trash']as const;
const fail=():never=>{throw Error('Invalid Kanban page');};
const bounded=(value:unknown,max:number):any[]=>{if(!Array.isArray(value)||value.length>max)return fail();return value;};
const unique=(values:unknown[])=>{if(new Set(values).size!==values.length)fail();};
const groupKey=(g:Group)=>JSON.stringify([g.kind,g.value]);
function groupValue(value:unknown):Group {const g=object(value);keys(g,['kind','value']);choice(g.kind,kinds);if(g.kind==='priority')choice(g.value,['high','medium','low','none']);else if(g.value!==null){text(g.value,256);if(g.kind==='due')calendarDate(g.value);}return {kind:g.kind as Group['kind'],value:g.value as string|null};}
function wipValue(value:unknown,grouped=false){const w=object(value);keys(w,['policy','limit','activeRootCount','visibility']);choice(w.policy,['off','soft','hard']);choice(w.visibility,['complete','redacted']);if(w.policy==='off'){if(w.limit!==null)fail();}else integer(w.limit,0,100000);if(w.visibility==='redacted'){if(w.activeRootCount!==null)fail();}else integer(w.activeRootCount);if(grouped&&(w.policy!=='off'||w.limit!==null||w.activeRootCount!==null||w.visibility!=='redacted'))fail();}
function workflowKey(task:TaskRecord){return task.deletedAt!==null?'trash':task.lifecycle==='wont_do'?'wont_do':task.pendingApproval?'review':task.lifecycle==='completed'?'done':task.blocked?'waiting':task.lifecycle==='in_progress'?'doing':'todo';}
/** Response consistency only. Server object ACLs and write commands own authority.
 * No mutation, optimistic lifecycle change, retry or local board persistence. */
export function createBoardReadApi(read:Read,parse:{task(value:unknown,id?:string):TaskRecord;clock(value:unknown):QueryClock}){
 const head=(value:unknown,viewId:string)=>{const page=object(value)as Record<string,any>;if(page.viewId!==viewId)fail();text(page.boardId,256);integer(page.viewRevision,1);integer(page.boardRevision,1);integer(page.totalUnique,0,5000);if(page.nextCursor!==null)text(page.nextCursor,2048);const clock=parse.clock(page.clock);bounded(page.columns,1000);return {page,clock};};
 const canonical=(value:unknown,viewId:string):BoardPage=>{
  const {page,clock}=head(value,viewId);keys(page,['viewId','viewRevision','boardId','boardRevision','mode','clock','columns','totalUnique','nextCursor']);choice(page.mode,['sections','workflow']);const ids:string[]=[],columnIds:string[]=[],columnKeys:string[]=[],lists:string[]=[];let cards=0,total=0;
  for(const raw of page.columns){const c=object(raw)as Record<string,any>;keys(c,['id','columnKey','sectionId','title','rank','revision','visibleCardCount','cards','wip']);text(c.id,256);text(c.columnKey,512);text(c.title,500);integer(c.rank);integer(c.revision,1);integer(c.visibleCardCount,0,5000);if(c.sectionId!==null)text(c.sectionId,256);wipValue(c.wip);columnIds.push(c.id);columnKeys.push(c.columnKey);
   if(page.mode==='sections'&&c.columnKey!==(c.sectionId===null?'none':'section:'+c.sectionId))fail();if(page.mode==='workflow'){choice(c.columnKey,workflow);if(c.sectionId!==null)fail();}
   const rows=bounded(c.cards,100);if(rows.length>c.visibleCardCount)fail();cards+=rows.length;total+=c.visibleCardCount;
   for(const raw of rows){const card=object(raw);keys(card,['task','rank']);integer(card.rank);const task=parse.task(card.task);integer(task.revision,1);if(page.mode==='sections'?task.sectionId!==c.sectionId:workflowKey(task)!==c.columnKey)fail();ids.push(task.id);lists.push(task.listId);}
  }
  unique(columnIds);unique(columnKeys);unique(ids);if(page.totalUnique>0&&cards===0||cards>100||cards>page.totalUnique||total!==page.totalUnique||new Set(lists).size>1)fail();return structuredClone({...page,clock,columns:page.columns.map((c:any)=>({...c,cards:c.cards.map((card:any)=>({task:parse.task(card.task),rank:card.rank}))}))})as BoardPage;
 };
 const grouped=(value:unknown,viewId:string):GroupedBoardPage=>{
  const {page,clock}=head(value,viewId);keys(page,['viewId','viewRevision','boardId','boardRevision','group','clock','columns','cards','tasks','totalUnique','nextCursor']);choice(page.group,kinds);const tasks=bounded(page.tasks,100).map(t=>parse.task(t)),byId=new Map(tasks.map(t=>[t.id,t]));unique(tasks.map(t=>t.id));for(const task of tasks)integer(task.revision,1);if(new Set(tasks.map(t=>t.listId)).size>1||tasks.length>page.totalUnique)fail();
  const columns=new Map<string,number>(),ids:string[]=[];let total=0;for(const raw of page.columns){const c=object(raw)as Record<string,any>;keys(c,['id','group','visibleCardCount','wip']);text(c.id,256);const group=groupValue(c.group);if(group.kind!==page.group)fail();const key=groupKey(group);if(columns.has(key))fail();integer(c.visibleCardCount,1,5000);wipValue(c.wip,true);columns.set(key,c.visibleCardCount);ids.push(c.id);total+=c.visibleCardCount;}unique(ids);if(total<page.totalUnique||total>20000||page.group!=='tag'&&total!==page.totalUnique)fail();
  const visuals:string[]=[],refs:string[]=[],used=new Set<string>(),counts=new Map<string,number>();for(const raw of bounded(page.cards,100)){const c=object(raw);keys(c,['taskId','projectionId','group','rank']);text(c.taskId,256);text(c.projectionId,64);if(!/^[a-f0-9]{64}$/.test(c.projectionId))fail();integer(c.rank);const group=groupValue(c.group),key=groupKey(group),task=byId.get(c.taskId);if(!task||!columns.has(key)||group.kind!==page.group)fail();
   const values=group.kind==='tag'?(task!.tagIds.length?task!.tagIds:[null]):[group.kind==='priority'?task!.priority:group.kind==='assignee'?task!.assigneeId:resolveDue(task!.due,clock).localDate];if(!values.includes(group.value))fail();visuals.push(c.projectionId);refs.push(JSON.stringify([c.taskId,key]));used.add(c.taskId);counts.set(key,(counts.get(key)??0)+1);
  }
  unique(visuals);unique(refs);if(page.totalUnique>0&&visuals.length===0||used.size!==tasks.length)fail();for(const [key,count]of counts)if(count>columns.get(key)!)fail();return structuredClone({...page,clock,tasks})as GroupedBoardPage;
 };
 const get=async(viewId:string,options:BoardReadOptions,group:boolean)=>{text(viewId,256);keys(object(options),['cursor','timezone','signal']);const timezone=options.timezone??'Asia/Saigon';text(timezone,100);timezoneFormatter(timezone);if(options.cursor!==undefined)text(options.cursor,2048);const query=new URLSearchParams({timezone});if(options.cursor!==undefined)query.set('cursor',options.cursor);const raw=await read('/api/productivity/boards/'+encodeURIComponent(viewId)+(group?'/grouped':'')+'?'+query.toString().replaceAll('+','%20'),'GET',undefined,undefined,options.signal);const result=group?grouped(raw,viewId):canonical(raw,viewId);if(result.clock.timezone!==timezone)fail();return result;};
 return {board:(viewId:string,options:BoardReadOptions={}):Promise<BoardPage>=>get(viewId,options,false)as Promise<BoardPage>,groupedBoard:(viewId:string,options:BoardReadOptions={}):Promise<GroupedBoardPage>=>get(viewId,options,true)as Promise<GroupedBoardPage>};
}
