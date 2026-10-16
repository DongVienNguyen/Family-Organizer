import {expect,it} from 'vitest';
import {planRecurrenceSlot} from './recurrenceSlots.js';
import * as slots from './recurrenceSlots.js';

const policy=(extra:any={})=>({timezone:'Asia/Saigon',base:'due',cadence:{kind:'calendar',frequency:'monthly',interval:1,invalidDate:'clamp'},end:{kind:'never'},missed:'skip',rotationMembers:[],...extra});
const input=(extra:any={})=>({policy:policy(),anchor:{kind:'all_day',date:'2027-01-31',timezone:'Asia/Saigon'},ordinal:1,...extra});
it('plans each monthly slot from the original anchor without accumulating clamped dates',()=>{
 expect(planRecurrenceSlot(input())).toEqual({kind:'due',ordinal:1,due:{kind:'all_day',date:'2027-02-28',timezone:'Asia/Saigon'}});
 expect(planRecurrenceSlot(input({ordinal:2}))).toEqual({kind:'due',ordinal:2,due:{kind:'all_day',date:'2027-03-31',timezone:'Asia/Saigon'}});
 expect(planRecurrenceSlot(input({anchor:{kind:'all_day',date:'2028-01-31',timezone:'Asia/Saigon'}}))).toMatchObject({due:{date:'2028-02-29'}});
});
it('retains an invalid-date skip as a virtual slot without shifting subsequent ordinals',()=>{
 const p=policy({cadence:{kind:'calendar',frequency:'monthly',interval:1,invalidDate:'skip'}});
 expect(planRecurrenceSlot(input({policy:p}))).toEqual({kind:'skipped',ordinal:1,year:2027,month:2,requestedDay:31});
 expect(planRecurrenceSlot(input({policy:p,ordinal:2}))).toMatchObject({kind:'due',ordinal:2,due:{date:'2027-03-31'}});
});
it('due-based weekly planning ignores a late accepted completion as an anchor',()=>{
 const p=policy({cadence:{kind:'calendar',frequency:'weekly',interval:1,invalidDate:'clamp'}});
 expect(planRecurrenceSlot(input({policy:p,acceptedCompletedAt:'2027-03-01T00:00:00Z'}))).toMatchObject({due:{date:'2027-02-07'}});
});
it('completion-based slot identity uses one interval from each actual acceptance, never global ordinal times interval',()=>{
 const p=policy({base:'completion',cadence:{kind:'calendar',frequency:'weekly',interval:1,invalidDate:'clamp'}});
 expect(planRecurrenceSlot(input({policy:p,ordinal:7,acceptedCompletedAt:'2027-03-02T18:00:00Z'}))).toEqual({kind:'due',ordinal:7,due:{kind:'all_day',date:'2027-03-10',timezone:'Asia/Saigon'}});
 expect(planRecurrenceSlot(input({policy:p,anchor:{kind:'none'},acceptedCompletedAt:'2027-03-02T18:00:00Z'}))).toMatchObject({due:{date:'2027-03-10'}});
});
it('does not invent an accepted completion time for a future virtual completion-based slot',()=>{
 expect(planRecurrenceSlot(input({policy:policy({base:'completion'})}))).toEqual({kind:'awaiting-acceptance',ordinal:1});
});
it.each([1,5,100000])('counts the existing root at ordinal0 and stops before ordinal=count (%s)',count=>{
 const p=policy({end:{kind:'count',count}});
 expect(planRecurrenceSlot(input({policy:p,ordinal:count}))).toEqual({kind:'end',ordinal:count,reason:'count'});
 if(count===5)expect(planRecurrenceSlot(input({policy:p,ordinal:4}))).toMatchObject({kind:'due',due:{date:'2027-05-31'}});
});
it('applies inclusive local end date while retaining month-clamp semantics',()=>{
 const p=policy({end:{kind:'date',date:'2027-02-28'}});
 expect(planRecurrenceSlot(input({policy:p}))).toMatchObject({kind:'due',due:{date:'2027-02-28'}});
 expect(planRecurrenceSlot(input({policy:p,ordinal:2}))).toEqual({kind:'end',ordinal:2,reason:'date'});
});
it('uses sorted unique explicit successor dates without silently filtering selected past dates',()=>{
 const p=policy({cadence:{kind:'dates',dates:['2027-05-04','2027-02-10','2027-05-04']}});
 expect(planRecurrenceSlot(input({policy:p}))).toMatchObject({kind:'due',ordinal:1,due:{date:'2027-02-10'}});
 expect(planRecurrenceSlot(input({policy:p,ordinal:2}))).toMatchObject({kind:'due',ordinal:2,due:{date:'2027-05-04'}});
 expect(planRecurrenceSlot(input({policy:p,ordinal:3}))).toEqual({kind:'end',ordinal:3,reason:'dates-exhausted'});
 const earlier=policy({cadence:{kind:'dates',dates:['2027-01-10']}});expect(planRecurrenceSlot(input({policy:earlier}))).toMatchObject({due:{date:'2027-01-10'}});
});
it('preserves timed explicit-date wall time and milliseconds across an offset change',()=>{
 const p=policy({timezone:'America/New_York',cadence:{kind:'dates',dates:['2027-04-01']}});
 expect(planRecurrenceSlot(input({policy:p,anchor:{kind:'timed',instantUtc:'2027-01-31T14:30:00.123Z',timezone:'America/New_York'}}))).toEqual({kind:'due',ordinal:1,due:{kind:'timed',instantUtc:'2027-04-01T13:30:00.123Z',timezone:'America/New_York'}});
});
it.each(['2027-03-14','2027-11-07'])('requires an explicit instant for an ambiguous or missing timed wall clock on %s',date=>{
 const hour=date.endsWith('03-14')?'07:30':'06:30',p=policy({timezone:'America/New_York',cadence:{kind:'dates',dates:[date]}});
 const result=planRecurrenceSlot(input({policy:p,anchor:{kind:'timed',instantUtc:'2027-01-31T'+hour+':00Z',timezone:'America/New_York'}}));
 expect(result).toMatchObject({kind:'time-resolution-required',ordinal:1,date,timezone:'America/New_York',reason:'explicit-instant-required'});
});
it('checks end date against timed local date rather than the UTC day',()=>{
 const p=policy({cadence:{kind:'dates',dates:['2027-02-01']},end:{kind:'date',date:'2027-02-01'}});
 expect(planRecurrenceSlot(input({policy:p,anchor:{kind:'timed',instantUtc:'2027-01-30T18:00:00Z',timezone:'Asia/Saigon'}}))).toMatchObject({kind:'due',due:{instantUtc:'2027-01-31T18:00:00.000Z'}});
});
it('never mutates policy or anchor and returns detached due metadata',()=>{
 const source=input(),before=structuredClone(source),result=planRecurrenceSlot(source);expect(source).toEqual(before);
 if(result.kind!=='due')throw Error('Expected due candidate');result.due.kind='none';expect(source).toEqual(before);
});
it.each([{ordinal:0},{ordinal:100001},{ordinal:1.5},{anchor:{kind:'none'}},{anchor:{kind:'all_day',date:'2027-02-30',timezone:'Asia/Saigon'}},{anchor:{kind:'all_day',date:'2027-01-31',timezone:'UTC'}},{acceptedCompletedAt:'not-an-instant'},{policy:policy({rewardPoints:10})},{rewardPoints:10}])('rejects malformed or forged planning input %#',extra=>{
 expect(()=>planRecurrenceSlot(input(extra))).toThrow(/candidate input/i);
});

