import type {createWorkflowMoves,WorkflowPreviewInput}from'../../../server/productivity/workflowMoves.js';
import type {TaskCompletionProof}from'../../../server/productivity/completion.js';
import type {TaskRecord,QueryClock}from'./contracts.js';
import {object,keys,text,integer,boolean,choice}from'./validation.js';
import {utcInstant,timezoneFormatter}from'./dates.js';
export type WorkflowPlan=ReturnType<ReturnType<typeof createWorkflowMoves>['preview']>;
export type WorkflowResult=ReturnType<ReturnType<typeof createWorkflowMoves>['apply']>;
type Read=(path:string,method?:string,body?:unknown,requestId?:string,signal?:AbortSignal)=>Promise<Record<string,any>>;
const fail=():never=>{throw Error('Inconsistent workflow completion response');};
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const stableTask=(task:TaskRecord)=>{const {lifecycle:_l,pendingApproval:_p,revision:_r,completedReferenceAt:_c,...fields}=task;return canonical({...fields,tagIds:[...fields.tagIds].sort()});};
/** Leaving an optional note empty never clears existing Task evidence. */
export function workflowCompletionProof(note:string):TaskCompletionProof{text(note,8000,false);return note.trim()?{proofNote:note}:{};}
/** Session-only transport. A preview expresses intent; only the P10 response
 * supplies actual Review/Done, and no completion is retried automatically. */
export function createWorkflowApi(read:Read,parse:{task(value:unknown,id?:string):TaskRecord;clock(value:unknown):QueryClock}){
 const inputValue=(input:WorkflowPreviewInput)=>{keys(object(input),['viewId','taskId','targetColumnId','timezone']);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}for(const id of [input.viewId,input.taskId,input.targetColumnId])text(id,256);};
 const planValue=(value:unknown,input:WorkflowPreviewInput):WorkflowPlan=>{inputValue(input);const p=object(value);keys(p,['id','operation','viewId','viewRevision','boardId','boardRevision','taskId','taskRevision','targetColumnId','clock','expiresAt','before']);for(const id of [p.id,p.viewId,p.boardId,p.taskId,p.targetColumnId])text(id,256);for(const r of [p.viewRevision,p.boardRevision,p.taskRevision])integer(r,1);if(p.operation!=='complete'||p.taskId!==input.taskId||p.viewId!==input.viewId||p.targetColumnId!==input.targetColumnId)fail();const clock=parse.clock(p.clock),before=parse.task(p.before,input.taskId);if(clock.timezone!==(input.timezone??'Asia/Saigon')||before.revision!==p.taskRevision||before.pendingApproval||before.deletedAt!==null||['completed','wont_do'].includes(before.lifecycle))fail();utcInstant(p.expiresAt as string);if(Date.parse(p.expiresAt as string)<=Date.parse(clock.nowUtc))fail();return structuredClone({...p,clock,before})as WorkflowPlan;};
 return {
  async previewWorkflowCompletion(input:WorkflowPreviewInput,options:{signal?:AbortSignal}={}):Promise<WorkflowPlan>{inputValue(input);const r=await read('/api/productivity/boards/workflow/preview','POST',input,crypto.randomUUID(),options.signal);keys(r,['plan']);return planValue(r.plan,input);},
  async applyWorkflowCompletion(value:WorkflowPlan,proof:TaskCompletionProof,requestId:string,options:{signal?:AbortSignal}={}):Promise<WorkflowResult>{
   const plan=planValue(value,{viewId:value.viewId,taskId:value.taskId,targetColumnId:value.targetColumnId,timezone:value.clock.timezone});keys(object(proof),['proofImage','proofNote']);for(const [key,v]of Object.entries(proof))if(v!==null)text(v,key==='proofNote'?8000:6*1024*1024,false);
   const input={viewId:plan.viewId,taskId:plan.taskId,previewId:plan.id,targetColumnId:plan.targetColumnId,expectedViewRevision:plan.viewRevision,expectedBoardRevision:plan.boardRevision},r=object(await read('/api/productivity/boards/workflow/apply','POST',{expectedRevision:plan.taskRevision,input,proof},requestId,options.signal));keys(r,['task','actualColumn','approvalNeeded','spawnedTaskIds','policy','viewId','boardId','boardRevision','columnId']);boolean(r.approvalNeeded);choice(r.actualColumn,['review','done']);if(r.policy!=='legacy-v1'||r.viewId!==plan.viewId||r.boardId!==plan.boardId)fail();integer(r.boardRevision,1);text(r.columnId,256);if((r.boardRevision as number)<=plan.boardRevision)fail();const task=parse.task(r.task,plan.taskId);if(task.revision<=plan.taskRevision||JSON.stringify(stableTask(task))!==JSON.stringify(stableTask(plan.before)))fail();
   if(r.actualColumn==='review'){if(!r.approvalNeeded||!task.pendingApproval||task.lifecycle!=='in_progress'||r.columnId===plan.targetColumnId)fail();}else if(r.approvalNeeded||task.pendingApproval||task.lifecycle!=='completed'||r.columnId!==plan.targetColumnId)fail();
   const spawned=Array.isArray(r.spawnedTaskIds)&&r.spawnedTaskIds.length<=1?r.spawnedTaskIds:fail();for(const id of spawned)text(id,256);if(new Set(spawned).size!==spawned.length||spawned.includes(task.id)||r.actualColumn==='review'&&spawned.length)fail();return structuredClone({...r,task,spawnedTaskIds:spawned})as WorkflowResult;
  },
 };
}
