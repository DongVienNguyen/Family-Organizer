import {Router,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {object,keys,integer} from '../../src/features/productivity/validation.js';
import {taskCommandContext,taskDto,type ProductivityPorts,type TaskRequest} from './router.js';
export function taskTemplateRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:{task(id:string):void;settings(id:string):void}){
 const router=Router(),gate:RequestHandler=(_req,res,next)=>{if(!ports.active()||!ports.templates?.enabled()){res.status(409).json({error:'Kho mẫu công việc chưa được kích hoạt.'});return;}next();};
 const handler=(fn:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{try{res.json(fn(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được mẫu công việc.':error instanceof AppStoreError?error.message:'Dữ liệu mẫu công việc không hợp lệ.'});}};
 const body=(req:TaskRequest,input=false)=>{try{const value=object(req.body);keys(value,input?['expectedRevision','input']:['expectedRevision']);integer(value.expectedRevision);if(input)object(value.input);return value as Record<string,any>;}catch{throw new AppStoreError('Dữ liệu mẫu công việc không hợp lệ.',400);}},query=(req:TaskRequest)=>{try{keys(object(req.query),[]);}catch{throw new AppStoreError('Truy vấn mẫu công việc không hợp lệ.',400);}};
 router.get('/templates',requireAuth,gate,handler(req=>{query(req);return {items:ports.templates!.listTemplates(req.userSession!)};}));
 router.get('/templates/:id',requireAuth,gate,handler(req=>{query(req);return {template:ports.templates!.getTemplate(req.userSession!,req.params.id)};}));
 router.post('/tasks/:id/templates',requireAuth,gate,handler(req=>{const value=body(req),ctx=taskCommandContext(req,value.expectedRevision),template=ports.templates!.saveTaskTemplate(ctx,req.params.id);events.settings(ctx.actor.userId);return {template};}));
 router.post('/templates/:id/instantiate',requireAuth,gate,handler(req=>{const value=body(req,true),task=ports.templates!.instantiateTemplate(taskCommandContext(req,value.expectedRevision),req.params.id,value.input);events.task(task.id);return {task:taskDto(task)};}));
 router.delete('/templates/:id',requireAuth,gate,handler(req=>{const value=body(req),ctx=taskCommandContext(req,value.expectedRevision),result=ports.templates!.deleteTemplate(ctx,req.params.id);events.settings(ctx.actor.userId);return result;}));
 return router;
}
