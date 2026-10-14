import type {TaskPin} from '../../../server/productivity/pins.js';
import {assertTaskRecord,type TaskRecord,type TaskPatch} from './contracts.js';
import type {CreateTaskInput} from '../../../server/productivity/tasks.js';
import type {TaskList,TaskSection,TaskTag,CheckItemInput} from '../../../server/productivity/structure.js';
import {object,keys,text,integer,boolean,strings,choice} from './validation.js';
import {assertDue} from './dates.js';
export interface TaskCatalog {lists:TaskList[];sections:TaskSection[];tags:TaskTag[]}
export interface TaskChecklist {taskId:string;revision:number;items:{id:string;text:string;done:boolean}[];progress:number}
export class TaskApiError extends Error {constructor(readonly status:number,message:string){super(message);}}
const fields=['id','listId','sectionId','parentId','title','body','lifecycle','priority','due','scheduledStart','scheduledEnd','creatorId','assigneeId','isShared','tagIds','blocked','blockedReason','pendingApproval','rewardPoints','revision','deletedAt'] as const;
function taskValue(value:unknown,id?:string):TaskRecord {assertTaskRecord(value);if(id!==undefined&&value.id!==id)throw Error('Task response identity mismatch');return structuredClone(Object.fromEntries(fields.map(key=>[key,value[key]]))) as TaskRecord;}
function validatePatch(value:unknown,allowed:string[]):void {
 const patch=object(value);keys(patch,allowed);
 for(const field of ['title','listId'])if(patch[field]!==undefined)text(patch[field],field==='title'?500:256);
 if(patch.body!==undefined)text(patch.body,100000,false);if(patch.priority!==undefined)choice(patch.priority,['high','medium','low','none']);if(patch.due!==undefined)assertDue(patch.due);
 if(patch.assigneeId!==undefined&&patch.assigneeId!==null)text(patch.assigneeId,256);if(patch.tagIds!==undefined)strings(patch.tagIds);
 for(const field of ['blocked','isShared'])if(patch[field]!==undefined)boolean(patch[field]);
}
function checklistValue(value:unknown,id:string):TaskChecklist {
 const list=object(value);if(list.taskId!==id||!Array.isArray(list.items)||list.items.length>200)throw Error('Invalid checklist response');integer(list.revision,1);integer(list.progress,0,100);
 const seen=new Set<string>(),items=list.items.map(item=>{const row=object(item);text(row.id,256);text(row.text,2000);boolean(row.done);if(seen.has(row.id))throw Error('Duplicate checklist ID');seen.add(row.id);return {id:row.id,text:row.text,done:row.done};});
 if(list.progress!==(items.length?Math.round(items.filter(item=>item.done).length/items.length*100):0))throw Error('Invalid checklist progress');return {taskId:id,revision:list.revision,items,progress:list.progress};
}
/** Transport uses existing internal session/auth. Caller owns command keys; no automatic retries or offline queue. */
export function createTaskApi(ports:{request:typeof fetch;authHeaders:()=>HeadersInit}) {
 const idPath=(id:string)=>{text(id,256);return '/api/productivity/tasks/'+encodeURIComponent(id);};
 const read=async(path:string,method='GET',body?:unknown,requestId?:string):Promise<Record<string,any>>=>{
  const headers=new Headers(ports.authHeaders());if(!headers.get('Authorization'))throw new TaskApiError(401,'Cần đăng nhập.');
  if(method!=='GET'){if(typeof requestId!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(requestId))throw Error('Invalid command identity');headers.set('x-request-id',requestId);headers.set('Content-Type','application/json');}
  const response=await ports.request(path,{method,headers,cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data:unknown;try{data=await response.json();}catch{throw new TaskApiError(response.status,'Phản hồi công việc không hợp lệ.');}
  if(!response.ok)throw new TaskApiError(response.status,typeof (data as any)?.error==='string'?(data as any).error.slice(0,500):'Không xử lý được yêu cầu công việc.');return object(data);
 };
 const writeTask=async(id:string,operation:'list'|'parent',revision:number,input:unknown,requestId:string)=>{integer(revision,1);const data=await read(idPath(id)+'/'+operation,'POST',{expectedRevision:revision,input},requestId);return taskValue(data.task,id);};
 return {
  async task(id:string){const data=await read(idPath(id));return taskValue(data.task,id);},
  async tasks(){const data=await read('/api/productivity/tasks');if(!Array.isArray(data.tasks))throw Error('Invalid task list');const tasks=data.tasks.map((item:unknown)=>taskValue(item));if(new Set(tasks.map((item:TaskRecord)=>item.id)).size!==tasks.length)throw Error('Duplicate task IDs');return tasks;},
  async catalog():Promise<TaskCatalog>{const data=await read('/api/productivity/catalog');for(const field of ['lists','sections','tags'])if(!Array.isArray(data[field]))throw Error('Invalid task catalog');return {lists:data.lists,sections:data.sections,tags:data.tags};},
  async patch(id:string,revision:number,patch:TaskPatch,requestId:string){integer(revision,1);validatePatch(patch,['title','body','priority','due','scheduledStart','scheduledEnd','assigneeId','blocked','blockedReason','tagIds']);const data=await read(idPath(id),'PATCH',{expectedRevision:revision,patch},requestId);return taskValue(data.task,id);},
  async create(input:CreateTaskInput,requestId:string){validatePatch(input,['listId','title','body','due','priority','assigneeId','isShared','tagIds']);text(input.listId,256);text(input.title,500);const data=await read('/api/productivity/tasks','POST',{expectedRevision:0,input},requestId);return taskValue(data.task);},
  async createList(title:string,isShared:boolean,requestId:string){text(title,500);boolean(isShared);const data=await read('/api/productivity/lists','POST',{expectedRevision:0,input:{title,isShared}},requestId);return data.list as TaskList;},
  async createSection(listId:string,title:string,requestId:string){text(listId,256);text(title,500);const data=await read('/api/productivity/sections','POST',{expectedRevision:0,input:{listId,title}},requestId);return data.section as TaskSection;},
  async createTag(name:string,requestId:string){text(name,256);const data=await read('/api/productivity/tags','POST',{expectedRevision:0,input:{name}},requestId);return data.tag as TaskTag;},
  async pins():Promise<TaskPin[]>{const data=await read('/api/productivity/task-pins');if(!Array.isArray(data.pins))throw Error('Invalid task pins');const seen=new Set<string>();return data.pins.map((value:unknown)=>{const pin=object(value);text(pin.taskId,256);boolean(pin.pinned);integer(pin.revision,1);if(seen.has(pin.taskId))throw Error('Duplicate pin IDs');seen.add(pin.taskId);return {taskId:pin.taskId,pinned:pin.pinned,revision:pin.revision};});},
  async setPin(id:string,revision:number,pinned:boolean,requestId:string):Promise<TaskPin>{integer(revision);boolean(pinned);const data=await read(idPath(id)+'/pin','POST',{expectedRevision:revision,input:{pinned}},requestId),pin=object(data.pin);if(pin.taskId!==id||pin.pinned!==pinned)throw Error('Pin response mismatch');integer(pin.revision,1);return {taskId:id,pinned,revision:pin.revision};},
  async checklist(id:string){const data=await read(idPath(id)+'/checklist');return checklistValue(data.checklist,id);},
  async setChecklist(id:string,revision:number,input:CheckItemInput[],requestId:string){integer(revision,1);if(!Array.isArray(input)||input.length>200)throw Error('Invalid checklist');for(const item of input){const row=object(item);keys(row,['id','text','done']);text(row.text,2000);boolean(row.done);if(row.id!==undefined)text(row.id,256);}const data=await read(idPath(id)+'/checklist','POST',{expectedRevision:revision,input},requestId);return checklistValue(data.checklist,id);},
  async createSubtask(parentId:string,revision:number,input:Omit<CreateTaskInput,'listId'>,requestId:string){integer(revision,1);validatePatch(input,['title','body','due','priority','assigneeId','isShared','tagIds']);const data=await read(idPath(parentId)+'/subtasks','POST',{expectedRevision:revision,input},requestId);return taskValue(data.task);},
  moveToList:(id:string,revision:number,listId:string,sectionId:string|null,requestId:string)=>writeTask(id,'list',revision,{listId,sectionId},requestId),
  setParent:(id:string,revision:number,parentId:string|null,requestId:string)=>writeTask(id,'parent',revision,{parentId},requestId),
 };
}
export type TaskApi=ReturnType<typeof createTaskApi>;
