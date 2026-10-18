import {createRecurrencePreviews} from './recurrencePreview.js';
import {createSeriesCommands} from './seriesCommands.js';
import {createRecurrenceSlotPlanner} from './recurrenceSlots.js';
import {decodeSeries,decodeSeriesException,type RecurrenceSeries} from './seriesRecord.js';
import type {FamilyDB} from '../db.js';
import {randomUUID,createHash} from 'node:crypto';
import type {AppActor,AppCommand,Due,QueryClock,TaskFilter,TaskPatch,TaskRecord} from '../../src/features/productivity/contracts.js';
import {assertTaskRecord} from '../../src/features/productivity/contracts.js';
import {calendarRange,calendarClock,type CalendarRange,type CalendarItem,type CalendarPage,type CalendarPreview,type CalendarApply} from '../../src/features/productivity/calendarContracts.js';
import {assertDue,calendarDate,localDateAt,localDayStart,parseLegacyDue,utcInstant} from '../../src/features/productivity/dates.js';
import {object,keys,text,boolean} from '../../src/features/productivity/validation.js';
import type {FamilyPlan} from '../../src/types.js';
import {UserRole} from '../../src/types.js';
import {canViewLegacyPlan} from '../legacyVisibility.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {createTaskAccess,taskScope,type TaskReader} from './access.js';
import {createTaskQuery,projectTaskRecord} from './query.js';
import {assertContext,updateTaskWithinTransaction} from './tasks.js';
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'calendar');};
const dateAfter=(date:string)=>new Date(calendarDate(date)+86400000).toISOString().slice(0,10);
const legacyTimezone='Asia/Saigon';
function taskItem(task:TaskRecord,range:CalendarRange):CalendarItem|null {
 const from=localDayStart(range.fromDate,range.timezone),end=localDayStart(range.toDateExclusive,range.timezone),base={id:'task:'+task.id,kind:'task' as const,sourceId:task.id,title:task.title,due:task.due,revision:task.revision,readOnly:false};
 if(task.scheduledStart!==null&&task.scheduledEnd!==null&&utcInstant(task.scheduledStart)<end&&utcInstant(task.scheduledEnd)>from){return {...base,allDay:false,startDate:localDateAt(utcInstant(task.scheduledStart),range.timezone),endDateExclusive:dateAfter(localDateAt(utcInstant(task.scheduledEnd)-1,range.timezone)),startUtc:task.scheduledStart,endUtc:task.scheduledEnd};}
 if(task.due.kind==='none')return null;
 if(task.due.kind==='all_day'){if(task.due.date<range.fromDate||task.due.date>=range.toDateExclusive)return null;return {...base,allDay:true,startDate:task.due.date,endDateExclusive:dateAfter(task.due.date),startUtc:null,endUtc:null};}
 const instant=utcInstant(task.due.instantUtc);if(instant<from||instant>=end)return null;const date=localDateAt(instant,range.timezone);return {...base,allDay:false,startDate:date,endDateExclusive:dateAfter(date),startUtc:task.due.instantUtc,endUtc:null};
}
/** Existing FamilyPlan timestamps have no stored timezone. Preserve their local
 * calendar semantics with the documented legacy Asia/Saigon assumption; no host
 * Date.parse or replacement calendar store. Editing remains with /api/plans. */
