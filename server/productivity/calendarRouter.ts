import {Router,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {object,keys,integer,text} from '../../src/features/productivity/validation.js';
import {taskCommandContext,type TaskRequest,type ProductivityPorts} from './router.js';
/** Session-authenticated calendar projections and reviewed commands only. */
export function calendarRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:{previous(id:string):Set<string>;emit(id:string,previous?:Set<string>):void}){
 const router=Router();router.use(requireAuth,(_req,res,next)=>{if(!ports.active()||!ports.calendar){res.status(409).json({error:'Kho lịch công việc chưa sẵn sàng.'});return;}next();});
 const body=(req:TaskRequest,fields:string[])=>{try{const value=object(req.body);keys(value,fields);return value;}catch{throw new AppStoreError('Dữ liệu lịch không hợp lệ.',400);}};
 const handler=(fn:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{try{res.json(fn(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được lịch công việc.':error instanceof AppStoreError?error.message:'Dữ liệu lịch không hợp lệ.'});}};
 router.post('/query',handler(req=>{const value=body(req,['range','filter']);return ports.calendar!.getCalendar(req.userSession!,value.range,undefined,value.filter as any);}));
 router.post('/reschedule/preview',handler(req=>{const value=body(req,['input']);return {preview:ports.calendar!.previewReschedule(req.userSession!,value.input)};}));
 router.post('/reschedule/apply',handler(req=>{const value=body(req,['expectedRevision','input']);let input:Record<string,unknown>;try{integer(value.expectedRevision);input=object(value.input);text(input.taskId,256);}catch{throw new AppStoreError('Dữ liệu xác nhận lịch không hợp lệ.',400);}const previous=events.previous(input.taskId as string),result=ports.calendar!.applyReschedule(taskCommandContext(req,value.expectedRevision as number),input as any);events.emit(result.task.id,previous);return result;}));
 return router;
}
