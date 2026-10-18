import {productivityVersionsFrom} from './knownVersions.js';
import {hasLegacyRecurrenceLineage} from './legacyRecurrenceFamily.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {createHash,randomUUID} from 'node:crypto';
import {UserRole} from '../../src/types.js';
import type {AppActor,AppCommand} from '../../src/features/productivity/contracts.js';
import {integer,text} from '../../src/features/productivity/validation.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {assertContext} from './tasks.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {normalizeRecurrencePolicy} from './recurrencePolicy.js';
import {decodeSeries,decodeSeriesException,normalizeSeriesException} from './seriesRecord.js';

const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'recurrence-series');};
/** Durable configuration only. No occurrence/Task generation, completion,
 * reward, rotation advancement, delivery or automatic migration is performed. */
export function createRecurrenceSeriesStore(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;now?:()=>number;afterWrite?():void}){
 const now=()=>new Date((ports.now??Date.now)()).toISOString();
 const context=(reader:TaskReader,ctx:AppCommand)=>{
  const user=assertContext(ctx,reader);
  if(![UserRole.ADMIN,UserRole.MEMBER].includes(user.role))fail(403,'Cần người lớn quản lý lịch lặp.');
  if(!productivityVersionsFrom(10).includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))fail(409,'Cần migration series trước khi dùng.');
 };
 const task=(reader:TaskReader,ctx:AppCommand,id:string)=>{context(reader,ctx);return createTaskAccess(reader).assertTaskCommand(ctx.actor,id,'update');};
 const series=(reader:TaskReader,ctx:AppCommand,id:string)=>{
  context(reader,ctx);try{text(id,256);}catch{fail(400,'Mã lịch lặp không hợp lệ.');}
  const row=reader.get('SELECT * FROM productivity_series WHERE id=?',id);if(!row)fail(404,'Không tìm thấy lịch lặp.');
  try{task(reader,ctx,row.task_id);}catch(error){if(error instanceof AppStoreError&&[403,404].includes(error.status))fail(404,'Không tìm thấy lịch lặp.');throw error;}return decodeSeries(row);
 };
 const run=<T>(ctx:AppCommand,command:string,payload:unknown,work:(tx:AppWriteTx)=>T)=>ports.write({actorId:ctx.actor.userId,command:'productivity:series:'+command,requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')},work);
 const readContext=(actor:AppActor):AppCommand=>({actor,requestId:'recurrence:read',expectedRevision:0});
 return {
  get(actor:AppActor,id:string){return series(ports.reader,readContext(actor),id);},
  create(ctx:AppCommand,taskId:string,input:unknown){
   try{text(taskId,256);}catch{fail(400,'Mã công việc không hợp lệ.');}
   task(ports.reader,ctx,taskId);let policy:ReturnType<typeof normalizeRecurrencePolicy>;
   try{policy=normalizeRecurrencePolicy(input);}catch{ return fail(422,'Cấu hình lịch lặp không hợp lệ.');}
   const result=run(ctx,'create',{taskId,expectedTaskRevision:ctx.expectedRevision,policy},tx=>{
    const source=task(tx,ctx,taskId);
    if(source.revision!==ctx.expectedRevision)fail(409,'Công việc vừa thay đổi.');
    if(productivityVersionsFrom(13).includes(tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version)&&hasLegacyRecurrenceLineage(tx,taskId))fail(409,'Cần chuyển lịch lặp cũ qua quy trình nghiệm thu riêng.');
    if(source.parentId!==null||source.pendingApproval||!['todo','in_progress'].includes(source.lifecycle))fail(422,'Chỉ tạo lịch lặp từ công việc gốc đang thực hiện.');
    if(source.legacy.recurrenceType&&source.legacy.recurrenceType!=='none')fail(409,'Cần chuyển lịch lặp cũ qua quy trình nghiệm thu riêng.');
    if(tx.get('SELECT id FROM productivity_series WHERE task_id=?',taskId))fail(409,'Công việc đã có lịch lặp.');
    if(productivityVersionsFrom(11).includes(tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version)&&tx.get('SELECT task_id FROM productivity_series_occurrences WHERE task_id=?',taskId))fail(409,'Kỳ đã thuộc một lịch lặp.');
    if(policy.base==='due'&&source.due.kind==='none'||source.due.kind!=='none'&&source.due.timezone!==policy.timezone)fail(422,'Mốc hạn chót và múi giờ không khớp.');
    for(const id of policy.rotationMembers)if(!tx.legacy.users.some(user=>user.id===id&&!user.isDeleted&&Object.values(UserRole).includes(user.role)))fail(422,'Thành viên luân phiên không hợp lệ.');
    const origin=policy.rotationMembers.findIndex(id=>id===source.assigneeId),rotationCursor=origin>=0?origin:Math.max(0,policy.rotationMembers.length-1);
    const id=randomUUID(),time=now();tx.run('INSERT INTO productivity_series VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,taskId,1,JSON.stringify(policy),JSON.stringify(source.due),1,0,rotationCursor,null,time,time);ports.afterWrite?.();return {id};
   });
   return series(ports.reader,ctx,result.id);
  },
  exceptions(actor:AppActor,id:string){
   series(ports.reader,readContext(actor),id);return ports.reader.all('SELECT * FROM productivity_series_exceptions WHERE series_id=? ORDER BY ordinal',id).map(decodeSeriesException);
  },
  saveException(ctx:AppCommand,id:string,ordinal:number,input:unknown){
   series(ports.reader,ctx,id);let value:ReturnType<typeof normalizeSeriesException>;
   try{integer(ordinal,0,100000);value=normalizeSeriesException(input);}catch{return fail(422,'Ngoại lệ lịch lặp không hợp lệ.');}
   run(ctx,'exception',{id,ordinal,expectedRevision:ctx.expectedRevision,input:value},tx=>{
    const current=series(tx,ctx,id);if(current.revision!==ctx.expectedRevision)fail(409,'Lịch lặp vừa thay đổi.');
    if(current.endedAt!==null||ordinal<current.nextOrdinal)fail(422,'Không sửa lại kỳ đã phát sinh qua cấu hình tương lai.');
    if(current.policy.end.kind==='count'&&ordinal>=current.policy.end.count)fail(422,'Kỳ vượt giới hạn số lần lặp.');
    if(value.kind==='due'&&value.due.kind!=='none'&&value.due.timezone!==current.policy.timezone)fail(422,'Múi giờ ngoại lệ không khớp.');
    const before=tx.get('SELECT revision FROM productivity_series_exceptions WHERE series_id=? AND ordinal=?',id,ordinal),revision=(before?.revision??0)+1;
    if(!Number.isSafeInteger(revision)||current.revision===Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản lịch lặp đã đạt giới hạn.');
    const time=now();if(utcInstant(time)<utcInstant(current.updatedAt))fail(409,'Đồng hồ lịch lặp đã lùi.');
    tx.run('INSERT INTO productivity_series_exceptions VALUES(?,?,?,?,?) ON CONFLICT(series_id,ordinal)DO UPDATE SET kind=excluded.kind,due_json=excluded.due_json,revision=excluded.revision',id,ordinal,value.kind,value.kind==='due'?JSON.stringify(value.due):null,revision);
    tx.run('UPDATE productivity_series SET revision=revision+1,updated_at=? WHERE id=?',time,id);ports.afterWrite?.();return {id,ordinal,input:value,seriesRevision:current.revision+1,exceptionRevision:revision};
   });
   return series(ports.reader,ctx,id);
  },
 };
}
