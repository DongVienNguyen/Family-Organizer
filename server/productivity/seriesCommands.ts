import {createHash} from 'node:crypto';
import type {AppCommand,TaskRecord,Due} from '../../src/features/productivity/contracts.js';
import {UserRole,TaskStatus} from '../../src/types.js';
import {assertDue,utcInstant,localDateAt} from '../../src/features/productivity/dates.js';
import {keys,object,text,integer} from '../../src/features/productivity/validation.js';
import {createTaskAccess,type TaskReader} from './access.js';
import type {withAppWriteTransaction,AppWriteTx} from '../appStore.js';
import type {FamilyDB} from '../db.js';
import {AppStoreError} from '../appErrors.js';
import {assertContext,updateTaskWithinTransaction} from './tasks.js';
import {normalizeRecurrencePolicy} from './recurrencePolicy.js';
import type {RecurrenceSeries} from './seriesRecord.js';
import {decodeSeries} from './seriesRecord.js';
import {decodeSeriesOccurrence} from './occurrenceRecord.js';
import {decodeOccurrenceSkip} from './occurrenceSkipRecord.js';
import {withCompletionPolicy} from '../completionPolicy.js';
import {loadTask} from './store.js';
import {projectTaskRecord} from './query.js';
import {materializeSeriesSuccessor} from './recurrenceMaterialize.js';
export interface SeriesEditResult {series:RecurrenceSeries;changedTaskIds:string[]}
export interface SkipResult {task:TaskRecord;actualColumn:'wont_do';approvalNeeded:false;spawnedTaskIds:string[]}
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'series-command');};
export function createSeriesCommands(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;legacy:Pick<typeof FamilyDB,'saveTask'>;now?:()=>number;afterWrite?():void}){
 const eventReferences=new WeakMap<SkipResult,string[]>();
 const authority=(reader:TaskReader,ctx:AppCommand,id:string)=>{const user=assertContext(ctx,reader);if(![UserRole.ADMIN,UserRole.MEMBER].includes(user.role))fail(403,'Cần người lớn quản lý kỳ lặp.');try{text(id,256);}catch{fail(400,'Mã kỳ lặp không hợp lệ.');}if(![12,13].includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))fail(409,'Cần migration quyết định kỳ lặp.');return {user,task:createTaskAccess(reader).assertTaskCommand(ctx.actor,id,'update')};};
 return {
  seriesForTask(actor:AppCommand['actor'],taskId:string):{series:RecurrenceSeries|null;ordinal:number|null}{
   const ctx={actor,requestId:'recurrence:editor-read',expectedRevision:0};authority(ports.reader,ctx,taskId);
   const owned=ports.reader.get('SELECT series_id,ordinal FROM productivity_series_occurrences WHERE task_id=?',taskId),row=owned?ports.reader.get('SELECT * FROM productivity_series WHERE id=?',owned.series_id):ports.reader.get('SELECT * FROM productivity_series WHERE task_id=?',taskId);
   if(!row)return {series:null,ordinal:null};const series=decodeSeries(row);authority(ports.reader,ctx,series.taskId);return {series,ordinal:owned?.ordinal??0};
  },
  spawnedForEvents(result:SkipResult):string[]{return [...(eventReferences.get(result)??[])];},
  editSeries(ctx:AppCommand,id:string,scope:'this'|'future'|'all',input:unknown):SeriesEditResult {
   const authorized=(reader:TaskReader)=>{
    assertContext(ctx,reader);try{text(id,256);}catch{fail(400,'Mã lịch lặp không hợp lệ.');}
    const row=reader.get('SELECT * FROM productivity_series WHERE id=?',id);if(!row)fail(404,'Không tìm thấy lịch lặp.');const series=decodeSeries(row);authority(reader,ctx,series.taskId);
    const owned=reader.get("SELECT o.task_id,o.ordinal FROM productivity_series_occurrences o LEFT JOIN productivity_occurrence_skips s ON s.series_id=o.series_id AND s.ordinal=o.ordinal WHERE o.series_id=? AND o.state='open' AND s.task_id IS NULL",id);
    const current=owned?createTaskAccess(reader).assertTaskCommand(ctx.actor,owned.task_id,'update'):createTaskAccess(reader).assertTaskCommand(ctx.actor,series.taskId,'update');
    return {series,current,ordinal:owned?.ordinal??0};
   };
   authorized(ports.reader);let patch:Record<string,any>;
   try{
    if(!['this','future','all'].includes(scope))throw Error();patch=structuredClone(object(input));keys(patch,scope==='this'?['ordinal','due','expectedTaskRevision']:scope==='future'?['policy','anchor']:['policy','anchor','currentDue','expectedTaskRevision']);
    if(Object.values(patch).some(value=>value===undefined))throw Error();
    if(scope==='this'){integer(patch.ordinal,0,100000);assertDue(patch.due);}else patch.policy=normalizeRecurrencePolicy(patch.policy);
    if(patch.anchor!==undefined)assertDue(patch.anchor);if(patch.currentDue!==undefined)assertDue(patch.currentDue);if(patch.expectedTaskRevision!==undefined)integer(patch.expectedTaskRevision,1);
   }catch{return fail(422,'Cấu hình chỉnh sửa kỳ lặp không hợp lệ.');}
   const committed=ports.write<{changedTaskIds:string[]}>({actorId:ctx.actor.userId,command:'productivity:series:edit',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({id,scope,expectedRevision:ctx.expectedRevision,patch})).digest('hex')},tx=>{
    const {series,current,ordinal}=authorized(tx);if(series.revision!==ctx.expectedRevision)fail(409,'Lịch lặp vừa thay đổi.');
    if(series.endedAt!==null||!['todo','in_progress'].includes(current.lifecycle)||current.pendingApproval)fail(422,'Chỉ sửa lịch lặp đang thực hiện và không chờ duyệt.');
    if(series.revision===Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản lịch lặp đã đạt giới hạn.');
    const policy=scope==='this'?series.policy:patch.policy,anchor=patch.anchor??series.anchor;
    if(policy.timezone!==series.policy.timezone||anchor.kind!=='none'&&anchor.timezone!==policy.timezone||policy.base==='due'&&anchor.kind==='none')fail(422,'Mốc hạn chót và múi giờ không khớp.');
    if(policy.end.kind==='count'&&policy.end.count<=ordinal)fail(422,'Số kỳ không được loại bỏ kỳ hiện hành.');
    for(const member of policy.rotationMembers)if(!tx.legacy.users.some(user=>user.id===member&&!user.isDeleted&&Object.values(UserRole).includes(user.role)))fail(422,'Thành viên luân phiên không hợp lệ.');
    const due:Due|undefined=scope==='this'?patch.due:patch.currentDue;
    if(due!==undefined){if(due.kind!=='none'&&due.timezone!==policy.timezone)fail(422,'Múi giờ kỳ lặp không khớp.');if(due.kind!=='none'&&policy.end.kind==='date'){const date=due.kind==='all_day'?due.date:localDateAt(utcInstant(due.instantUtc),due.timezone);if(date>policy.end.date)fail(422,'Kỳ vượt ngày kết thúc.');}}
    const changedTaskIds:string[]=[];
    if(scope==='this'){
     if(patch.ordinal===ordinal){if(patch.expectedTaskRevision===undefined)fail(422,'Cần phiên bản công việc hiện hành.');updateTaskWithinTransaction(tx,{...ctx,expectedRevision:patch.expectedTaskRevision},current.id,{due:due!});changedTaskIds.push(current.id);}
     else {
      if(patch.ordinal<series.nextOrdinal||policy.end.kind==='count'&&patch.ordinal>=policy.end.count)fail(422,'Không sửa kỳ đã phát sinh hoặc ngoài giới hạn.');
      if(patch.expectedTaskRevision!==undefined)fail(422,'Kỳ tương lai chưa có phiên bản công việc.');
      const previous=tx.get('SELECT revision FROM productivity_series_exceptions WHERE series_id=? AND ordinal=?',id,patch.ordinal),revision=(previous?.revision??0)+1;if(!Number.isSafeInteger(revision))fail(422,'Phiên bản ngoại lệ đã đạt giới hạn.');
      tx.run("INSERT INTO productivity_series_exceptions VALUES(?,?,'due',?,?)ON CONFLICT(series_id,ordinal)DO UPDATE SET kind='due',due_json=excluded.due_json,revision=excluded.revision",id,patch.ordinal,JSON.stringify(due),revision);
     }
    }else {
     if(due!==undefined){if(patch.expectedTaskRevision===undefined)fail(422,'Cần phiên bản công việc hiện hành.');updateTaskWithinTransaction(tx,{...ctx,expectedRevision:patch.expectedTaskRevision},current.id,{due});changedTaskIds.push(current.id);}
     else if(patch.expectedTaskRevision!==undefined)fail(422,'Phiên bản công việc cần hạn chót cụ thể.');
     if(policy.end.kind==='count')tx.run('DELETE FROM productivity_series_exceptions WHERE series_id=? AND ordinal>=? AND ordinal>=?',id,series.nextOrdinal,policy.end.count);
    }
    const time=new Date((ports.now??Date.now)()).toISOString();if(utcInstant(time)<utcInstant(series.updatedAt))fail(409,'Đồng hồ lịch lặp đã lùi.');
    const sameRoster=JSON.stringify(policy.rotationMembers)===JSON.stringify(series.policy.rotationMembers),origin=policy.rotationMembers.indexOf(current.assigneeId),rotationCursor=sameRoster?series.rotationCursor:origin>=0?origin:Math.max(0,policy.rotationMembers.length-1);
    tx.run('UPDATE productivity_series SET revision=revision+1,policy_json=?,anchor_json=?,rotation_cursor=?,updated_at=? WHERE id=?',JSON.stringify(policy),JSON.stringify(anchor),rotationCursor,time,id);ports.afterWrite?.();return {changedTaskIds};
   });
   return {series:authorized(ports.reader).series,changedTaskIds:committed.changedTaskIds.filter(taskId=>createTaskAccess(ports.reader).getTask(ctx.actor,taskId)!==null)};
  },
  skipOccurrence(ctx:AppCommand,taskId:string,input:{expectedSeriesRevision:number;nextDue?:unknown}):SkipResult {
   authority(ports.reader,ctx,taskId);let expectedSeriesRevision:number,nextDue:Due|undefined;
   try{keys(object(input),['expectedSeriesRevision','nextDue']);integer(input.expectedSeriesRevision,1);expectedSeriesRevision=input.expectedSeriesRevision;if(input.nextDue!==undefined){assertDue(input.nextDue);nextDue=structuredClone(input.nextDue);}}catch{return fail(400,'Yêu cầu bỏ qua kỳ không hợp lệ.');}
   const committed=ports.write<SkipResult>({actorId:ctx.actor.userId,command:'productivity:series:skip',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({taskId,expectedRevision:ctx.expectedRevision,expectedSeriesRevision,...nextDue?{nextDue}:{}})).digest('hex')},tx=>{
    const {user,task:before}=authority(tx,ctx,taskId);if(before.revision!==ctx.expectedRevision)fail(409,'Công việc vừa thay đổi.');
    const ownedRow=tx.get('SELECT * FROM productivity_series_occurrences WHERE task_id=?',taskId),owned=ownedRow?decodeSeriesOccurrence(ownedRow):undefined,row=owned?tx.get('SELECT * FROM productivity_series WHERE id=?',owned.seriesId):tx.get('SELECT * FROM productivity_series WHERE task_id=?',taskId);if(!row)fail(404,'Không tìm thấy kỳ lặp.');const series=decodeSeries(row);
    if(series.revision!==expectedSeriesRevision)fail(409,'Lịch lặp vừa thay đổi.');
    const marker=tx.get('SELECT * FROM productivity_occurrence_skips WHERE task_id=?',taskId);
    if(marker){const prior=decodeOccurrenceSkip(marker);if(prior.seriesId!==series.id||before.lifecycle!=='wont_do')fail(409,'Quyết định kỳ lặp không khớp.');return {task:projectTaskRecord(before),actualColumn:'wont_do',approvalNeeded:false,spawnedTaskIds:[]};}
    if(before.pendingApproval||!['todo','in_progress'].includes(before.lifecycle)||owned?.state==='accepted')fail(422,'Chỉ bỏ qua kỳ đang thực hiện và không chờ duyệt.');
    const ordinal=owned?.ordinal??0;if(owned?ordinal!==series.nextOrdinal-1:series.nextOrdinal!==1)fail(422,'Kỳ lặp hiện hành không khớp.');
    if(before.revision===Number.MAX_SAFE_INTEGER||series.revision===Number.MAX_SAFE_INTEGER)fail(422,'Phiên bản đã đạt giới hạn.');
    const time=new Date((ports.now??Date.now)()).toISOString();if(utcInstant(time)<utcInstant(series.updatedAt))fail(409,'Đồng hồ lịch lặp đã lùi.');
    if(nextDue!==undefined){if(series.endedAt!==null||series.policy.end.kind==='count'&&series.nextOrdinal>=series.policy.end.count)fail(422,'Lịch lặp không còn kỳ kế tiếp.');if(nextDue.kind!=='none'&&nextDue.timezone!==series.policy.timezone)fail(422,'Múi giờ kỳ kế tiếp không khớp.');if(nextDue.kind!=='none'&&series.policy.end.kind==='date'){const date=nextDue.kind==='all_day'?nextDue.date:localDateAt(utcInstant(nextDue.instantUtc),nextDue.timezone);if(date>series.policy.end.date)fail(422,'Kỳ kế tiếp vượt ngày kết thúc.');}const previous=tx.get('SELECT revision FROM productivity_series_exceptions WHERE series_id=? AND ordinal=?',series.id,series.nextOrdinal),revision=(previous?.revision??0)+1;if(!Number.isSafeInteger(revision))fail(422,'Phiên bản ngoại lệ đã đạt giới hạn.');tx.run("INSERT INTO productivity_series_exceptions VALUES(?,?,'due',?,?)ON CONFLICT(series_id,ordinal)DO UPDATE SET kind='due',due_json=excluded.due_json,revision=excluded.revision",series.id,series.nextOrdinal,JSON.stringify(nextDue),revision);}
    const ids=new Set(tx.legacy.tasks.map(task=>task.id));
    const changed=withCompletionPolicy(tx,{taskId,revision:before.revision,operation:'skip'},()=>ports.legacy.saveTask({id:taskId,status:TaskStatus.WONT_DO},ctx.actor.userId,user.username)),source=loadTask(tx,taskId)!;
    tx.run('INSERT INTO productivity_occurrence_skips VALUES(?,?,?,?,?,?)',series.id,ordinal,taskId,time,ctx.actor.userId,source.revision);
    const accepted=tx.get("SELECT ordinal,accepted_at FROM productivity_series_occurrences WHERE series_id=? AND state='accepted' ORDER BY ordinal DESC LIMIT 1",series.id);
    const next=materializeSeriesSuccessor(tx,{series,source,task:changed,actorId:ctx.actor.userId,createdAt:time,...accepted?{acceptedCompletedAt:accepted.accepted_at}:{},calendarOrigin:accepted?accepted.ordinal+1:1,assigneeId:source.assigneeId});
    tx.run('UPDATE productivity_series SET revision=revision+1,next_ordinal=?,ended_at=?,updated_at=? WHERE id=?',next.nextOrdinal,next.endedAt,time,series.id);ports.afterWrite?.();return {task:projectTaskRecord(loadTask(tx,taskId)!),actualColumn:'wont_do',approvalNeeded:false,spawnedTaskIds:tx.legacy.tasks.filter(task=>!ids.has(task.id)).map(task=>task.id)};
   });
   const result:SkipResult={...committed,spawnedTaskIds:committed.spawnedTaskIds.filter(id=>createTaskAccess(ports.reader).getTask(ctx.actor,id)!==null)};eventReferences.set(result,[...committed.spawnedTaskIds]);return result;
  },
 };
}
