import {Router,type RequestHandler} from 'express';
import {AppStoreError,httpErrorStatus} from '../appErrors.js';
import {object,keys,integer} from '../../src/features/productivity/validation.js';
import {taskCommandContext,type TaskRequest,type ProductivityPorts} from './router.js';
import type {BoardConfigureInput} from './boardCatalog.js';
/** Application-internal sessions and the existing I01 command/request owner. */
export function boardRouter(ports:ProductivityPorts,requireAuth:RequestHandler,events:{catalog(audience:Set<string>):void}){
 const router=Router();router.use('/boards',requireAuth,(_req,res,next)=>{if(!ports.active()||!ports.boards){res.status(409).json({error:'Kho bảng chưa sẵn sàng.'});return;}next();});
 router.post('/boards/configure',((req:TaskRequest,res)=>{
  try{
   let body:Record<string,any>;try{body=object(req.body);keys(body,['expectedRevision','input']);integer(body.expectedRevision);object(body.input);}catch{throw new AppStoreError('Dữ liệu bảng không hợp lệ.',400);}
   const ctx=taskCommandContext(req,body.expectedRevision),board=ports.boards!.configure(ctx,body.input as BoardConfigureInput),audience=ports.structureEvents?.catalogAudience({listId:board.listId})??new Set<string>();audience.add(ctx.actor.userId);events.catalog(audience);res.json({board});
  }catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status===500?'Không xử lý được cấu hình bảng.':error instanceof AppStoreError?error.message:'Dữ liệu bảng không hợp lệ.'});}
 })as RequestHandler);return router;
}
