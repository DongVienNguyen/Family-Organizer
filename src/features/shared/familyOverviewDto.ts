import type {FamilyOverview} from './familyOverview.js';
import type {CalendarRange} from '../productivity/calendarContracts.js';
import {calendarRange,calendarClock} from '../productivity/calendarContracts.js';
import {object,keys,text,integer,boolean,choice} from '../productivity/validation.js';
import {calendarDate,assertTimezone} from '../productivity/dates.js';
import {assertMoney,minorInteger} from '../wallet/money.js';
export function familyOverviewValue(raw:unknown,ownerId:string,requested:CalendarRange):FamilyOverview{
 const value=object(raw);keys(value,['actorId','range','clock','tasks','taskItems','finance']);if(value.actorId!==ownerId)throw Error('Family overview actor mismatch');
 const range=calendarRange(value.range);if(JSON.stringify(range)!==JSON.stringify(calendarRange(requested)))throw Error('Family overview range mismatch');
 const clock=object(value.clock);keys(clock,['nowUtc','timezone']);calendarClock(clock as any);if(clock.timezone!==range.timezone)throw Error('Family clock mismatch');
 const tasks=object(value.tasks);keys(tasks,['active','myTasks','q2','waitingReview','blocked']);for(const key of['active','myTasks','q2','waitingReview','blocked'])integer(tasks[key],0,110000);for(const key of['myTasks','q2','waitingReview','blocked'])if(tasks[key]>tasks.active)throw Error('Family count mismatch');
 if(!Array.isArray(value.taskItems)||value.taskItems.length>20||value.taskItems.length>(tasks.active as number))throw Error('Family Task page bound');const taskIds=new Set<string>();
 for(const raw of value.taskItems){const row=object(raw);keys(row,['ref','title','revision','quadrant','pendingApproval','assigneeId']);const ref=object(row.ref);keys(ref,['kind','id']);if(ref.kind!=='task')throw Error('Family Task source mismatch');text(ref.id,256);if(taskIds.has(ref.id))throw Error('Duplicate Task');taskIds.add(ref.id);text(row.title,500);integer(row.revision,1);choice(row.quadrant,['q1','q2','q3','q4']);boolean(row.pendingApproval);if(row.assigneeId!==null)text(row.assigneeId,256);}
 const finance=object(value.finance);keys(finance,['available','items','total']);boolean(finance.available);integer(finance.total,0,1000);if(!Array.isArray(finance.items)||finance.items.length!==finance.total||!finance.available&&finance.total)throw Error('Family finance count mismatch');const ids=new Set<string>();
 for(const raw of finance.items){const row=object(raw);keys(row,['id','source','title','date','timezone','readOnly','kind','money','accounts','overdue']);text(row.id,600);if(ids.has(row.id))throw Error('Duplicate due slot');ids.add(row.id);const source=object(row.source);keys(source,['kind','id']);if(source.kind!=='walletSchedule')throw Error('Wrong due source');text(source.id,256);text(row.title,500);calendarDate(row.date as string);assertTimezone(row.timezone as string);if(row.date<range.fromDate||row.date>=range.toDateExclusive||row.readOnly!==true)throw Error('Invalid read-only due slot');choice(row.kind,['income','expense','transfer']);assertMoney(row.money);if(minorInteger(row.money.minor)<=0n)throw Error('Invalid due money');boolean(row.overdue);
  if(!Array.isArray(row.accounts)||row.accounts.length<1||row.accounts.length>3)throw Error('Invalid due accounts');const accounts=new Set<string>();for(const raw of row.accounts){const account=object(raw);keys(account,['id','name']);text(account.id,256);text(account.name,500);if(accounts.has(account.id))throw Error('Duplicate due account');accounts.add(account.id);}
 }
 return structuredClone(value)as unknown as FamilyOverview;
}
