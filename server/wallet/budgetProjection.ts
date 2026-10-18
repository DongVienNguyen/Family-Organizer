import {createWalletSchedules} from './schedules.js';
import {planOccurrenceBatch} from './occurrencePlan.js';
import {createWalletReports} from './reports.js';
import {createWalletQueries,type WalletReportRow} from './query.js';
import {assertWalletActor,type WalletReader} from './access.js';
import {matchesRecordFilter,normalizeFilter} from '../../src/features/wallet/filter.js';
import {assertPeriod,effectiveDateAt} from '../../src/features/wallet/dates.js';
import {minorInteger} from '../../src/features/wallet/money.js';
import type {Actor,Period,RecordFilter} from '../../src/features/wallet/contracts.js';
import type {RecordDraft} from './records.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
type Ports={reader:WalletReader;write:typeof withAppWriteTransaction;now?:()=>number;getFxRate?:Parameters<typeof createWalletReports>[0]['getFxRate']};
const limit=():never=>{throw new AppStoreError('Quá nhiều kỳ để dự báo; cần thu hẹp khoảng ngày.',413,'LIMIT_EXCEEDED');};
/** Derives bounded, current-authorized future rows in memory. The shared report
 * engine still owns category allocation, FX rounding and numeric aggregation.
 * Existing pending slots retain their frozen obligation after pause. Archive
 * excludes a definition; confirmed/skipped dates are never projected again. */
export function createBudgetProjection(ports:Ports){
 const schedules=createWalletSchedules(ports),queries=createWalletQueries({reader:ports.reader});
 function rows(actor:Actor,period:Period,includeOverdue=false){
  assertWalletActor(ports.reader,actor);assertPeriod(period);const definitions=ports.reader.all('SELECT schedule_id AS id,generation_from_date AS floor FROM wallet_schedule_metadata WHERE owner_id=? AND archived_at IS NULL ORDER BY schedule_id LIMIT 1001',actor.userId);if(definitions.length>1000)limit();let complete=true;const result:WalletReportRow[]=[];
  const append=(scheduleId:string,date:string,revision:number,record:RecordDraft)=>{
   const today=effectiveDateAt(new Date((ports.now??Date.now)()).toISOString(),record.timezone),common={revision,effectiveDate:includeOverdue&&date<today?today:date,creatorId:actor.userId,labelIds:record.labelIds??[],partial:false};
   if(record.kind==='expense'||record.kind==='income')result.push({...common,id:'plan:'+scheduleId+':'+date+':main',kind:record.kind,categoryId:record.categoryId??null,allocations:record.allocations??[],postings:[{accountId:record.accountId,currency:record.money.currency,deltaMinor:(minorInteger(record.money.minor)*(record.kind==='expense'?-1n:1n)).toString()}]});
   else if(record.kind==='transfer'){
    const postings:WalletReportRow['postings']=[];if(record.fromAccountId)postings.push({accountId:record.fromAccountId,currency:record.debit.currency,deltaMinor:(-minorInteger(record.debit.minor)).toString()});if(record.toAccountId)postings.push({accountId:record.toAccountId,currency:record.credit.currency,deltaMinor:record.credit.minor});result.push({...common,id:'plan:'+scheduleId+':'+date+':main',kind:'transfer',categoryId:null,allocations:[],postings});
    if(record.fee)result.push({...common,id:'plan:'+scheduleId+':'+date+':fee',kind:'expense',labelIds:[],categoryId:record.fee.categoryId??null,allocations:[],postings:[{accountId:record.fee.accountId,currency:record.fee.money.currency,deltaMinor:(-minorInteger(record.fee.money.minor)).toString()}]});
   }
   if(result.length>10000)limit();
  };
  for(const definition of definitions){try{
   const schedule=schedules.getSchedule(actor,definition.id),existing=ports.reader.all('SELECT o.id,o.due_date,m.state FROM wallet_occurrences o JOIN wallet_occurrence_metadata m ON m.occurrence_id=o.id WHERE o.schedule_id=? AND(o.due_date>=? OR(?=1 AND m.state=?)) AND o.due_date<? ORDER BY o.due_date LIMIT 1001',definition.id,period.fromDate,Number(includeOverdue),'pending',period.toDateExclusive);if(existing.length>1000)limit();
   const occupied=new Set<string>();for(const slot of existing){occupied.add(slot.due_date);if(slot.state!=='pending')continue;try{const current=schedules.getOccurrence(actor,slot.id);append(definition.id,current.dueDate,current.revision,current.draft);}catch(e){if([403,404].includes((e as any)?.status)){complete=false;continue;}throw e;}}
   const planned=planOccurrenceBatch({recurrence:schedule.draft.recurrence,paused:schedule.draft.paused},{...period,timezone:schedule.draft.recurrence.timezone},{limit:100});if(planned.limited)limit();for(const slot of planned.items)if(slot.dueDate>=definition.floor&&!occupied.has(slot.dueDate))append(definition.id,slot.dueDate,schedule.revision,schedule.draft.record);
  }catch(e){if([403,404].includes((e as any)?.status)){complete=false;continue;}throw e;}}
  return {rows:result,complete};
 }
 function projected(actor:Actor,filter:RecordFilter,includeOverdue=false){
  const projection=rows(actor,filter.period,includeOverdue),categories=ports.reader.all('SELECT id,parent_id AS parentId FROM wallet_categories');
  const projectedQueries={...queries,captureReport(subject:Actor,source:RecordFilter){if(subject.userId!==actor.userId||subject.role!==actor.role)throw Error('Projected actor differs');assertWalletActor(ports.reader,subject);const f=normalizeFilter(source),selected:WalletReportRow[]=[];
   for(const row of projection.rows){const postings=row.postings.filter(p=>f.accountIds===undefined||f.accountIds.includes(p.accountId));if(!postings.length)continue;const first=postings[0],base={id:row.id,kind:row.kind,effectiveDate:row.effectiveDate,creatorId:row.creatorId,status:'uncleared' as const,categoryId:row.categoryId,labelIds:row.labelIds,accountIds:postings.map(p=>p.accountId),currency:first.currency,minor:minorInteger(first.deltaMinor)<0n?(-minorInteger(first.deltaMinor)).toString():first.deltaMinor,paymentMethod:'',searchText:''},choices=row.allocations.length?row.allocations.map(a=>a.categoryId):[row.categoryId];if(!choices.some(categoryId=>matchesRecordFilter({...base,categoryId},f,categories)))continue;selected.push({...row,postings});}
   return {filter:f,rows:selected,total:selected.length};
  }};
  const today=effectiveDateAt(new Date((ports.now??Date.now)()).toISOString(),filter.period.timezone);return {reports:createWalletReports({...ports,queries:projectedQueries,valuationDate:date=>date>today?today:date}),complete:projection.complete};
 }
 return {expense(actor:Actor,filter:RecordFilter){const {reports,complete}=projected(actor,filter),value=reports.captureExpenseComponents(actor,filter);return {...value,complete:complete&&value.report.coverage.complete};},cashflow(actor:Actor,filter:RecordFilter,options:{includeOverdue?:boolean}={}){if(options.includeOverdue!==undefined&&typeof options.includeOverdue!=='boolean')throw Error('Invalid overdue forecast policy');const {reports,complete}=projected(actor,filter,options.includeOverdue===true),report=reports.getReport(actor,{filter,metric:'cashflow',groupBy:'none',granularity:'month'});return {report,complete:complete&&report.coverage.complete};}};
}
