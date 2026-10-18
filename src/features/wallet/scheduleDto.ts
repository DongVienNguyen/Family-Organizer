import {object,keys,text,integer,choice,boolean} from '../productivity/validation.js';
import {utcInstant,calendarDate,timezoneFormatter} from '../productivity/dates.js';
import {normalizeScheduleDraft,type ScheduleDraft} from './scheduleContracts.js';
import {recordDraftValue} from './recordDraftValue.js';
import type {WalletScheduleHeader,WalletOccurrence} from '../../../server/wallet/scheduleCommands.js';
import type {OccurrenceDraft} from '../../../server/wallet/occurrencePlan.js';
export function scheduleHeaderValue(raw:unknown,id?:string):WalletScheduleHeader {
 const v=object(raw);keys(v,['id','name','revision','mode','paused','archivedAt','catchupLimited']);text(v.id,256);text(v.name,500);integer(v.revision,1);choice(v.mode,['manual','automatic']);boolean(v.paused);boolean(v.catchupLimited);if(v.archivedAt!==null)utcInstant(v.archivedAt as string);if(id!==undefined&&v.id!==id)throw Error('Schedule identity');return {...v} as unknown as WalletScheduleHeader;
}
export function scheduleDetailValue(raw:unknown,id:string){
 const v=object(raw);keys(v,['id','name','revision','mode','paused','archivedAt','catchupLimited','draft']);const {draft,...metadata}=v,header=scheduleHeaderValue(metadata,id),normalized=normalizeScheduleDraft(draft);if(header.name!==normalized.name||header.mode!==normalized.mode||header.paused!==normalized.paused)throw Error('Schedule draft binding');return {...header,draft:normalized};
}
export function schedulePreviewValue(raw:unknown,draft:ScheduleDraft):OccurrenceDraft[]{
 const v=object(raw);keys(v,['items']);if(!Array.isArray(v.items)||v.items.length>3)throw Error('Schedule preview bound');let ordinal=-1,date='';return v.items.map(raw=>{const item=object(raw);keys(item,['ordinal','dueDate','timezone']);integer(item.ordinal,0,100000);text(item.dueDate,10);calendarDate(item.dueDate);if(item.timezone!==draft.recurrence.timezone||item.ordinal<=ordinal||item.dueDate<=date||item.dueDate<draft.recurrence.anchorDate||draft.recurrence.untilDate&&item.dueDate>draft.recurrence.untilDate)throw Error('Schedule preview binding');ordinal=item.ordinal;date=item.dueDate;return {...item} as unknown as OccurrenceDraft;});
}
export function occurrenceValue(raw:unknown,id?:string,scheduleId?:string):WalletOccurrence {
 const v=object(raw);keys(v,['id','scheduleId','dueDate','timezone','revision','state','recordId','overdue','draft']);text(v.id,256);text(v.scheduleId,256);text(v.dueDate,10);calendarDate(v.dueDate);text(v.timezone,100);timezoneFormatter(v.timezone);integer(v.revision,1);choice(v.state,['pending','confirmed','skipped']);boolean(v.overdue);if(v.recordId!==null)text(v.recordId,256);const draft=recordDraftValue(v.draft);
 if(id!==undefined&&v.id!==id||scheduleId!==undefined&&v.scheduleId!==scheduleId||!['income','expense','transfer'].includes(draft.kind)||draft.effectiveDate!==v.dueDate||draft.timezone!==v.timezone||draft.occurredAt!==null||draft.reviewedAt!==null||draft.settlementStatus==='reconciled'||(v.state==='confirmed')!==(v.recordId!==null)||v.state!=='pending'&&v.overdue)throw Error('Occurrence binding');return {...v,draft} as unknown as WalletOccurrence;
}
export function occurrencesValue(raw:unknown,scheduleId:string){const v=object(raw);keys(v,['items']);if(!Array.isArray(v.items)||v.items.length>1000)throw Error('Occurrence list bound');const items=v.items.map(raw=>occurrenceValue(raw,undefined,scheduleId));if(new Set(items.map(v=>v.id)).size!==items.length||new Set(items.map(v=>v.dueDate)).size!==items.length)throw Error('Duplicate occurrence');return items;}
export function occurrenceReceiptValue(raw:unknown,id:string,revision:number,state:'confirmed'|'skipped',linkedId?:string){
 const v=object(raw);keys(v,['id','revision','state','recordId']);if(v.id!==id||v.revision!==revision+1||v.state!==state)throw Error('Occurrence receipt');if(state==='confirmed'){text(v.recordId,256);if(linkedId!==undefined&&v.recordId!==linkedId)throw Error('Linked record identity');}else if(v.recordId!==null)throw Error('Skipped record');return {id,revision:revision+1,state,recordId:v.recordId as string|null};
}
