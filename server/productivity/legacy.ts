import type {Task} from '../../src/types.js';
import {object,text,strings,choice,integer,boolean} from '../../src/features/productivity/validation.js';
/** Validate source types before canonical normalization; never turn a string
 * container into individual character tags or archive malformed provenance.
 */
export function assertLegacyTask(value:unknown):asserts value is Task {
 const t=object(value);for(const key of ['id','creatorId'])text(t[key],256);text(t.title,500);text(t.description,100000,false);text(t.dueDate,100000,false);
 choice(t.status,['todo','in_progress','completed','overdue']);choice(t.priority,['high','medium','low']);boolean(t.isShared);strings(t.tags);
 if(t.assigneeId!==null)text(t.assigneeId,256);text(t.createdAt,128);text(t.updatedAt,128);
 for(const key of ['comments','history']){
  if(!Array.isArray(t[key]))throw new Error('Invalid legacy '+key);
  for(const entry of t[key] as unknown[]){const row=object(entry);for(const field of ['id','userId','username','createdAt'])text(row[field],256);text(row[key==='comments'?'content':'action'],100000,false);}
 }
 for(const key of ['completedById','completedAt','submittedById','submittedAt','proofImage','proofNote','rejectionReason','recurrenceEndDate','sourceRecurringTaskId'])if(t[key]!==undefined&&t[key]!==null)text(t[key],16*1024*1024,false);
 if(t.rewardPoints!==undefined)integer(t.rewardPoints);if(t.recurrenceInterval!==undefined)integer(t.recurrenceInterval,1);
 if(t.pendingApproval!==undefined)boolean(t.pendingApproval);
 if(t.rotationMemberIds!==undefined)strings(t.rotationMemberIds);
 if(t.recurrenceType!==undefined)choice(t.recurrenceType,['none','daily','weekly','monthly','yearly']);
}
