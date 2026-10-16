import {isDeepStrictEqual} from 'node:util';
import {object,keys,text,integer,choice} from '../../src/features/productivity/validation.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {AppStoreError} from '../appErrors.js';
import type {TaskReader} from './access.js';
import type {StoredTask} from './store.js';
import type {RecurrenceSeries} from './seriesRecord.js';
/** Pure boot/snapshot semantic check. A historical membership is frozen while
 * ordinary Task revisions may advance after conversion. No accepted facts are
 * synthesized from the previous recurrence representation. */
export function validateLegacyCutovers(input:{cutovers:Record<string,any>[];tasks:Map<string,Record<string,any>>;series:RecurrenceSeries[];occurrences:Record<string,any>[];userIds:ReadonlySet<string>}):void {
 const fail=():never=>{throw Error('Invalid legacy recurrence cutover reference');},series=new Map(input.series.map(s=>[s.id,s])),roots=new Set<string>(),owners=new Set<string>(),selected=new Set<string>();
 const children=new Map<string,string[]>(),owned=new Map(input.occurrences.map(row=>[row.task_id,row.series_id]));for(const [id,task]of input.tasks){const parent=JSON.parse(task.legacy_json).sourceRecurringTaskId;if(typeof parent==='string'){const values=children.get(parent)??[];values.push(id);children.set(parent,values);}}
 for(const row of input.cutovers){
  for(const key of ['legacy_root_task_id','series_id','selected_task_id','actor_id'])text(row[key],256);utcInstant(row.created_at);
  if(roots.has(row.legacy_root_task_id)||owners.has(row.series_id)||selected.has(row.selected_task_id))fail();roots.add(row.legacy_root_task_id);owners.add(row.series_id);selected.add(row.selected_task_id);
  const owner=series.get(row.series_id);if(!owner||owner.taskId!==row.selected_task_id||owner.createdAt!==row.created_at||!input.userIds.has(row.actor_id))fail();
  const source=object(JSON.parse(row.source_json));keys(source,['format','fingerprint','members']);if(source.format!==1||typeof source.fingerprint!=='string'||! /^[a-f0-9]{64}$/.test(source.fingerprint)||!Array.isArray(source.members)||!source.members.length||source.members.length>10000)fail();
  const members=new Map<string,{sourceId:string|null;type:string}>();let stopped=0;
  for(const value of source.members as unknown[]){const member=object(value);keys(member,['taskId','revision','recurrenceType','sourceTaskId']);text(member.taskId,256);integer(member.revision,1);choice(member.recurrenceType,['none','daily','weekly','monthly','yearly']);if(member.sourceTaskId!==null)text(member.sourceTaskId,256);if(members.has(member.taskId as string))fail();
   const task=input.tasks.get(member.taskId as string);if(!task)fail();const legacy=JSON.parse(task!.legacy_json),changed=member.recurrenceType!=='none';if(changed)stopped++;
   if((legacy.recurrenceType??'none')!=='none'||(legacy.sourceRecurringTaskId??null)!==member.sourceTaskId||task!.revision<(member.revision as number)+(changed?1:0))fail();members.set(member.taskId as string,{sourceId:member.sourceTaskId as string|null,type:member.recurrenceType as string});
  }
  if((!stopped&&members.size<2)||!members.has(row.selected_task_id)||!members.has(row.legacy_root_task_id)||members.get(row.legacy_root_task_id)!.sourceId!==null)fail();
  const connected=new Set<string>([row.legacy_root_task_id]),queue=[row.legacy_root_task_id];for(let index=0;index<queue.length;index++)for(const child of children.get(queue[index])??[]){if(connected.has(child))fail();connected.add(child);queue.push(child);if(!members.has(child)&&owned.get(child)!==row.series_id)fail();}
  if([...members.keys()].some(id=>!connected.has(id)))fail();
 }
}
/** Metadata writes cannot reactivate a converted family or change a typed
 * occurrence's old recurrence knobs through a retained legacy form. Unchanged
 * values remain valid so ordinary title/proof/approval edits still work. */
export function hasManagedLegacyPolicy(reader:TaskReader,id:string):boolean {
 if(!reader.get("SELECT name FROM sqlite_master WHERE type='table'AND name='app_migrations'"))return false;
 if(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version!==13)return false;
 return !!(reader.get("SELECT c.series_id FROM productivity_legacy_cutovers c,json_each(c.source_json,'$.members')m WHERE json_extract(m.value,'$.taskId')=? LIMIT 1",id)||reader.get('SELECT id FROM productivity_series WHERE task_id=? UNION ALL SELECT series_id FROM productivity_series_occurrences WHERE task_id=? LIMIT 1',id,id));
}
const policy=(value:Record<string,any>)=>({recurrenceType:value.recurrenceType??'none',recurrenceInterval:value.recurrenceInterval??1,recurrenceEndDate:value.recurrenceEndDate??null,rotationMemberIds:value.rotationMemberIds??[],sourceRecurringTaskId:value.sourceRecurringTaskId??null});
export function assertManagedLegacyPatch(reader:TaskReader,previous:Record<string,any>,patch:Record<string,any>):void {
 if(hasManagedLegacyPolicy(reader,previous.id)&&!isDeepStrictEqual(policy(previous),policy({...previous,...patch})))throw new AppStoreError('Lịch lặp đã chuyển; dùng trình chỉnh lịch được quản lý.',409,'legacy-recurrence-converted');
}
export function assertCutoverTaskWrite(reader:TaskReader,task:StoredTask):void {
 if(!hasManagedLegacyPolicy(reader,task.id))return;const row=reader.get('SELECT legacy_json FROM productivity_tasks WHERE id=?',task.id);if(!row)return;
 assertManagedLegacyPatch(reader,JSON.parse(row.legacy_json),task.legacy);
}
