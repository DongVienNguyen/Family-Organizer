import {Router,type Request,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {getAppCommandContext} from '../commandContext.js';
import type {AppActor,AppCommand} from '../../src/features/productivity/contracts.js';
import {object,keys,integer,text} from '../../src/features/productivity/validation.js';
import type {createTaskAccess} from './access.js';
import type {createTaskCommands} from './tasks.js';
import type {StoredTask} from './store.js';
export interface ProductivityPorts {active():boolean;access:ReturnType<typeof createTaskAccess>;commands:ReturnType<typeof createTaskCommands>}
interface TaskRequest extends Request {userSession?:AppActor}
const dto=(row:StoredTask)=>{const {legacy:_,rank:__,...task}=row;return task;};
function requestBody(req:Request,field:'input'|'patch'):Record<string,any>{
 try{const body=object(req.body);keys(body,['expectedRevision',field]);integer(body.expectedRevision);const value=object(body[field]);
 for(const [key,item] of Object.entries(value))if(item===null&&['title','body','priority','due','isShared','tagIds','blocked'].includes(key))throw Error();
 return body;}catch{throw new AppStoreError('Dữ liệu công việc không hợp lệ.',400,'task-payload');}
}
function context(req:TaskRequest,revision:number):AppCommand {
 const request=getAppCommandContext();if(!req.userSession||!request)throw new AppStoreError('Cần đăng nhập.',401);
 return {actor:{userId:req.userSession.userId,role:req.userSession.role},requestId:request.requestId,expectedRevision:revision};
}
/** Authenticated app-internal routes; no provider/API-token integration surface. */
export function taskRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:{previous(id:string):Set<string>;emit(id:string,previous?:Set<string>):void}){
 const router=Router();
 router.use(requireAuth,(req,res,next)=>{if(!ports.active()){res.status(409).json({error:'Kho công việc chưa được kích hoạt.'});return;}next();});
 const handler=(fn:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{
  try{res.json(fn(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được yêu cầu công việc.':error instanceof AppStoreError?error.message:'Dữ liệu công việc không hợp lệ.'});}
 };
 router.get('/',handler(req=>{const tasks=ports.access.listTasks(req.userSession!);return {tasks:tasks.map(dto),totalUnique:tasks.length};}));
 router.get('/:id',handler(req=>{const task=ports.access.getTask(req.userSession!,req.params.id);if(!task)throw new AppStoreError('Không tìm thấy công việc.',404);return {task:dto(task)};}));
 router.post('/',handler(req=>{const body=requestBody(req,'input');const task=ports.commands.createTask(context(req,body.expectedRevision),body.input);events.emit(task.id);return {task:dto(task)};}));
 router.patch('/:id',handler(req=>{try{text(req.params.id,256);}catch{throw new AppStoreError('Mã công việc không hợp lệ.',400);}const body=requestBody(req,'patch');ports.access.assertTaskCommand(req.userSession!,req.params.id,'update');const previous=events.previous(req.params.id);const task=ports.commands.updateTask(context(req,body.expectedRevision),req.params.id,body.patch);events.emit(task.id,previous);return {task:dto(task)};}));
 return router;
}
