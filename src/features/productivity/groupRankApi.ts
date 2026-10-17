import type {GroupRankPreviewInput,createGroupedBoardRanks} from '../../../server/productivity/groupedBoardRanks.js';
import {object,keys,text,integer,choice,boolean} from './validation.js';
import {calendarDate,utcInstant,timezoneFormatter} from './dates.js';
export type GroupRankPlan=ReturnType<ReturnType<typeof createGroupedBoardRanks>['preview']>;
type Read=(path:string,method?:string,body?:unknown,key?:string,signal?:AbortSignal)=>Promise<Record<string,any>>;
function fail():never{throw Error('Inconsistent grouped rank response');}
function group(value:unknown){const g=object(value);keys(g,['kind','value']);choice(g.kind,['priority','assignee','due','tag']);if(g.kind==='priority')choice(g.value,['high','medium','low','none']);else if(g.value!==null){text(g.value,256);if(g.kind==='due')calendarDate(g.value);}return g;}
function assertInput(input:GroupRankPreviewInput){keys(object(input),['viewId','taskId','group','beforeTaskId','timezone']);text(input.viewId,256);text(input.taskId,256);group(input.group);if(input.beforeTaskId!==null){text(input.beforeTaskId,256);if(input.beforeTaskId===input.taskId)fail();}if(input.timezone!==undefined)timezoneFormatter(input.timezone);}
function decode(value:unknown,input:GroupRankPreviewInput):GroupRankPlan{
 const p=object(value);keys(p,['id','viewId','viewRevision','boardId','boardRevision','taskId','taskRevision','group','beforeTaskId','rank','clock','expiresAt']);for(const k of ['id','viewId','boardId','taskId'])text(p[k],256);for(const k of ['viewRevision','boardRevision','taskRevision'])integer(p[k],1);integer(p.rank);const g=group(p.group),clock=object(p.clock);keys(clock,['nowUtc','timezone']);text(clock.timezone,100);timezoneFormatter(clock.timezone);text(clock.nowUtc,30);text(p.expiresAt,30);
 if(p.viewId!==input.viewId||p.taskId!==input.taskId||g.kind!==input.group.kind||g.value!==input.group.value||p.beforeTaskId!==input.beforeTaskId||clock.timezone!==(input.timezone??'Asia/Saigon')||utcInstant(p.expiresAt)<=utcInstant(clock.nowUtc))fail();return structuredClone(p)as GroupRankPlan;
}
/** Pure ordering SDK: no Task patch, inferred deadline or lifecycle command. */
export function createGroupRankApi(read:Read){return {
 async previewGroupedRank(input:GroupRankPreviewInput,options:{signal?:AbortSignal}={}):Promise<GroupRankPlan>{assertInput(input);const r=await read('/api/productivity/boards/grouped/rank/preview','POST',input,crypto.randomUUID(),options.signal);keys(r,['plan']);return decode(r.plan,input);},
 async applyGroupedRank(value:GroupRankPlan,key:string,options:{signal?:AbortSignal}={}):Promise<ReturnType<ReturnType<typeof createGroupedBoardRanks>['apply']>>{
  const input:GroupRankPreviewInput={viewId:value.viewId,taskId:value.taskId,group:value.group,beforeTaskId:value.beforeTaskId,timezone:value.clock.timezone};assertInput(input);const p=decode(value,input),r=object(await read('/api/productivity/boards/grouped/rank/apply','POST',{expectedRevision:p.taskRevision,input:{viewId:p.viewId,taskId:p.taskId,previewId:p.id,expectedViewRevision:p.viewRevision,expectedBoardRevision:p.boardRevision}},key,options.signal));
  keys(r,['viewId','boardId','listId','boardRevision','taskId','rank','taskChanged','rankChanged']);text(r.listId,256);boolean(r.rankChanged);integer(r.boardRevision,1);integer(r.rank);if(r.viewId!==p.viewId||r.boardId!==p.boardId||r.taskId!==p.taskId||r.taskChanged!==false||r.rank!==p.rank||r.boardRevision!==p.boardRevision+(r.rankChanged?1:0))fail();return structuredClone(r)as ReturnType<ReturnType<typeof createGroupedBoardRanks>['apply']>;
 }
};}