function planItems(plan:FamilyPlan,range:CalendarRange):CalendarItem[]{
 const startDate=plan.startDate.slice(0,10),endDate=(plan.endDate||plan.startDate).slice(0,10);calendarDate(startDate);calendarDate(endDate);
 const recurring=plan.isRecurring&&plan.recurrenceType!=='none',from=Math.max(calendarDate(range.fromDate),calendarDate(startDate)),to=calendarDate(range.toDateExclusive),result:CalendarItem[]=[];
 const item=(date:string,finishDate:string)=>{const start=parseLegacyDue(date+plan.startDate.slice(10),legacyTimezone).due,end=parseLegacyDue(finishDate+(plan.endDate||plan.startDate).slice(10),legacyTimezone).due;if(start.kind==='none'||end.kind==='none'||start.kind!==end.kind)throw Error('Invalid legacy calendar time');const allDay=start.kind==='all_day',startUtc=start.kind==='timed'?start.instantUtc:null,endUtc=end.kind==='timed'?end.instantUtc:null;if(startUtc&&endUtc&&utcInstant(endUtc)<=utcInstant(startUtc))throw Error('Invalid legacy interval');const displayStart=allDay?date:localDateAt(utcInstant(startUtc!),range.timezone),displayEnd=allDay?dateAfter(finishDate):dateAfter(localDateAt(utcInstant(endUtc!)-1,range.timezone));if(displayEnd<=range.fromDate||displayStart>=range.toDateExclusive)return;result.push({id:'familyPlan:'+plan.id+':'+date,kind:'familyPlan',sourceId:plan.id,title:plan.title,allDay,startDate:displayStart,endDateExclusive:displayEnd,startUtc,endUtc,due:null,revision:null,readOnly:true});};
 if(!recurring){item(startDate,endDate);return result;}
 const anchor=new Date(calendarDate(startDate)),last=plan.endDate?Math.max(calendarDate(endDate),calendarDate(startDate)):to;
 for(let stamp=from;stamp<to&&stamp<=last;stamp+=86400000){const day=new Date(stamp),date=day.toISOString().slice(0,10),matches=plan.recurrenceType==='daily'||plan.recurrenceType==='weekly'&&(plan.recurrenceWeekdays?.length?plan.recurrenceWeekdays:[anchor.getUTCDay()]).includes(day.getUTCDay())||plan.recurrenceType==='monthly'&&day.getUTCDate()===anchor.getUTCDate()||plan.recurrenceType==='yearly'&&day.getUTCMonth()===anchor.getUTCMonth()&&day.getUTCDate()===anchor.getUTCDate();if(matches)item(date,date);}
 return result;
}
/** Read projections share the canonical query/ACL engine. Commands capture an
 * opaque reviewed patch and use only the existing installation I01 writer. */
