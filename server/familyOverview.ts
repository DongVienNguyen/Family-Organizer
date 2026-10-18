import type {AppActor,Due} from '../src/features/productivity/contracts.js';
import {calendarRange,type CalendarRange} from '../src/features/productivity/calendarContracts.js';
import {deadlineImportanceClassifier} from '../src/features/productivity/matrix.js';
import type {FamilyOverview,FamilyDueItem} from '../src/features/shared/familyOverview.js';
import type {TaskReader} from './productivity/access.js';
import {taskScope} from './productivity/access.js';
import {assertContext} from './productivity/tasks.js';
import {createDomainLinks} from './domainLinks.js';
import {createWalletSchedules,planOccurrenceBatch} from './wallet/schedules.js';
import {createWalletAccess,assertWalletActor} from './wallet/access.js';
import {effectiveDateAt} from '../src/features/wallet/dates.js';
import {AppStoreError} from './appErrors.js';
import type {withAppWriteTransaction} from './appStore.js';

/** Read-only composition. References are not grants; optional Wallet authority
 * is resolved before any schedule payload or financial label is projected. */
export function createFamilyOverview(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;now?:()=>number}){
 const {reader}=ports,now=ports.now??Date.now,links=createDomainLinks(ports),schedules=createWalletSchedules(ports);
 return {enabled:links.enabled,getFamilyOverview(actor:AppActor,raw:CalendarRange):FamilyOverview{
  assertContext({actor,requestId:'family-overview:read',expectedRevision:0},reader);
  if(!links.enabled())throw new AppStoreError('Tổng quan gia đình chưa được kích hoạt.',409);
  let range:CalendarRange;try{range=calendarRange(raw);}catch{throw new AppStoreError('Khoảng tổng quan không hợp lệ.',400);}
  const clock={nowUtc:new Date(now()).toISOString(),timezone:range.timezone},classify=deadlineImportanceClassifier(clock),scope=taskScope(actor);
  // Narrow facts only: no Task body, legacy JSON, history or derived title cache.
  const rows=reader.all("SELECT t.id,t.title,t.revision,t.lifecycle,t.priority,t.due_kind,t.due_date,t.due_instant,t.due_timezone,t.assignee_id,t.pending_approval,t.blocked FROM productivity_tasks t WHERE ("+scope.sql+") AND t.parent_id IS NULL AND t.lifecycle IN('todo','in_progress') ORDER BY t.rank,t.id LIMIT 110001",...scope.args);
  if(rows.length>110000)throw new AppStoreError('Tổng quan vượt ngân sách công việc.',413);
  const tasks={active:rows.length,myTasks:0,q2:0,waitingReview:0,blocked:0},taskItems:FamilyOverview['taskItems']=[];
  for(const row of rows){const due:Due=row.due_kind==='none'?{kind:'none'}:row.due_kind==='all_day'?{kind:'all_day',date:row.due_date,timezone:row.due_timezone}:{kind:'timed',instantUtc:row.due_instant,timezone:row.due_timezone},quadrant=classify({due,priority:row.priority,lifecycle:row.lifecycle});
   if(row.assignee_id===actor.userId)tasks.myTasks++;if(quadrant==='q2')tasks.q2++;if(row.pending_approval)tasks.waitingReview++;if(row.blocked)tasks.blocked++;
   if(taskItems.length<20)taskItems.push({ref:{kind:'task',id:row.id},title:row.title,revision:row.revision,quadrant,pendingApproval:!!row.pending_approval,assigneeId:row.assignee_id});
  }
  const finance:FamilyOverview['finance']={available:false,items:[],total:0};
  if(['admin','member'].includes(actor.role)&&reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value==='1'&&reader.get("SELECT 1 FROM sqlite_master WHERE type='table'AND name='wallet_schedule_metadata'")){
   assertWalletActor(reader,actor);finance.available=true;
   for(const header of schedules.listSchedules(actor)){
    if(header.archivedAt||header.paused)continue;
    const source=schedules.getSchedule(actor,header.id),draft=source.draft;
    const addSlot=(id:string,date:string,timezone:string,record:typeof draft.record)=>{
     const ids=record.kind==='transfer'?[record.fromAccountId,record.toAccountId,...(record.fee?[record.fee.accountId]:[])]:[record.accountId];
     let accounts;try{accounts=[...new Set(ids.filter((id):id is string=>typeof id==='string'))].map(id=>createWalletAccess(reader).getAccount(actor,id));}catch(error){if(error instanceof AppStoreError&&[403,404].includes(error.status))return;throw error;}
     if(accounts.some(account=>account.archivedAt))return;
     const item:FamilyDueItem={id,source:{kind:'walletSchedule',id:header.id},title:header.name,date,timezone,readOnly:true,kind:record.kind as FamilyDueItem['kind'],money:structuredClone(record.kind==='transfer'?record.debit:record.money),accounts:accounts.map(value=>({id:value.id,name:value.name})),overdue:date<effectiveDateAt(clock.nowUtc,timezone)};
     finance.items.push(item);if(finance.items.length>1000)throw new AppStoreError('Quá nhiều hạn tài chính; chọn khoảng ngắn hơn.',413);
    };
    // A materialized slot owns frozen financial facts, including its former
    // account. Editing the schedule cannot replace those facts or their ACL.
    const persisted=reader.all('SELECT o.id,o.due_date,m.state FROM wallet_occurrences o JOIN wallet_occurrence_metadata m ON m.occurrence_id=o.id WHERE o.schedule_id=?AND o.due_date>=?AND o.due_date<?ORDER BY o.due_date,o.id LIMIT 1001',header.id,range.fromDate,range.toDateExclusive);
    if(persisted.length>1000)throw new AppStoreError('Quá nhiều kỳ tài chính; chọn khoảng ngắn hơn.',413);
    const existingDates=new Set(persisted.map(row=>row.due_date));
    for(const row of persisted){if(row.state!=='pending')continue;try{const slot=schedules.getOccurrence(actor,row.id);addSlot(JSON.stringify(['walletSchedule',header.id,'occurrence',row.id]),slot.dueDate,slot.timezone,slot.draft);}catch(error){if(error instanceof AppStoreError&&[403,404].includes(error.status))continue;throw error;}}
    // Dates stay floating in the original schedule zone. Merely viewing a year
    // must never materialize a slot, trigger a job or manufacture a Task.
    const plan=planOccurrenceBatch(draft,{...range,timezone:draft.recurrence.timezone},{limit:100});
    if(plan.limited)throw new AppStoreError('Lịch hạn quá dài; chọn khoảng ngắn hơn.',413);
    for(const slot of plan.items)if(!existingDates.has(slot.dueDate))addSlot(JSON.stringify(['walletSchedule',header.id,slot.ordinal]),slot.dueDate,slot.timezone,draft.record);
   }
   finance.items.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));finance.total=finance.items.length;
  }
  assertContext({actor,requestId:'family-overview:read',expectedRevision:0},reader);
  return {actorId:actor.userId,range,clock,tasks,taskItems,finance};
 }};
}
