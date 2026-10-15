import {isDeepStrictEqual} from 'node:util';
import {assertTaskRecord,type TaskRecord,type AppActor} from '../../src/features/productivity/contracts.js';
import {object,keys,choice,integer,text} from '../../src/features/productivity/validation.js';
export type WorkflowColumn='todo'|'doing'|'waiting'|'review'|'done'|'wont_do'|'trash';
export type BoardWipPolicy={mode:'soft'|'hard';limit:number}|null;
export interface BoardWipDecision {allowed:boolean;warning:boolean;countBefore:number;countAfter:number;overrideReason:string|null}
export function workflowColumn(task:TaskRecord):WorkflowColumn {
 assertTaskRecord(task);
 if(task.deletedAt!==null)return 'trash';if(task.lifecycle==='wont_do')return 'wont_do';
 if(task.pendingApproval)return 'review';if(task.lifecycle==='completed')return 'done';
 if(task.blocked)return 'waiting';return task.lifecycle==='in_progress'?'doing':'todo';
}
const activeRoot=(task:TaskRecord)=>task.parentId===null&&task.deletedAt===null&&task.lifecycle!=='completed'&&task.lifecycle!=='wont_do';
/** Trusted whole-column rows only. Counts are internal decision data, not a
 * permission-safe DTO. P08-b must obtain full scope and check/write atomically. */
export function decideBoardWip(input:{rows:readonly TaskRecord[];candidate:TaskRecord;policy:BoardWipPolicy;actor:AppActor;overrideReason?:string}):BoardWipDecision {
 const packet=object(input);keys(packet,['rows','candidate','policy','actor','overrideReason']);
 const actor=object(input.actor);keys(actor,['userId','role']);text(actor.userId,256);choice(actor.role,['admin','member','child','guest']);
 if(input.policy!==null){const policy=object(input.policy);keys(policy,['mode','limit']);choice(policy.mode,['soft','hard']);integer(policy.limit,0,100000);}
 if(!Array.isArray(input.rows)||input.rows.length>100000)throw Error('Invalid whole-column WIP scope');
 assertTaskRecord(input.candidate);if(!activeRoot(input.candidate))throw Error('WIP entrant must be an active root task');
 const unique=new Map<string,TaskRecord>();
 for(const task of input.rows){assertTaskRecord(task);const prior=unique.get(task.id);if(prior&&!isDeepStrictEqual(prior,task))throw Error('Conflicting duplicate WIP task');unique.set(task.id,task);}
 const existing=unique.get(input.candidate.id);if(existing&&!isDeepStrictEqual(existing,input.candidate))throw Error('WIP entrant changed');
 const countBefore=[...unique.values()].filter(activeRoot).length,countAfter=countBefore+(existing?0:1),warning=input.policy!==null&&countAfter>input.policy.limit;
 let overrideReason:string|null=null;
 if(input.overrideReason!==undefined){text(input.overrideReason,500);if(input.actor.role!=='admin'||input.policy?.mode!=='hard'||!warning)throw Error('Only an explicit admin hard-WIP override is allowed');overrideReason=input.overrideReason;}
 return {allowed:!warning||countAfter===countBefore||input.policy?.mode==='soft'||overrideReason!==null,warning,countBefore,countAfter,overrideReason};
}
