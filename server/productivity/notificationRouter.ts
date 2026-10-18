import {Router,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {object,keys,integer} from '../../src/features/productivity/validation.js';
import {taskCommandContext,type ProductivityPorts,type TaskRequest} from './router.js';
export const taskReminderRuleDto=(r:any)=>({id:r.id,taskId:r.task_id,recipientId:r.recipient_id,kind:r.kind,offsetMinutes:r.offset_minutes,fireAt:r.absolute_at,enabled:r.enabled===1,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at});
export function taskNotificationRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:{task(id:string):void;settings(id:string):void}){
 const router=Router();const gate:RequestHandler=(_req,res,next)=>{if(!ports.active()||!ports.notifications?.enabled()){res.status(409).json({error:'Kho nhắc lịch chưa được kích hoạt.'});return;}next();};
 const handler=(fn:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{try{res.json(fn(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được nhắc lịch.':error instanceof AppStoreError?error.message:'Dữ liệu nhắc lịch không hợp lệ.'});}};
 const body=(req:TaskRequest,fields:string[])=>{try{const value=object(req.body);keys(value,['expectedRevision',...fields]);integer(value.expectedRevision);for(const field of fields)if(!Object.hasOwn(value,field))throw Error();return value as Record<string,any>;}catch{throw new AppStoreError('Dữ liệu nhắc lịch không hợp lệ.',400);}},query=(req:TaskRequest)=>{try{keys(object(req.query),[]);}catch{throw new AppStoreError('Truy vấn nhắc lịch không hợp lệ.',400);}};
 router.get('/notification-preferences',requireAuth,gate,handler(req=>{query(req);return ports.notifications!.preferences(req.userSession!);}));
 router.put('/notification-preferences',requireAuth,gate,handler(req=>{const value=body(req,['input']),ctx=taskCommandContext(req,value.expectedRevision),result=ports.notifications!.savePreferences(ctx,value.input);events.settings(ctx.actor.userId);return result;}));
 router.get('/tasks/:id/reminders',requireAuth,gate,handler(req=>{query(req);const result=ports.notifications!.list(req.userSession!,req.params.id);return {...result,rules:result.rules.map(taskReminderRuleDto),claims:result.claims.map(r=>({id:r.id,ruleId:r.rule_id,recipientId:r.recipient_id,kind:r.kind,fireAt:r.fire_at,state:r.state}))};}));
 router.post('/tasks/:id/reminders',requireAuth,gate,handler(req=>{const value=body(req,['input']),result=ports.notifications!.scheduleTaskReminder(taskCommandContext(req,value.expectedRevision),req.params.id,value.input);events.task(req.params.id);return {rule:taskReminderRuleDto(result)};}));
 router.post('/reminders/:id/enabled',requireAuth,gate,handler(req=>{const value=body(req,['enabled']),result=ports.notifications!.setRuleEnabled(taskCommandContext(req,value.expectedRevision),req.params.id,value.enabled);events.task(result.task_id);return {rule:taskReminderRuleDto(result)};}));
 return router;
}
