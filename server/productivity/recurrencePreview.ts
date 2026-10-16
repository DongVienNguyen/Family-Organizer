import type {AppActor,Due} from '../../src/features/productivity/contracts.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
import {decodeSeries,decodeSeriesException,type RecurrenceSeries,type SeriesException} from './seriesRecord.js';
import {createRecurrenceSlotPlanner,type RecurrenceSlot} from './recurrenceSlots.js';
import {AppStoreError} from '../appErrors.js';
import {calendarDate,localDateAt,localDayStart,utcInstant} from '../../src/features/productivity/dates.js';
import {keys,object,text} from '../../src/features/productivity/validation.js';

export type OccurrencePreview={seriesId:string;taskId:string;seriesRevision:number;ordinal:number}&(
 {kind:'virtual';due:Exclude<Due,{kind:'none'}>}|
 {kind:'time-resolution-required';date:string;wallTime:string;timezone:string;reason:'explicit-instant-required'});
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'recurrence-preview');};
const dueDate=(due:Exclude<Due,{kind:'none'}>)=>due.kind==='all_day'?due.date:localDateAt(utcInstant(due.instantUtc),due.timezone);
function nominalDate(slot:Exclude<RecurrenceSlot,{kind:'end'|'awaiting-acceptance'}>):string {
 if(slot.kind==='due'){if(slot.due.kind==='none')return fail(422,'Kỳ lặp chưa có ngày.');return dueDate(slot.due);}
 if(slot.kind==='time-resolution-required')return slot.date;
 return String(slot.year).padStart(4,'0')+'-'+String(slot.month).padStart(2,'0')+'-'+String(Math.min(slot.requestedDay,new Date(Date.UTC(slot.year,slot.month,0)).getUTCDate())).padStart(2,'0');
}
function firstOrdinal(series:RecurrenceSeries,from:string):number {
 const rule=series.policy;if(rule.base==='completion'||rule.cadence.kind==='dates')return series.nextOrdinal;
 const anchor=series.anchor;if(anchor.kind==='none')return fail(422,'Lịch lặp thiếu mốc.');const date=dueDate(anchor),[ay,am]=date.split('-').map(Number),[fy,fm]=from.split('-').map(Number),c=rule.cadence;
 const distance=c.frequency==='yearly'?fy-ay:c.frequency==='monthly'?(fy-ay)*12+fm-am:(calendarDate(from)-calendarDate(date))/86400000/(c.frequency==='weekly'?7:1);
 return Math.max(series.nextOrdinal,1,Math.floor(distance/c.interval)-1);
}
/** Read-only current-ACL projection. Results identify virtual slots, never
 * persisted Tasks or accepted claims. No command, job, outbox or clock write. */
export function createRecurrencePreviews(ports:{reader:TaskReader}){
 return {previewOccurrences(actor:AppActor,id:string,input:unknown):OccurrencePreview[]{
  const reader=ports.reader;assertContext({actor,requestId:'recurrence:preview',expectedRevision:0},reader);
  try{text(id,256);}catch{return fail(400,'Mã lịch lặp không hợp lệ.');}
  if(![10,11,12,13].includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))return fail(409,'Cần migration lịch lặp.');
  const reference=reader.get('SELECT id,task_id FROM productivity_series WHERE id=?',id);
  const task=reference&&createTaskAccess(reader).getTask(actor,reference.task_id);if(!task)return fail(404,'Không tìm thấy lịch lặp.');
  let series:RecurrenceSeries,exceptions:SeriesException[];
  try{series=decodeSeries(reader.get('SELECT * FROM productivity_series WHERE id=?',id));exceptions=reader.all('SELECT * FROM productivity_series_exceptions WHERE series_id=? AND ordinal>=? ORDER BY ordinal',id,series.nextOrdinal).map(decodeSeriesException);if(exceptions.some(e=>e.kind==='due'&&e.due.kind!=='none'&&e.due.timezone!==series.policy.timezone))throw Error('Exception timezone');}
  catch{return fail(500,'Dữ liệu lịch lặp không hợp lệ.');}
  let from:string,toExclusive:string;
  try{const r=object(input);keys(r,['from','toExclusive']);text(r.from,10);text(r.toExclusive,10);from=r.from as string;toExclusive=r.toExclusive as string;const days=(calendarDate(toExclusive)-calendarDate(from))/86400000;if(days<=0||days>366)throw Error('Range');localDayStart(from,series.policy.timezone);localDayStart(toExclusive,series.policy.timezone);}
  catch{return fail(422,'Khoảng xem lịch lặp không hợp lệ (tối đa366ngày).');}
  if(series.endedAt!==null)return [];
  const acceptedCompletedAt=series.nextOrdinal===1&&task.lifecycle==='completed'&&!task.pendingApproval?task.completedReferenceAt:undefined;
  const overrides=new Map(exceptions.map(e=>[e.ordinal,e])),rows=new Map<number,OccurrencePreview>();
  const plan=createRecurrenceSlotPlanner({policy:series.policy,anchor:series.anchor,...acceptedCompletedAt?{acceptedCompletedAt}:{}});
  const candidate=(ordinal:number):RecurrenceSlot=>{try{return plan(ordinal);}catch{return fail(422,'Kỳ lặp ngoài phạm vi được hỗ trợ.');}};
  const include=(slot:RecurrenceSlot)=>{
   if(slot.kind==='end')return;
   const base={seriesId:id,taskId:series.taskId,seriesRevision:series.revision,ordinal:slot.ordinal},exception=overrides.get(slot.ordinal);let row:OccurrencePreview|undefined,date:string;
   if(exception){if(exception.kind==='skip'||exception.due.kind==='none')return;date=dueDate(exception.due);row={...base,kind:'virtual',due:structuredClone(exception.due)};}
   else if(slot.kind==='due'){if(slot.due.kind==='none')return;date=dueDate(slot.due);row={...base,kind:'virtual',due:structuredClone(slot.due)};}
   else if(slot.kind==='time-resolution-required'){date=slot.date;row={...base,kind:slot.kind,date,wallTime:slot.wallTime,timezone:slot.timezone,reason:slot.reason};}
   else return;
   if(date<from||date>=toExclusive||series.policy.end.kind==='date'&&date>series.policy.end.date)return;
   rows.set(slot.ordinal,row);if(rows.size>1000)fail(422,'Có quá1000kỳ lặp trong khoảng đã chọn.');
  };
  const start=firstOrdinal(series,from);if(start>100000)return fail(422,'Kỳ lặp ngoài phạm vi được hỗ trợ.');
  for(let ordinal=start;ordinal<=100000;ordinal++){
   const slot=candidate(ordinal);if(slot.kind==='end'||slot.kind==='awaiting-acceptance')break;
   if(nominalDate(slot)>=toExclusive)break;include(slot);if(series.policy.base==='completion')break;
  }
  // A future exception may move a slot into the requested range from anywhere
  // else in the bounded series; don't lose it through the calendar fast path.
  for(const exception of exceptions)include(candidate(exception.ordinal));
  const date=(row:OccurrencePreview)=>row.kind==='virtual'?dueDate(row.due):row.date;
  return [...rows.values()].sort((a,b)=>date(a).localeCompare(date(b))||a.ordinal-b.ordinal);
 }};
}
