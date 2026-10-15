import {Router,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {object,keys,integer} from '../../src/features/productivity/validation.js';
import {taskCommandContext,type TaskRequest,type ProductivityPorts} from './router.js';
/** Internal session-authenticated read/query and actor-owned configuration surfaces. */
export function queryRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:{view(actorId:string):void}){
 const router=Router();router.use(['/query','/selections','/views'],requireAuth,(_req,res,next)=>{if(!ports.active()||!ports.query||!ports.views){res.status(409).json({error:'Kho truy vấn chưa sẵn sàng.'});return;}next();});
 const handler=(fn:(req:TaskRequest)=>unknown):RequestHandler=>(req,res)=>{try{res.json(fn(req));}catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được truy vấn công việc.':error instanceof AppStoreError?error.message:'Dữ liệu truy vấn không hợp lệ.'});}};
 const empty=(body:unknown)=>{try{keys(object(body??{}),[]);}catch{throw new AppStoreError('Dữ liệu truy vấn không hợp lệ.',400);}};
 router.post('/query',handler(req=>ports.query!.query(req.userSession!,req.body)));
 router.post('/query/:id/selection',handler(req=>{empty(req.body);return ports.query!.select(req.userSession!,req.params.id);}));
 router.post('/selections/:id/resolve',handler(req=>{empty(req.body);return {rows:ports.query!.resolve(req.userSession!,req.params.id)};}));
 router.get('/query/tasks/:id',handler(req=>{const task=ports.query!.task(req.userSession!,req.params.id);if(!task)throw new AppStoreError('Không tìm thấy công việc.',404);return {task,readOnly:true};}));
 router.get('/views',handler(req=>({views:ports.views!.listViews(req.userSession!)})));
 router.get('/views/:id',handler(req=>({view:ports.views!.getView(req.userSession!,req.params.id)})));
 router.post('/views',handler(req=>{
  let body:Record<string,any>;try{body=object(req.body);keys(body,['expectedRevision','input']);integer(body.expectedRevision);object(body.input);}catch{throw new AppStoreError('Dữ liệu góc nhìn không hợp lệ.',400);}
  const ctx=taskCommandContext(req,body.expectedRevision),view=ports.views!.saveView(ctx,body.input);events.view(ctx.actor.userId);return {view};
 }));return router;
}
