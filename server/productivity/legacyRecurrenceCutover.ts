import {productivityVersionsFrom} from './knownVersions.js';
import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,AppCommand,Due} from '../../src/features/productivity/contracts.js';
import {assertDue} from '../../src/features/productivity/dates.js';
import {keys,object,text} from '../../src/features/productivity/validation.js';
import {UserRole} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {assertContext} from './tasks.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {normalizeRecurrencePolicy} from './recurrencePolicy.js';
import {legacyRecurrenceFamily} from './legacyRecurrenceFamily.js';
import {decodeTaskRow,savePilotTask} from './store.js';
import {decodeSeries} from './seriesRecord.js';
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'legacy-recurrence-cutover');};
export interface LegacyCutoverInput {fingerprint:string;policy:unknown;anchor:Due;acknowledgeOtherActive:boolean}
/** Explicit administrator pilot operation. Nothing runs at boot, schedules a
 * delivery or infers accepted historic work. One legacy family is disabled and
 * one selected live Task becomes ordinal zero of a new, explicit policy. */
export function createLegacyRecurrenceCutover(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;now?:()=>number;afterWrite?():void}){
 const authority=(reader:TaskReader,actor:AppActor,id:string)=>{
  const user=assertContext({actor,requestId:'legacy:cutover:read',expectedRevision:0},reader);if(user.role!==UserRole.ADMIN)fail(403,'Chỉ quản trị viên được chuyển lịch lặp cũ.');
  if(!productivityVersionsFrom(13).includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))fail(409,'Cần migration chuyển lịch lặp cũ.');
  try{text(id,256);}catch{fail(400,'Mã công việc không hợp lệ.');}return {user,selected:createTaskAccess(reader).assertTaskCommand(actor,id,'update')};
 };
 const plan=(reader:TaskReader,actor:AppActor,id:string)=>{
  const {selected}=authority(reader,actor,id),family=legacyRecurrenceFamily(reader,id);if(selected.parentId!==null||!['todo','in_progress'].includes(selected.lifecycle))fail(422,'Chọn một công việc gốc hiện hành; trạng thái chờ duyệt được bảo toàn.');
  const marks=family.taskIds.map(()=>'?').join(',');
  if(reader.get('SELECT coalesce(sum(length(CAST(legacy_json AS BLOB))),0)AS bytes FROM productivity_tasks WHERE id IN('+marks+')',...family.taskIds).bytes>8*1024*1024)fail(422,'Dữ liệu lịch lặp vượt giới hạn nghiệm thu8MiB.');
  const rows=reader.all('SELECT * FROM productivity_tasks WHERE id IN('+marks+') ORDER BY id',...family.taskIds),tags=reader.all('SELECT task_id,tag_id FROM productivity_task_tags WHERE task_id IN('+marks+') ORDER BY task_id,tag_id',...family.taskIds);
  const raw=JSON.stringify({rootTaskId:family.rootTaskId,selectedTaskId:id,rows,tags});if(Buffer.byteLength(raw)>8*1024*1024)fail(422,'Dữ liệu lịch lặp vượt giới hạn nghiệm thu8MiB.');
  if(reader.get('SELECT series_id FROM productivity_legacy_cutovers WHERE legacy_root_task_id=?',family.rootTaskId)||reader.get('SELECT id FROM productivity_series WHERE task_id IN('+marks+') LIMIT 1',...family.taskIds)||reader.get('SELECT task_id FROM productivity_series_occurrences WHERE task_id IN('+marks+') LIMIT 1',...family.taskIds))fail(409,'Lịch lặp đã được chuyển hoặc có kỳ thuộc lịch mới.');
  const byTask=new Map<string,string[]>();for(const tag of tags){const values=byTask.get(tag.task_id)??[];values.push(tag.tag_id);byTask.set(tag.task_id,values);}
  const tasks=rows.map(row=>decodeTaskRow(row,byTask.get(row.id)??[])),disableTaskIds=tasks.filter(task=>(task.legacy.recurrenceType??'none')!=='none').map(task=>task.id).sort();if(!disableTaskIds.length&&family.taskIds.length<2)fail(422,'Công việc không thuộc một nhóm lịch lặp cũ.');
  const otherActiveTaskIds=tasks.filter(task=>task.id!==id&&task.deletedAt===null&&['todo','in_progress'].includes(task.lifecycle)).map(task=>task.id).sort(),fingerprint=createHash('sha256').update(raw).digest('hex');
  return {tasks,preview:{rootTaskId:family.rootTaskId,selectedTaskId:id,familyTaskIds:family.taskIds,disableTaskIds,otherActiveTaskIds,pendingApproval:selected.pendingApproval,fingerprint}};
 };
 return {
  preview(actor:AppActor,id:string){return plan(ports.reader,actor,id).preview;},
  apply(ctx:AppCommand,id:string,input:LegacyCutoverInput){
   authority(ports.reader,ctx.actor,id);let value:LegacyCutoverInput,policy:ReturnType<typeof normalizeRecurrencePolicy>;
   try{const raw=object(input);keys(raw,['fingerprint','policy','anchor','acknowledgeOtherActive']);if(typeof raw.fingerprint!=='string'||! /^[a-f0-9]{64}$/.test(raw.fingerprint)||typeof raw.acknowledgeOtherActive!=='boolean')throw Error();assertDue(raw.anchor);policy=normalizeRecurrencePolicy(raw.policy);value={fingerprint:raw.fingerprint,policy,anchor:structuredClone(raw.anchor),acknowledgeOtherActive:raw.acknowledgeOtherActive};}catch{return fail(422,'Cấu hình chuyển lịch lặp không hợp lệ.');}
   const result=ports.write<{id:string;changedTaskIds:string[]}>({actorId:ctx.actor.userId,command:'productivity:legacy-recurrence:cutover',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({id,expectedRevision:ctx.expectedRevision,...value})).digest('hex')},tx=>{
    const {user,selected}=authority(tx,ctx.actor,id),current=plan(tx,ctx.actor,id);if(selected.revision!==ctx.expectedRevision||current.preview.fingerprint!==value.fingerprint)fail(409,'Nhóm công việc đã thay đổi; xem trước lại trước khi chuyển.');
    if(current.preview.otherActiveTaskIds.length&&!value.acknowledgeOtherActive)fail(422,'Cần xác nhận các công việc đang mở khác sẽ trở thành công việc thường.');
    if(policy.base==='due'&&value.anchor.kind==='none'||value.anchor.kind!=='none'&&value.anchor.timezone!==policy.timezone||selected.due.kind!=='none'&&selected.due.timezone!==policy.timezone)fail(422,'Mốc hạn chót và múi giờ không khớp.');
    for(const member of policy.rotationMembers)if(!tx.legacy.users.some(user=>user.id===member&&!user.isDeleted&&Object.values(UserRole).includes(user.role)))fail(422,'Thành viên luân phiên không hợp lệ.');
    if(current.tasks.some(task=>task.revision===Number.MAX_SAFE_INTEGER))fail(422,'Phiên bản công việc đã đạt giới hạn.');
    const time=new Date((ports.now??Date.now)()).toISOString(),seriesId=randomUUID(),members=current.tasks.map(task=>({taskId:task.id,revision:task.revision,recurrenceType:task.legacy.recurrenceType??'none',sourceTaskId:task.legacy.sourceRecurringTaskId??null}));
    for(const task of current.tasks)if((task.legacy.recurrenceType??'none')!=='none')savePilotTask(tx,{...task,revision:task.revision+1,legacy:{...task.legacy,recurrenceType:'none',updatedAt:time,history:[...task.legacy.history,{id:randomUUID(),userId:ctx.actor.userId,username:user.username,action:'Chuyển lịch lặp cũ sang lịch được quản lý',createdAt:time}]}});
    const origin=policy.rotationMembers.indexOf(selected.assigneeId!),cursor=origin>=0?origin:Math.max(0,policy.rotationMembers.length-1);
    tx.run('INSERT INTO productivity_series VALUES(?,?,?,?,?,?,?,?,?,?,?)',seriesId,id,1,JSON.stringify(policy),JSON.stringify(value.anchor),1,0,cursor,null,time,time);
    tx.run('INSERT INTO productivity_legacy_cutovers VALUES(?,?,?,?,?,?)',current.preview.rootTaskId,seriesId,id,ctx.actor.userId,JSON.stringify({format:1,fingerprint:value.fingerprint,members}),time);ports.afterWrite?.();return {id:seriesId,changedTaskIds:current.preview.disableTaskIds};
   });
   authority(ports.reader,ctx.actor,id);return {series:decodeSeries(ports.reader.get('SELECT * FROM productivity_series WHERE id=?',result.id)),changedTaskIds:result.changedTaskIds};
  },
 };
}
