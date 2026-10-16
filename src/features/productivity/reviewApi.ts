import type {CompletionResult}from'../../../server/productivity/completion.js';
import type {TaskRecord}from'./contracts.js';
import {object,keys,text,boolean,integer}from'./validation.js';
type Read=(path:string,method?:string,body?:unknown,requestId?:string,signal?:AbortSignal)=>Promise<Record<string,any>>;
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const stable=(task:TaskRecord)=>{const {revision:_r,lifecycle:_l,pendingApproval:_p,completedReferenceAt:_c,...fields}=task;return JSON.stringify(canonical({...fields,tagIds:[...fields.tagIds].sort()}));};
const fail=():never=>{throw Error('Inconsistent Task review receipt');};
/** Reuses P10; no board-specific approval writer or automatic retry. */
export function createReviewApi(read:Read,parse:{task(value:unknown,id?:string):TaskRecord}){
 const run=async(value:TaskRecord,operation:'approve'|'reject',reason:string|undefined,requestId:string,options:{signal?:AbortSignal}={}):Promise<CompletionResult>=>{
  const before=parse.task(value);integer(before.revision,1);text(requestId,256);if(!before.pendingApproval||before.lifecycle!=='in_progress'||before.deletedAt!==null)fail();if(operation==='reject')text(reason,8000);
  const result=object(await read('/api/productivity/tasks/'+encodeURIComponent(before.id)+'/'+operation,'POST',{expectedRevision:before.revision,...(operation==='reject'?{reason}: {})},requestId,options.signal));keys(result,['task','actualColumn','approvalNeeded','spawnedTaskIds','policy']);boolean(result.approvalNeeded);const task=parse.task(result.task,before.id);
  if(task.revision<=before.revision||stable(task)!==stable(before)||task.pendingApproval||result.approvalNeeded||result.policy!=='legacy-v1')fail();
  if(operation==='approve'){if(task.lifecycle!=='completed'||result.actualColumn!=='done')fail();}else if(task.lifecycle!=='in_progress'||result.actualColumn!==(task.blocked?'waiting':'doing'))fail();
  const spawned=Array.isArray(result.spawnedTaskIds)&&result.spawnedTaskIds.length<=1?result.spawnedTaskIds:fail();for(const id of spawned)text(id,256);if(new Set(spawned).size!==spawned.length||spawned.includes(task.id)||operation==='reject'&&spawned.length)fail();return structuredClone({...result,task,spawnedTaskIds:spawned})as CompletionResult;
 };
 return {approveTaskReview:(task:TaskRecord,requestId:string,options:{signal?:AbortSignal}={})=>run(task,'approve',undefined,requestId,options),rejectTaskReview:(task:TaskRecord,reason:string,requestId:string,options:{signal?:AbortSignal}={})=>run(task,'reject',reason,requestId,options)};
}
