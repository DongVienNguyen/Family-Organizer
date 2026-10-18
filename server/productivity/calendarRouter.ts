import {Router,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {object,keys,integer} from '../../src/features/productivity/validation.js';
import {taskCommandContext,type TaskRequest,type ProductivityPorts} from './router.js';
/** Session-authenticated calendar projections and reviewed commands only. */
export function calendarRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:{previous(id:string):Set<string>;emit(id:string,previous?:Set<string>):void}){
 const router=Router();router.use(requireAuth,(_req,res,next)=>{if(!ports.active()||!ports.calendar){res.status(409).json({error:'Kho lịch công việc chưa sẵn sàng.'});return;}next();});
 const handler=(fn:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{try{res.json(fn(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được lịch công việc.':error instanceof AppStoreError?error.message:'Dữ liệu lịch không hợp lệ.'});}};
 router.post('/query',handler(req=>{const body=object(req.body);keys(body,['range','filter']);return ports.calendar!.getCalendar(req.userSession!,body.range,undefined,body.filter as any);}));
 router.post('/reschedule/preview',handler(req=>{const body=object(req.body);keys(body,['input']);return {preview:ports.calendar!.previewReschedule(req.userSession!,body.input)};}));
 router.post('/reschedule/apply',handler(req=>{const body=object(req.body);keys(body,['expectedRevision','input']);integer(body.expectedRevision);const input=object(body.input),previous=events.previous(input.taskId as string),result=ports.calendar!.applyReschedule(taskCommandContext(req,body.expectedRevision),input as any);events.emit(result.task.id,previous);return result;}));
 return router;
}