export function createCalendar(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;now?:()=>number;legacy?:Pick<typeof FamilyDB,'saveTask'>}){
 const now=ports.now??Date.now,query=createTaskQuery(ports),previews=new Map<string,{actor:AppActor;preview:CalendarPreview;expiry:number;series?:RecurrenceSeries}>(),ttl=5*60000;
 const authorize=(actor:AppActor,reader=ports.reader)=>assertContext({actor,requestId:'calendar:read',expectedRevision:0},reader);
 const editable=(actor:AppActor,id:string,reader=ports.reader)=>{authorize(actor,reader);return createTaskAccess(reader).assertTaskCommand(actor,id,'update');};
 return {
  getCalendar(actor:AppActor,raw:unknown,suppliedClock?:QueryClock,filter:TaskFilter={rootsOnly:true}):CalendarPage {
   authorize(actor);let range:CalendarRange,clock:QueryClock;try{range=calendarRange(raw);clock=suppliedClock??{nowUtc:new Date(now()).toISOString(),timezone:range.timezone};calendarClock(clock);}catch{return fail(422,'Khoảng lịch không hợp lệ; chọn tối đa366ngày và múi giờ hợp lệ.');}
   // Bound current-authority source bodies before using the shared filter engine.
   const scope=taskScope(actor),budget=ports.reader.get('SELECT count(*) AS n,COALESCE(sum(length(CAST(t.body AS BLOB))+length(CAST(t.title AS BLOB))),0) AS bytes FROM productivity_tasks t WHERE '+scope.sql,...scope.args);if(budget.n>100000||budget.bytes>16*1024*1024)fail(413,'Phạm vi lịch vượt giới hạn dữ liệu.');
   const sources=query.readFilteredTasks(actor,filter,clock),items=sources.flatMap(task=>{const item=taskItem(task,range);return item?[item]:[];}),issues:CalendarPage['issues']=[];
   if(ports.reader.get("SELECT 1 FROM sqlite_master WHERE name='productivity_series' AND type='table'")){
    const recurrence=createRecurrencePreviews(ports);
    for(const source of sources){const raw=ports.reader.get('SELECT * FROM productivity_series WHERE task_id=? AND ended_at IS NULL',source.id);if(!raw)continue;const series=decodeSeries(raw),fromInstant=localDayStart(range.fromDate,range.timezone),endInstant=localDayStart(range.toDateExclusive,range.timezone),first=[range.fromDate,localDateAt(fromInstant,series.policy.timezone)].sort()[0],last=[range.toDateExclusive,dateAfter(localDateAt(endInstant-1,series.policy.timezone))].sort().at(-1)!,seen=new Set<number>();
     for(let cursor=first;cursor<last;){const next=new Date(Math.min(calendarDate(last),calendarDate(cursor)+366*86400000)).toISOString().slice(0,10);for(const occurrence of recurrence.previewOccurrences(actor,series.id,{from:cursor,toExclusive:next})){if(seen.has(occurrence.ordinal))continue;seen.add(occurrence.ordinal);let item:CalendarItem|null;if(occurrence.kind==='virtual'){item=taskItem({...source,due:occurrence.due,scheduledStart:null,scheduledEnd:null},range);}else{item=occurrence.date>=range.fromDate&&occurrence.date<range.toDateExclusive?{id:'',kind:'virtualOccurrence',sourceId:source.id,title:source.title,allDay:false,startDate:occurrence.date,endDateExclusive:dateAfter(occurrence.date),startUtc:null,endUtc:null,due:null,revision:source.revision,readOnly:false,requiresTimeResolution:true}:null;}if(item)items.push({...item,id:'virtualOccurrence:'+series.id+':'+occurrence.ordinal,kind:'virtualOccurrence',seriesId:series.id,seriesRevision:series.revision,ordinal:occurrence.ordinal,readOnly:![UserRole.ADMIN,UserRole.MEMBER].includes(actor.role as UserRole)});if(items.length>1000)fail(422,'Lịch vượt1000mục; hãy chọn khoảng ngắn hơn.');}cursor=next;}
    }
   }
   const condition=actor.role===UserRole.ADMIN?'1':"json_extract(data,'$.isShared')=1 OR json_extract(data,'$.creatorId')=?",rows=ports.reader.all('SELECT data FROM plans WHERE ('+condition+') ORDER BY id LIMIT 10001',...(actor.role===UserRole.ADMIN?[]:[actor.userId]));if(rows.length>10000)fail(413,'Quá nhiều kế hoạch trong phạm vi lịch.');
   for(const row of rows){const plan:FamilyPlan=JSON.parse(row.data);if(!canViewLegacyPlan(plan,{userId:actor.userId,role:actor.role as UserRole}))continue;try{items.push(...planItems(plan,range));}catch{issues.push({sourceId:plan.id,code:'invalid-legacy-time'});}}
   if(items.length>1000)fail(422,'Lịch vượt1000mục; hãy chọn khoảng ngắn hơn.');authorize(actor);items.sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.startUtc??'').localeCompare(b.startUtc??'')||a.id.localeCompare(b.id));return {range,clock:structuredClone(clock),items,total:items.length,issues};
  },
  previewReschedule(actor:AppActor,raw:unknown):CalendarPreview {
   let value:Record<string,any>;try{value=object(raw);keys(value,['taskId','startUtc','endUtc','due','seriesId','ordinal']);text(value.taskId,256);if(value.startUtc!==null)utcInstant(value.startUtc);if(value.endUtc!==null)utcInstant(value.endUtc);if((value.startUtc===null)!==(value.endUtc===null)||value.startUtc!==null&&utcInstant(value.startUtc)>=utcInstant(value.endUtc))throw Error();if(value.due!==undefined)assertDue(value.due);}catch{return fail(422,'Khoảng thời gian cần UTC rõ ràng, giờ kết thúc sau giờ bắt đầu.');}
   let source=projectTaskRecord(editable(actor,value.taskId)),series:RecurrenceSeries|undefined;
   if(value.seriesId!==undefined){if(![UserRole.ADMIN,UserRole.MEMBER].includes(actor.role as UserRole))return fail(403,'Cần người lớn quản lý kỳ lặp.');try{text(value.seriesId,256);if(!Number.isSafeInteger(value.ordinal)||value.ordinal<1||value.ordinal>100000||value.due===undefined||value.startUtc!==null||value.endUtc!==null)throw Error();}catch{return fail(422,'Kỳ tương lai cần hạn chót rõ ràng.');}const rawSeries=ports.reader.get('SELECT * FROM productivity_series WHERE id=? AND task_id=?',value.seriesId,value.taskId);if(!rawSeries)return fail(404,'Không tìm thấy lịch lặp.');series=decodeSeries(rawSeries);if(series.endedAt!==null||value.ordinal<series.nextOrdinal)return fail(409,'Kỳ đã phát sinh hoặc lịch đã kết thúc.');if(value.due.kind==='none'||value.due.timezone!==series.policy.timezone)return fail(422,'Múi giờ kỳ lặp không khớp.');const slot=createRecurrenceSlotPlanner({policy:series.policy,anchor:series.anchor})(value.ordinal),rawException=ports.reader.get('SELECT * FROM productivity_series_exceptions WHERE series_id=? AND ordinal=?',series.id,value.ordinal),exception=rawException?decodeSeriesException(rawException):undefined;if(slot.kind==='end'||slot.kind==='awaiting-acceptance'||slot.kind==='skipped'||exception?.kind==='skip')return fail(404,'Không tìm thấy kỳ tương lai.');source={...source,due:exception?.kind==='due'?exception.due:slot.kind==='due'?slot.due:{kind:'none'},scheduledStart:null,scheduledEnd:null};}
   else if(value.ordinal!==undefined)return fail(422,'Thiếu lịch lặp nguồn.');
   const before=source,patch:TaskPatch={scheduledStart:value.startUtc,scheduledEnd:value.endUtc,...(value.due===undefined?{}:{due:structuredClone(value.due)})},after={...before,...patch,revision:before.revision+1};try{assertTaskRecord(after);}catch{return fail(422,'Lịch công việc không hợp lệ.');}
   const at=now();for(const[id,row]of previews)if(row.expiry<=at)previews.delete(id);if(previews.size>=256||[...previews.values()].reduce((sum,row)=>sum+Buffer.byteLength(JSON.stringify(row)),0)+Buffer.byteLength(JSON.stringify({before,after,patch}))>16*1024*1024)fail(429,'Quá nhiều bản xem lịch; thử lại sau.');const id=randomUUID(),expiry=at+ttl,preview:CalendarPreview={id,taskId:before.id,taskRevision:before.revision,expiresAt:new Date(expiry).toISOString(),patch,before,after,needsDueConfirmation:value.due!==undefined&&(series!==undefined||JSON.stringify(before.due)!==JSON.stringify(value.due)),...(series?{series:{id:series.id,revision:series.revision,ordinal:value.ordinal}}:{})};previews.set(id,{actor:structuredClone(actor),preview:structuredClone(preview),expiry,...(series?{series}:{})});return preview;
  },
  applyReschedule(ctx:AppCommand,raw:CalendarApply):{task:TaskRecord} {
   let packet:CalendarApply;try{const value=object(raw);keys(value,['taskId','previewId','confirmedDue']);text(value.taskId,256);text(value.previewId,256);if(value.confirmedDue!==undefined)boolean(value.confirmedDue);packet={taskId:value.taskId,previewId:value.previewId,confirmedDue:value.confirmedDue===true};}catch{return fail(400,'Yêu cầu xác nhận lịch không hợp lệ.');}
   editable(ctx.actor,packet.taskId);return ports.write({actorId:ctx.actor.userId,command:'productivity:calendar:reschedule',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({expectedRevision:ctx.expectedRevision,...packet})).digest('hex')},tx=>{const before=editable(ctx.actor,packet.taskId,tx),ref=previews.get(packet.previewId);if(!ref||ref.actor.userId!==ctx.actor.userId||ref.actor.role!==ctx.actor.role||ref.preview.taskId!==packet.taskId)fail(404,'Không tìm thấy bản xem lịch.');if(ref.expiry<=now()||before.revision!==ref.preview.taskRevision||ctx.expectedRevision!==ref.preview.taskRevision)fail(409,'Công việc hoặc bản xem lịch đã thay đổi.');if(ref.preview.needsDueConfirmation&&!packet.confirmedDue)fail(422,'Cần xác nhận rõ thay đổi hạn chót.');if(ref.series){const current=tx.get('SELECT * FROM productivity_series WHERE id=?',ref.series.id);if(!current||current.revision!==ref.series.revision) return fail(409,'Lịch lặp đã thay đổi.');const inner=createSeriesCommands({reader:tx,write:((_meta,work)=>work(tx)) as typeof withAppWriteTransaction,legacy:ports.legacy??{saveTask(){throw Error('Legacy task port unavailable');}},now});inner.editSeries({...ctx,expectedRevision:ref.series.revision},ref.series.id,'this',{ordinal:ref.preview.series!.ordinal,due:ref.preview.patch.due});return {task:projectTaskRecord(createTaskAccess(tx).assertTaskCommand(ctx.actor,packet.taskId,'update'))};}return {task:projectTaskRecord(updateTaskWithinTransaction(tx,ctx,packet.taskId,ref.preview.patch))};});
  },
 };
}
