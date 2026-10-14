import {Router,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {object,keys,integer} from '../../src/features/productivity/validation.js';
import {taskDto,taskCommandContext,type TaskRequest,type ProductivityPorts} from './router.js';
export interface StructureScope {taskId?:string;listId?:string;sectionId?:string;tagId?:string}
export interface StructureEvents {previous(id:string):Set<string>;emit(id:string,previous?:Set<string>):void;catalog(audience:Set<string>):void;pin?(actorId:string):void}
function body(req:TaskRequest,field:'input'|null='input'):Record<string,any>{
 try{const data=object(req.body);keys(data,field?['expectedRevision',field]:['expectedRevision']);integer(data.expectedRevision);if(field&&!Object.hasOwn(data,field))throw Error();return data;}catch{throw new AppStoreError('Dữ liệu cấu trúc không hợp lệ.',400,'task-structure-payload');}
}
function inputObject(value:unknown,allowed?:string[]):Record<string,any>{try{const input=object(value);if(allowed)keys(input,allowed);return input;}catch{throw new AppStoreError('Dữ liệu cấu trúc không hợp lệ.',400,'task-structure-payload');}}
/** Session-authenticated application routes; storage and command ownership stay injected. */
export function structureRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:StructureEvents){
 const router=Router();
 router.use(requireAuth,(_req,res,next)=>{if(!ports.active()||!ports.structure||!ports.structureEvents){res.status(409).json({error:'Kho cấu trúc chưa được kích hoạt.'});return;}next();});
 const handler=(fn:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{try{res.json(fn(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được cấu trúc công việc.':error instanceof AppStoreError?error.message:'Dữ liệu cấu trúc không hợp lệ.'});}};
 const mutate=<T>(req:TaskRequest,scope:StructureScope,command:()=>T,afterScope:(result:T)=>StructureScope=()=>scope):T=>{
  const meta=ports.structureEvents!,ids=meta.taskIds(scope),previous=new Map(ids.map(id=>[id,events.previous(id)])),catalog=meta.catalogAudience(scope);
  const result=command(),after=afterScope(result);for(const id of new Set([...ids,...meta.taskIds(after)]))events.emit(id,previous.get(id));for(const userId of meta.catalogAudience(after))catalog.add(userId);catalog.add(req.userSession!.userId);events.catalog(catalog);return result;
 };
 router.get('/task-pins',handler(req=>{if(!ports.pins)throw new AppStoreError('Kho ghim chưa sẵn sàng.',409);return {pins:ports.pins.listPins(req.userSession!)};}));
 router.get('/tasks/:id/pin',handler(req=>{if(!ports.pins)throw new AppStoreError('Kho ghim chưa sẵn sàng.',409);return {pin:ports.pins.getPin(req.userSession!,req.params.id)};}));
 router.post('/tasks/:id/pin',handler(req=>{if(!ports.pins)throw new AppStoreError('Kho ghim chưa sẵn sàng.',409);const data=body(req),input=inputObject(data.input,['pinned']),ctx=taskCommandContext(req,data.expectedRevision),pin=ports.pins.setPin(ctx,req.params.id,input.pinned);events.pin?.(ctx.actor.userId);return {pin};}));
 router.get('/catalog',handler(req=>ports.structure!.getCatalog(req.userSession!)));
 router.get('/roots',handler(req=>{const result=ports.structure!.listRootTasks(req.userSession!);return {tasks:result.items.map(taskDto),totalUnique:result.totalUnique};}));
 router.get('/tasks/:id/checklist',handler(req=>{const checklist=ports.structure!.getChecklist(req.userSession!,req.params.id),task=ports.access.getTask(req.userSession!,req.params.id)!;return {checklist:{taskId:task.id,revision:task.revision,...checklist}};}));
 router.post('/lists',handler(req=>{const data=body(req),input=inputObject(data.input),ctx=taskCommandContext(req,data.expectedRevision),scope={listId:typeof input.id==='string'?input.id:undefined};return {list:mutate(req,scope,()=>ports.structure!.saveList(ctx,input as any),result=>({listId:result.id}))};}));
 router.post('/sections',handler(req=>{const data=body(req),input=inputObject(data.input),ctx=taskCommandContext(req,data.expectedRevision);return {section:mutate(req,{listId:typeof input.listId==='string'?input.listId:undefined},()=>ports.structure!.saveSection(ctx,input as any))};}));
 router.post('/tags',handler(req=>{const data=body(req),input=inputObject(data.input),ctx=taskCommandContext(req,data.expectedRevision);return {tag:mutate(req,{tagId:typeof input.id==='string'?input.id:undefined},()=>ports.structure!.saveTag(ctx,input as any),result=>({tagId:result.id}))};}));
 router.post('/lists/:id/grant',handler(req=>{const data=body(req),ctx=taskCommandContext(req,data.expectedRevision);return {list:mutate(req,{listId:req.params.id},()=>ports.structure!.setListGrant(ctx,req.params.id,data.input))};}));
 router.post('/sections/:id/archive',handler(req=>{const data=body(req,null),ctx=taskCommandContext(req,data.expectedRevision);return {section:mutate(req,{sectionId:req.params.id},()=>ports.structure!.archiveSection(ctx,req.params.id))};}));
 router.post('/tasks/:id/list',handler(req=>{const data=body(req),input=inputObject(data.input,['listId','sectionId']);const ctx=taskCommandContext(req,data.expectedRevision);return {task:taskDto(mutate(req,{taskId:req.params.id},()=>ports.structure!.moveTaskToList(ctx,req.params.id,input.listId,input.sectionId)))};}));
 router.post('/tasks/:id/subtasks',handler(req=>{const data=body(req),input=inputObject(data.input),ctx=taskCommandContext(req,data.expectedRevision);return {task:taskDto(mutate(req,{taskId:req.params.id},()=>ports.structure!.createSubtask(ctx,req.params.id,input as any),result=>({taskId:result.id})))};}));
 router.post('/tasks/:id/parent',handler(req=>{const data=body(req),input=inputObject(data.input,['parentId']);const ctx=taskCommandContext(req,data.expectedRevision);return {task:taskDto(mutate(req,{taskId:req.params.id},()=>ports.structure!.setTaskParent(ctx,req.params.id,input.parentId)))};}));
 router.post('/tasks/:id/checklist',handler(req=>{const data=body(req),ctx=taskCommandContext(req,data.expectedRevision);return {checklist:mutate(req,{taskId:req.params.id},()=>ports.structure!.setChecklist(ctx,req.params.id,data.input))};}));
 return router;
}
