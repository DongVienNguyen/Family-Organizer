import {expect,it} from 'vitest';
import {decodeSeriesOccurrence,validateOwnedOccurrenceRows} from './occurrenceRecord.js';
const policy={timezone:'Asia/Saigon',base:'due',cadence:{kind:'calendar',frequency:'monthly',interval:1,invalidDate:'clamp'},end:{kind:'never'},missed:'skip',rotationMembers:[]};
const row=(extra:Record<string,unknown>={})=>({series_id:'synthetic-series',ordinal:1,task_id:'synthetic-task',state:'open',policy_json:JSON.stringify(policy),due_json:JSON.stringify({kind:'all_day',date:'2027-02-28',timezone:'Asia/Saigon'}),created_at:'2027-01-31T00:00:00.000Z',accepted_at:null,accepted_revision:null,...extra});
it('decodes detached owned occurrence policy/deadline facts without opening storage',()=>{
 const input=row(),before=structuredClone(input),result=decodeSeriesOccurrence(input);expect(result).toEqual({seriesId:'synthetic-series',ordinal:1,taskId:'synthetic-task',state:'open',policy,due:{kind:'all_day',date:'2027-02-28',timezone:'Asia/Saigon'},createdAt:input.created_at,acceptedAt:null,acceptedRevision:null});result.policy.rotationMembers.push('other');expect(input).toEqual(before);expect(decodeSeriesOccurrence(input).policy.rotationMembers).toEqual([]);
});
it('retains rootordinal0 and actual accepted revision/time independently of current mutable Task',()=>{
 expect(decodeSeriesOccurrence(row({ordinal:0,state:'accepted',accepted_at:'2027-02-01T00:00:00.000Z',accepted_revision:7}))).toMatchObject({ordinal:0,state:'accepted',acceptedAt:'2027-02-01T00:00:00.000Z',acceptedRevision:7});
});
it.each([
 {series_id:''},{task_id:''},{ordinal:-1},{ordinal:100001},{ordinal:1.5},{state:'pending'},
 {policy_json:'{'},{policy_json:JSON.stringify({...policy,rewardPoints:99})},{policy_json:JSON.stringify({...policy,cadence:{...policy.cadence,interval:0}})},
 {due_json:'{'},{due_json:JSON.stringify({kind:'all_day',date:'2027-02-30',timezone:'Asia/Saigon'})},{due_json:JSON.stringify({kind:'all_day',date:'2027-02-28',timezone:'UTC'})},
 {created_at:'invalid'},{accepted_at:'2027-02-01T00:00:00.000Z'},{accepted_revision:1},
 {state:'accepted'},{state:'accepted',accepted_at:'invalid',accepted_revision:1},{state:'accepted',accepted_at:'2027-01-30T00:00:00.000Z',accepted_revision:1},
 {state:'accepted',accepted_at:'2027-02-01T00:00:00.000Z',accepted_revision:0},{ordinal:0}
])('refuses malformed or inconsistent owned occurrence facts %#',extra=>{
 expect(()=>decodeSeriesOccurrence(row(extra))).toThrow(/Invalid owned recurrence occurrence/);
});

const coherence=()=>({occurrences:[row({ordinal:0,state:'accepted',accepted_at:'2027-02-01T00:00:00.000Z',accepted_revision:1}),row({ordinal:1,task_id:'synthetic-next'})],series:[{id:'synthetic-series',taskId:'synthetic-task',revision:2,policy,anchor:{kind:'all_day',date:'2027-01-31',timezone:'Asia/Saigon'},nextOrdinal:2,acceptedCount:1,rotationCursor:1,endedAt:null,createdAt:'2027-01-31T00:00:00.000Z',updatedAt:'2027-02-01T00:00:00.000Z'}],tasks:new Map([['synthetic-task',{revision:2}],['synthetic-next',{revision:1}]])});
it('validates root and open successor ownership while retaining immutable accepted revision below current Task revision',()=>{expect(()=>validateOwnedOccurrenceRows(coherence()as any)).not.toThrow();});
it.each(['unknown-series','missing-task','duplicate-ordinal','duplicate-task','wrong-root','missing-root','accepted-count','cursor-behind','future-accepted-revision','future-history-time','two-open'])('refuses inconsistent owned recurrence history %# %s',damage=>{
 const value=coherence();
 if(damage==='unknown-series')value.occurrences[1].series_id='missing';
 if(damage==='missing-task')value.tasks.delete('synthetic-next');
 if(damage==='duplicate-ordinal')value.occurrences.push({...value.occurrences[1],task_id:'synthetic-other'});
 if(damage==='duplicate-task')value.occurrences.push({...value.occurrences[1],ordinal:2});
 if(damage==='wrong-root')value.series[0].taskId='synthetic-next';
 if(damage==='missing-root')value.occurrences.shift();
 if(damage==='accepted-count')value.series[0].acceptedCount=2;
 if(damage==='cursor-behind')value.series[0].nextOrdinal=1;
 if(damage==='future-accepted-revision')value.occurrences[0].accepted_revision=3;
 if(damage==='future-history-time')value.occurrences[0].accepted_at='2027-03-01T00:00:00.000Z';
 if(damage==='two-open'){value.occurrences.push(row({ordinal:2,task_id:'synthetic-other'}));value.tasks.set('synthetic-other',{revision:1});value.series[0].nextOrdinal=3;}
 expect(()=>validateOwnedOccurrenceRows(value as any)).toThrow(/Invalid owned recurrence coherence/);
});
