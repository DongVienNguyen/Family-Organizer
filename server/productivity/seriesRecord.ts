import {validateLegacyCutovers} from './legacyCutoverRecord.js';
import {validateOccurrenceResolutions} from './occurrenceResolution.js';
import {validateOwnedOccurrenceRows} from './occurrenceRecord.js';
import {isDeepStrictEqual} from 'node:util';
import {normalizeRecurrencePolicy,type RecurrencePolicy} from './recurrencePolicy.js';
import {assertDue,utcInstant} from '../../src/features/productivity/dates.js';
import {integer,text,choice,keys,object} from '../../src/features/productivity/validation.js';
import type {TaskRecord} from '../../src/features/productivity/contracts.js';
import type {TaskReader} from './access.js';

export interface RecurrenceSeries {
 id:string;taskId:string;revision:number;policy:RecurrencePolicy;anchor:TaskRecord['due'];
 nextOrdinal:number;acceptedCount:number;rotationCursor:number;endedAt:string|null;createdAt:string;updatedAt:string;
}
export function decodeSeries(row:Record<string,unknown>):RecurrenceSeries {
 text(row.id,256);text(row.task_id,256);integer(row.revision,1);integer(row.next_ordinal,1,100001);integer(row.accepted_count,0,100000);integer(row.rotation_cursor);
 const raw=JSON.parse(row.policy_json as string),policy=normalizeRecurrencePolicy(raw);if(!isDeepStrictEqual(raw,policy))throw Error('Noncanonical recurrence policy');
 const anchor=JSON.parse(row.anchor_json as string);assertDue(anchor);if(policy.base==='due'&&anchor.kind==='none')throw Error('Due-based series requires an anchor');
 if(anchor.kind!=='none'&&anchor.timezone!==policy.timezone)throw Error('Series anchor timezone mismatch');
 const created=utcInstant(row.created_at as string),updated=utcInstant(row.updated_at as string);if(updated<created)throw Error('Series timestamp order');
 if(row.ended_at!==null&&(utcInstant(row.ended_at as string)<created||utcInstant(row.ended_at as string)>updated))throw Error('Series end outside persisted lifetime');
 if((row.accepted_count as number)>(row.next_ordinal as number))throw Error('Series accepted count exceeds materialized slots');
 return {id:row.id as string,taskId:row.task_id as string,revision:row.revision as number,policy,anchor:structuredClone(anchor),nextOrdinal:row.next_ordinal as number,acceptedCount:row.accepted_count as number,rotationCursor:row.rotation_cursor as number,endedAt:row.ended_at as string|null,createdAt:row.created_at as string,updatedAt:row.updated_at as string};
}
export type SeriesException={seriesId:string;ordinal:number;revision:number}&({kind:'skip'}|{kind:'due';due:TaskRecord['due']});
export function decodeSeriesException(row:Record<string,unknown>):SeriesException {
 text(row.series_id,256);integer(row.ordinal,0,100000);integer(row.revision,1);choice(row.kind,['skip','due']);
 const base={seriesId:row.series_id as string,ordinal:row.ordinal as number,revision:row.revision as number};
 if(row.kind==='skip'){if(row.due_json!==null)throw Error('Skip cannot carry a deadline override');return {...base,kind:'skip'};}
 const due=JSON.parse(row.due_json as string);assertDue(due);return {...base,kind:'due',due:structuredClone(due)};
}
export type SeriesExceptionIntent={kind:'skip'}|{kind:'due';due:TaskRecord['due']};
export function normalizeSeriesException(input:unknown):SeriesExceptionIntent {
 const value=object(input);choice(value.kind,['skip','due']);keys(value,value.kind==='skip'?['kind']:['kind','due']);
 if(value.kind==='skip')return {kind:'skip'};assertDue(value.due);return {kind:'due',due:structuredClone(value.due)};
}
/** Shared semantic inspection for persisted rows and replacement snapshots.
 * Historical deleted users remain valid references; new commands separately
 * require live rotation members. This function never opens or changes storage. */
export function validateSeriesRows(input:{series:Record<string,unknown>[];exceptions:Record<string,unknown>[];taskIds:ReadonlySet<string>;userIds:ReadonlySet<string>}):void {
 const fail=():never=>{throw Error('Invalid recurrence series reference');},series=new Map(input.series.map(row=>{const value=decodeSeries(row);if(!input.taskIds.has(value.taskId)||value.policy.rotationMembers.some(id=>!input.userIds.has(id)))fail();return [value.id,value];}));
 if(series.size!==input.series.length||new Set([...series.values()].map(value=>value.taskId)).size!==series.size)fail();
 const seen=new Set<string>();
 for(const row of input.exceptions){
  const value=decodeSeriesException(row),owner=series.get(value.seriesId),key=JSON.stringify([value.seriesId,value.ordinal]);
  if(seen.has(key)||!owner||value.revision>owner.revision||owner.policy.end.kind==='count'&&value.ordinal>=owner.policy.end.count||value.kind==='due'&&value.due.kind!=='none'&&value.due.timezone!==owner.policy.timezone)fail();seen.add(key);
 }
}
export function validateSeriesStorage(reader:TaskReader):void {
 if(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version===13)validateLegacyCutovers({cutovers:reader.all('SELECT * FROM productivity_legacy_cutovers'),occurrences:reader.all('SELECT * FROM productivity_series_occurrences'),tasks:new Map(reader.all('SELECT * FROM productivity_tasks').map(row=>[row.id,row])),series:reader.all('SELECT * FROM productivity_series').map(decodeSeries),userIds:new Set(reader.all('SELECT id FROM users').map(row=>row.id))});
 if((reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version??0)<10)return;
 validateSeriesRows({series:reader.all('SELECT * FROM productivity_series'),exceptions:reader.all('SELECT * FROM productivity_series_exceptions'),taskIds:new Set(reader.all('SELECT id FROM productivity_tasks').map(row=>row.id)),userIds:new Set(reader.all('SELECT id FROM users').map(row=>row.id))});
 if(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version===11)validateOwnedOccurrenceRows({occurrences:reader.all('SELECT * FROM productivity_series_occurrences'),series:reader.all('SELECT * FROM productivity_series').map(decodeSeries),tasks:new Map(reader.all('SELECT id,revision FROM productivity_tasks').map(row=>[row.id,{revision:row.revision}]))});
 if([12,13].includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))validateOccurrenceResolutions({occurrences:reader.all('SELECT * FROM productivity_series_occurrences'),skips:reader.all('SELECT * FROM productivity_occurrence_skips'),series:reader.all('SELECT * FROM productivity_series').map(decodeSeries),tasks:new Map(reader.all('SELECT id,revision,lifecycle FROM productivity_tasks').map(row=>[row.id,{revision:row.revision,lifecycle:row.lifecycle}])),userIds:new Set(reader.all('SELECT id FROM users').map(row=>row.id))});
}
