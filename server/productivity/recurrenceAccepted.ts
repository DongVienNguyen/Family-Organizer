import {productivityVersionsFrom} from './knownVersions.js';
import {materializeSeriesSuccessor} from './recurrenceMaterialize.js';
import type {AppWriteTx} from '../appStore.js';
import type {Task} from '../../src/types.js';
import {TaskStatus} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {decodeSeries} from './seriesRecord.js';
import {decodeSeriesOccurrence} from './occurrenceRecord.js';
import {transitionRotation} from './recurrencePolicy.js';
import {loadTask} from './store.js';
const fail=(message:string):never=>{throw new AppStoreError(message,422,'recurrence-acceptance');};
export function isDurableOccurrenceTask(tx:AppWriteTx,taskId:string):boolean {
 return productivityVersionsFrom(11).includes(tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version)&&!!(tx.get('SELECT id FROM productivity_series WHERE task_id=?',taskId)||tx.get('SELECT task_id FROM productivity_series_occurrences WHERE task_id=?',taskId));
}
/** Trusted synchronous completion writer only: no client accepted timestamp,
 * independent transaction, clock, reward ledger or delivery side effect. Caller
 * flushes the accepted legacy Task first, within its existing I01 transaction. */
export function acceptRecurringOccurrence(tx:AppWriteTx,task:Task,actorId:string,acceptedAt:string):boolean {
 const version=tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version;if(!productivityVersionsFrom(11).includes(version))return false;
 if(productivityVersionsFrom(12).includes(version)&&tx.get('SELECT task_id FROM productivity_occurrence_skips WHERE task_id=?',task.id))fail('Kỳ đã bỏ qua không được chấp nhận lại.');
 const ownRow=tx.get('SELECT * FROM productivity_series_occurrences WHERE task_id=?',task.id),own=ownRow?decodeSeriesOccurrence(ownRow):undefined;
 const row=own?tx.get('SELECT * FROM productivity_series WHERE id=?',own.seriesId):tx.get('SELECT * FROM productivity_series WHERE task_id=?',task.id);if(!row)return false;
 const series=decodeSeries(row);if(own?.state==='accepted')return true;
 const source=loadTask(tx,task.id);if(!source||source.lifecycle!=='completed'||source.pendingApproval||task.status!==TaskStatus.COMPLETED)fail('Kỳ lặp chưa được chấp nhận.');
 if(source.due.kind!=='none'&&source.due.timezone!==series.policy.timezone)fail('Mốc hạn chót và múi giờ lịch lặp không khớp.');
 if(utcInstant(acceptedAt)<utcInstant(series.updatedAt))fail('Đồng hồ lịch lặp đã lùi.');
 if(series.revision===Number.MAX_SAFE_INTEGER||series.acceptedCount===100000)fail('Lịch lặp đã đạt giới hạn.');
 const ordinal=own?.ordinal??0;
 if(!own&&series.nextOrdinal!==1||own&&own.ordinal!==series.nextOrdinal-1)fail('Kỳ lặp hiện hành không khớp.');
 if(own)tx.run("UPDATE productivity_series_occurrences SET state='accepted',accepted_at=?,accepted_revision=? WHERE series_id=? AND ordinal=?",acceptedAt,source.revision,series.id,ordinal);
 else tx.run('INSERT INTO productivity_series_occurrences VALUES(?,?,?,?,?,?,?,?,?)',series.id,0,task.id,'accepted',JSON.stringify(series.policy),JSON.stringify(source.due),series.createdAt,acceptedAt,source.revision);
 const rotation=transitionRotation({members:series.policy.rotationMembers,cursor:series.rotationCursor,transition:'accepted'});
 const {nextOrdinal,endedAt}=materializeSeriesSuccessor(tx,{series,source,task,actorId,createdAt:acceptedAt,acceptedCompletedAt:acceptedAt,calendarOrigin:series.nextOrdinal,assigneeId:rotation.assigneeId??source.assigneeId});
 tx.run('UPDATE productivity_series SET revision=revision+1,next_ordinal=?,accepted_count=accepted_count+1,rotation_cursor=?,ended_at=?,updated_at=? WHERE id=?',nextOrdinal,rotation.cursor,endedAt,acceptedAt,series.id);
 return true;
}
