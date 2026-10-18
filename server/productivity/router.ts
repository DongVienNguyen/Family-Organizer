import type {createTaskNotifications} from './notifications.js';
import type {createTaskNotificationJobs} from './notificationJobs.js';
import type {createTaskCollaboration} from './collaboration.js';
import type {createCalendar} from './calendar.js';
import type {createBoardCreation} from './boardCreation.js';
import type {createWorkflowTransitions}from'./workflowTransitions.js';
import type {createWorkflowMoves}from'./workflowMoves.js';
import type {createLegacyRecurrenceCutover} from './legacyRecurrenceCutover.js';
import type {createSeriesCommands} from './seriesCommands.js';
import type {createRecurrenceSeriesStore} from './seriesStore.js';
import type {createRecurrencePreviews} from './recurrencePreview.js';
import type {createGroupedBoardRanks} from './groupedBoardRanks.js';
import type {createGroupedBoardMoves} from './groupedBoardMoves.js';
import type {createGroupedBoardProjection} from './groupedBoard.js';
import type {createCompletionCommands} from './completion.js';
import type {TaskCompletionProof} from './completion.js';
import type {createBoardLayout} from './boardLayout.js';
import type {createBoardMoves} from './boardMoves.js';
import type {createBoardProjection} from './boardProjection.js';
import type {createBoardCatalog} from './boardCatalog.js';
import type {createMatrixCommands} from './matrix.js';
import {projectTaskRecord} from './query.js';
import type {createTaskQueryHttp} from './queryHttp.js';
import type {createTaskViews} from './views.js';
import type {createTaskPins} from './pins.js';
import {Router,type Request,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {getAppCommandContext} from '../commandContext.js';
import type {AppActor,AppCommand} from '../../src/features/productivity/contracts.js';
import {object,keys,integer,text} from '../../src/features/productivity/validation.js';
import type {createTaskAccess} from './access.js';
import type {createTaskCommands} from './tasks.js';
import type {StoredTask} from './store.js';
import type {createStructureCommands} from './structure.js';
import type {createStructureEventScope} from './structureEvents.js';
export interface ProductivityPorts {notifications?:ReturnType<typeof createTaskNotifications>;notificationJobs?:ReturnType<typeof createTaskNotificationJobs>;collaboration?:ReturnType<typeof createTaskCollaboration>;calendar?:ReturnType<typeof createCalendar>;boardCreation?:ReturnType<typeof createBoardCreation>;workflowTransitions?:ReturnType<typeof createWorkflowTransitions>;workflowMoves?:ReturnType<typeof createWorkflowMoves>;legacyCutover?:ReturnType<typeof createLegacyRecurrenceCutover>;seriesCommands?:ReturnType<typeof createSeriesCommands>;series?:ReturnType<typeof createRecurrenceSeriesStore>;recurrencePreview?:ReturnType<typeof createRecurrencePreviews>;groupedRanks?:ReturnType<typeof createGroupedBoardRanks>;groupedMoves?:ReturnType<typeof createGroupedBoardMoves>;groupedBoard?:ReturnType<typeof createGroupedBoardProjection>;completion?:ReturnType<typeof createCompletionCommands>;boardLayout?:ReturnType<typeof createBoardLayout>;boardMoves?:ReturnType<typeof createBoardMoves>;boardProjection?:ReturnType<typeof createBoardProjection>;boards?:ReturnType<typeof createBoardCatalog>;matrix?:ReturnType<typeof createMatrixCommands>;query?:ReturnType<typeof createTaskQueryHttp>;views?:ReturnType<typeof createTaskViews>;pins?:ReturnType<typeof createTaskPins>;active():boolean;access:ReturnType<typeof createTaskAccess>;commands:ReturnType<typeof createTaskCommands>;structure?:ReturnType<typeof createStructureCommands>;structureEvents?:ReturnType<typeof createStructureEventScope>}
export interface TaskRequest extends Request {userSession?:AppActor}
export const taskDto=(row:StoredTask)=>projectTaskRecord(row);
function requestBody(req:Request,field:'input'|'patch'):Record<string,any>{
 try{const body=object(req.body);keys(body,['expectedRevision',field]);integer(body.expectedRevision);const value=object(body[field]);
 for(const [key,item] of Object.entries(value))if(item===null&&['title','body','priority','due','isShared','tagIds','blocked'].includes(key))throw Error();
 return body;}catch{throw new AppStoreError('Dữ liệu công việc không hợp lệ.',400,'task-payload');}
}
export function taskCommandContext(req:TaskRequest,revision:number):AppCommand {
 const request=getAppCommandContext();if(!req.userSession||!request)throw new AppStoreError('Cần đăng nhập.',401);
 return {actor:{userId:req.userSession.userId,role:req.userSession.role},requestId:request.requestId,expectedRevision:revision};
}
/** Authenticated app-internal routes; no provider/API-token integration surface. */
export function taskRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:{previous(id:string):Set<string>;emit(id:string,previous?:Set<string>):void;rewards?(id:string):void;mentions?(userIds:string[]):void}){
 const router=Router();
 router.use(requireAuth,(req,res,next)=>{if(!ports.active()){res.status(409).json({error:'Kho công việc chưa được kích hoạt.'});return;}next();});
 const handler=(fn:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{
  try{res.json(fn(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được yêu cầu công việc.':error instanceof AppStoreError?error.message:'Dữ liệu công việc không hợp lệ.'});}
 };
 const completionBody=(req:TaskRequest,fields:string[])=>{try{const body=object(req.body);keys(body,['expectedRevision',...fields]);integer(body.expectedRevision);return body as Record<string,any>;}catch{throw new AppStoreError('Dữ liệu hoàn thành không hợp lệ.',400);}};
 router.get('/legacy-recurrence/:id/preview',handler(req=>{
  if(!ports.legacyCutover)throw new AppStoreError('Kho chuyển lịch lặp chưa sẵn sàng.',409);
  try{keys(object(req.query),[]);}catch{throw new AppStoreError('Truy vấn chuyển lịch lặp không hợp lệ.',400);}
  return {preview:ports.legacyCutover.preview(req.userSession!,req.params.id)};
 }));
 router.post('/legacy-recurrence/:id/cutover',handler(req=>{
  if(!ports.legacyCutover)throw new AppStoreError('Kho chuyển lịch lặp chưa sẵn sàng.',409);
  const body=completionBody(req,['input']),result=ports.legacyCutover.apply(taskCommandContext(req,body.expectedRevision),req.params.id,body.input);
  for(const id of new Set([result.series.taskId,...result.changedTaskIds]))events.emit(id);return result;
 }));
 router.post('/series',handler(req=>{
  if(!ports.series)throw new AppStoreError('Kho lịch lặp chưa sẵn sàng.',409);
  const body=completionBody(req,['taskId','policy']),series=ports.series.create(taskCommandContext(req,body.expectedRevision),body.taskId,body.policy);
  events.emit(series.taskId,events.previous(series.taskId));return {series};
 }));
 router.get('/series/:id/preview',handler(req=>{
  if(!ports.recurrencePreview)throw new AppStoreError('Kho xem lịch lặp chưa sẵn sàng.',409);
  return {occurrences:ports.recurrencePreview.previewOccurrences(req.userSession!,req.params.id,req.query)};
 }));
 router.get('/:id/series',handler(req=>{
  if(!ports.seriesCommands)throw new AppStoreError('Lệnh lịch lặp chưa sẵn sàng.',409);
  return ports.seriesCommands.seriesForTask(req.userSession!,req.params.id);
 }));
 router.post('/series/:id/edit',handler(req=>{
  if(!ports.seriesCommands)throw new AppStoreError('Lệnh lịch lặp chưa sẵn sàng.',409);
  const body=completionBody(req,['scope','patch']),result=ports.seriesCommands.editSeries(taskCommandContext(req,body.expectedRevision),req.params.id,body.scope,body.patch);
  for(const id of new Set([result.series.taskId,...result.changedTaskIds]))events.emit(id);
  return result;
 }));
 router.post('/occurrences/:id/skip',handler(req=>{
  if(!ports.seriesCommands)throw new AppStoreError('Lệnh lịch lặp chưa sẵn sàng.',409);
  const body=completionBody(req,['input']),ctx=taskCommandContext(req,body.expectedRevision);ports.access.assertTaskCommand(ctx.actor,req.params.id,'update');
  const previous=events.previous(req.params.id),result=ports.seriesCommands.skipOccurrence(ctx,req.params.id,body.input);
  events.emit(result.task.id,previous);for(const id of ports.seriesCommands.spawnedForEvents(result))events.emit(id);return result;
 }));
 for(const operation of ['complete','approve','reject','reopen']as const)router.post('/:id/'+operation,handler(req=>{if(!ports.completion)throw new AppStoreError('Kho hoàn thành công việc chưa sẵn sàng.',409);const body=completionBody(req,operation==='complete'?['proof']:operation==='reject'?['reason']:[]),ctx=taskCommandContext(req,body.expectedRevision);if(!ports.access.getTask(ctx.actor,req.params.id))throw new AppStoreError('Không tìm thấy công việc.',404);const previous=events.previous(req.params.id),result=operation==='complete'?ports.completion.requestCompletion(ctx,req.params.id,body.proof as TaskCompletionProof):operation==='approve'?ports.completion.approveCompletion(ctx,req.params.id):operation==='reopen'?ports.completion.reopenTask(ctx,req.params.id):ports.completion.rejectCompletion(ctx,req.params.id,body.reason);events.emit(result.task.id,previous);for(const id of ports.completion.spawnedForEvents(result))events.emit(id);if(result.task.lifecycle==='completed'||operation==='reopen')events.rewards?.(result.task.id);return result;}));
 const collaboration=()=>{if(!ports.collaboration)throw new AppStoreError('Kho cộng tác chưa sẵn sàng.',409);return ports.collaboration;};
 router.get('/:id/mention-candidates',handler(req=>{try{keys(object(req.query),[]);}catch{throw new AppStoreError('Truy vấn nhắc tên không hợp lệ.',400);}return collaboration().mentionCandidates(req.userSession!,req.params.id);}));
 for(const kind of ['comments','activities']as const)router.get('/:id/'+kind,handler(req=>{let cursor:string|null=null,limit=50;try{keys(object(req.query),['cursor','limit']);if(req.query.cursor!==undefined){text(req.query.cursor,2048);cursor=req.query.cursor as string;}if(req.query.limit!==undefined){if(typeof req.query.limit!=='string'||! /^[1-9][0-9]*$/.test(req.query.limit))throw Error();limit=Number(req.query.limit);integer(limit,1,100);}}catch{throw new AppStoreError('Truy vấn lịch sử không hợp lệ.',400);}return kind==='comments'?collaboration().getComments(req.userSession!,req.params.id,cursor,limit):collaboration().getActivities(req.userSession!,req.params.id,cursor,limit);}));
 router.post('/:id/comments',handler(req=>{const body=completionBody(req,['input']),ctx=taskCommandContext(req,body.expectedRevision);ports.access.assertTaskCommand(ctx.actor,req.params.id,'update');const previous=events.previous(req.params.id);return collaboration().addTaskComment(ctx,req.params.id,body.input,userIds=>{events.emit(req.params.id,previous);if(userIds.length)events.mentions?.(userIds);});}));
 router.get('/',handler(req=>{const tasks=ports.access.listTasks(req.userSession!);return {tasks:tasks.map(taskDto),totalUnique:tasks.length};}));
 router.get('/:id',handler(req=>{const task=ports.access.getTask(req.userSession!,req.params.id);if(!task)throw new AppStoreError('Không tìm thấy công việc.',404);return {task:taskDto(task)};}));
 router.post('/',handler(req=>{const body=requestBody(req,'input');const task=ports.commands.createTask(taskCommandContext(req,body.expectedRevision),body.input);events.emit(task.id);return {task:taskDto(task)};}));
 router.patch('/:id',handler(req=>{try{text(req.params.id,256);}catch{throw new AppStoreError('Mã công việc không hợp lệ.',400);}const body=requestBody(req,'patch');ports.access.assertTaskCommand(req.userSession!,req.params.id,'update');const previous=events.previous(req.params.id);const task=ports.commands.updateTask(taskCommandContext(req,body.expectedRevision),req.params.id,body.patch);events.emit(task.id,previous);return {task:taskDto(task)};}));
 return router;
}
