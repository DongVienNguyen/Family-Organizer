import {Router,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {object,keys,integer} from '../../src/features/productivity/validation.js';
import {taskCommandContext,type TaskRequest,type ProductivityPorts} from './router.js';
import {validateMatrixApplyInput,type MatrixPreviewInput,type MatrixApplyInput} from './matrix.js';
interface MatrixEvents {previous(id:string):Set<string>;emit(id:string,previous?:Set<string>):void;view(actorId:string):void}
function body(req:TaskRequest):{expectedRevision:number;input:Record<string,any>}{try{const data=object(req.body);keys(data,['expectedRevision','input']);integer(data.expectedRevision);return {expectedRevision:data.expectedRevision as number,input:object(data.input)};}catch{throw new AppStoreError('Dữ liệu Matrix không hợp lệ.',400);}}
/** Existing application sessions only. Trusted clock, storage and writer are injected. */
export function matrixRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:MatrixEvents){
 const router=Router();router.use('/matrix',requireAuth,(_req,res,next)=>{if(!ports.active()||!ports.matrix){res.status(409).json({error:'Kho Matrix chưa sẵn sàng.'});return;}next();});
 const handler=(work:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{try{res.json(work(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được Matrix.':error instanceof AppStoreError?error.message:'Dữ liệu Matrix không hợp lệ.'});}};
 router.get('/matrix/:viewId',handler(req=>{try{keys(object(req.query),['timezone']);}catch{throw new AppStoreError('Dữ liệu Matrix không hợp lệ.',400);}return ports.matrix!.project(req.userSession!,req.params.viewId,req.query.timezone as string|undefined);}));
 router.post('/matrix/preview',handler(req=>({plan:ports.matrix!.preview(req.userSession!,req.body as MatrixPreviewInput)})));
 router.post('/matrix/apply',handler(req=>{const data=body(req),ctx=taskCommandContext(req,data.expectedRevision),input=data.input as unknown as MatrixApplyInput;validateMatrixApplyInput(input);let previous:Set<string>|undefined;
  if(input.mode==='attributes'){if(!ports.access.getTask(ctx.actor,input.taskId))throw new AppStoreError('Không tìm thấy công việc.',404);previous=events.previous(input.taskId);}
  const result=ports.matrix!.apply(ctx,input);if(result.taskChanged)events.emit(result.task.id,previous);events.view(ctx.actor.userId);return result;
 }));
 router.post('/matrix/reset-pin',handler(req=>{const data=body(req),ctx=taskCommandContext(req,data.expectedRevision),result=ports.matrix!.resetPin(ctx,data.input as {viewId:string;taskId:string;expectedPinRevision:number});events.view(ctx.actor.userId);return result;}));
 return router;
}
