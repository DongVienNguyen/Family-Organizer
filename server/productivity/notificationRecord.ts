import {productivityVersionsFrom} from './knownVersions.js';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {text,integer,choice} from '../../src/features/productivity/validation.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {normalizeTaskNotificationPreferences} from '../../src/features/productivity/notificationPolicy.js';
import type {TaskReader} from './access.js';
export const taskReminderIdentity=(input:{taskId:string;recipientId:string;kind:string;offsetMinutes:number|null;absoluteAt:string|null})=>createHash('sha256').update(JSON.stringify([input.taskId,input.recipientId,input.kind,input.offsetMinutes,input.absoluteAt])).digest('hex');
export function validateTaskNotificationRows(data:{preferences:any[];rules:any[];claims:any[];deliveries:any[];taskIds:Set<string>;userIds:Set<string>}):void {
 const fail=():never=>{throw Error('Invalid task notification snapshot reference');},stamp=(row:any)=>{const created=utcInstant(row.created_at),updated=utcInstant(row.updated_at);if(updated<created)fail();},digest=(value:unknown)=>{if(typeof value!=='string'||! /^[a-f0-9]{64}$/.test(value))fail();},user=(id:unknown)=>{text(id,256);if(!data.userIds.has(id))fail();},task=(id:unknown)=>{text(id,256);if(!data.taskIds.has(id))fail();},rules=new Map<string,any>();
 for(const row of data.preferences){user(row.user_id);integer(row.revision,1);utcInstant(row.updated_at);const raw=JSON.parse(row.settings_json),normalized=normalizeTaskNotificationPreferences(raw);if(!isDeepStrictEqual(raw,normalized))fail();}
 for(const row of data.rules){text(row.id,256);digest(row.identity_key);task(row.task_id);user(row.recipient_id);choice(row.kind,['due','timebox','absolute']);integer(row.revision,1);if(![0,1].includes(row.enabled))fail();stamp(row);if(row.kind==='absolute'){if(row.offset_minutes!==null)fail();utcInstant(row.absolute_at);}else{integer(row.offset_minutes,0,525600);if(row.absolute_at!==null)fail();}if(row.identity_key!==taskReminderIdentity({taskId:row.task_id,recipientId:row.recipient_id,kind:row.kind,offsetMinutes:row.offset_minutes,absoluteAt:row.absolute_at}))fail();if(rules.has(row.id))fail();rules.set(row.id,row);}
 const tuples=new Set<string>();
 for(const row of data.claims){text(row.id,256);const rule=rules.get(row.rule_id);task(row.task_id);user(row.recipient_id);text(row.occurrence_key,600);choice(row.kind,['due','timebox','absolute']);if(!rule||rule.task_id!==row.task_id||rule.recipient_id!==row.recipient_id||rule.kind!==row.kind)fail();utcInstant(row.fire_at);digest(row.source_fingerprint);choice(row.state,['pending','cancelled','suppressed','consumed','delivered']);stamp(row);const tuple=JSON.stringify([row.task_id,row.occurrence_key,row.recipient_id,row.kind,row.fire_at]);if(tuples.has(tuple))fail();tuples.add(tuple);}
 for(const row of data.deliveries){text(row.notification_id,256);task(row.task_id);user(row.recipient_id);const eligible=utcInstant(row.eligible_at);if(row.available_at!==null&&utcInstant(row.available_at)<eligible)fail();choice(row.state,['pending','queued','suppressed','consumed']);if(row.digest_key!==null)text(row.digest_key,256);stamp(row);}
}
export function validateTaskNotificationStorage(reader:TaskReader):void {
 const version=reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version;if(!productivityVersionsFrom(14).includes(version))return;
 validateTaskNotificationRows({preferences:reader.all('SELECT * FROM productivity_task_notification_preferences'),rules:reader.all('SELECT * FROM productivity_task_reminder_rules'),claims:reader.all('SELECT * FROM productivity_task_reminder_claims'),deliveries:reader.all('SELECT * FROM productivity_task_notice_deliveries'),taskIds:new Set(reader.all('SELECT id FROM productivity_tasks').map(row=>row.id)),userIds:new Set(reader.all('SELECT id FROM users').map(row=>row.id))});
}