it('prepares detached validated recurrence inputs once while validating each requested ordinal',()=>{
 const source=input(),prepare=(slots as any).createRecurrenceSlotPlanner;expect(prepare).toBeTypeOf('function');
 const {ordinal:_,...shared}=source,plan=prepare(shared);source.policy.cadence.interval=100;source.anchor.date='2099-01-01';
 expect(plan(1)).toMatchObject({kind:'due',ordinal:1,due:{date:'2027-02-28'}});const first=plan(2);expect(first).toMatchObject({due:{date:'2027-03-31'}});first.due.date='2099-01-01';expect(plan(2)).toMatchObject({due:{date:'2027-03-31'}});
 for(const ordinal of [0,1.5,100001,NaN])expect(()=>plan(ordinal)).toThrow(/candidate input/i);
 expect(()=>prepare({policy:policy(),anchor:{kind:'none'}})).toThrow(/candidate input/i);expect(()=>prepare({...shared,acceptedCompletedAt:'invalid'})).toThrow(/candidate input/i);expect(()=>prepare({...shared,ordinal:1})).toThrow(/candidate input/i);
});
it('keeps global completion identity separate from a validated relative offset while searching skipped calendar cycles',()=>{
 const p=policy({base:'completion',cadence:{kind:'calendar',frequency:'monthly',interval:1,invalidDate:'skip'}}),plan=(slots as any).createRecurrenceSlotPlanner({policy:p,anchor:{kind:'all_day',date:'2026-01-31',timezone:'Asia/Saigon'},acceptedCompletedAt:'2027-01-31T03:15:00.123Z'});
 expect(plan(7)).toMatchObject({kind:'skipped',ordinal:7,year:2027,month:2});expect(plan(8,2)).toMatchObject({kind:'due',ordinal:8,due:{date:'2027-03-31'}});expect(plan(9)).toMatchObject({kind:'skipped',ordinal:9,year:2027,month:2});
 for(const offset of [0,-1,1.5,100001,NaN])expect(()=>plan(8,offset)).toThrow(/candidate input/i);
});
