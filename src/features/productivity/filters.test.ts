import {describe,it,expect} from 'vitest';
import {matchesFilter,assertTaskFilter} from './filters.js';
import type {TaskRecord,TaskFilter} from './contracts.js';
const clock={nowUtc:'2026-10-12T00:00:00Z',timezone:'Asia/Saigon'};
const task:TaskRecord={id:'task-1',listId:'list-1',sectionId:'section-1',parentId:null,title:'Mua sữa',body:'Chuẩn bị bữa sáng',lifecycle:'todo',priority:'high',due:{kind:'timed',instantUtc:'2026-10-11T23:00:00Z',timezone:'Asia/Saigon'},scheduledStart:null,scheduledEnd:null,creatorId:'adult',assigneeId:'child',isShared:false,tagIds:['food','home'],blocked:false,blockedReason:null,pendingApproval:false,rewardPoints:5,revision:1,deletedAt:null};
const matches=(patch:Partial<TaskRecord>,filter:Partial<TaskFilter>)=>matchesFilter({...task,...patch},{rootsOnly:false,...filter},clock);
describe('P01 shared filters',()=>{
 it('OR within each dimension, AND between dimensions',()=>{
  expect(matches({}, {listIds:['other','list-1'],priority:['low','high'],assigneeIds:['child']})).toBe(true);
  expect(matches({}, {listIds:['other','list-1'],priority:['low']})).toBe(false);
  expect(matches({}, {sectionIds:['section-1'],lifecycle:['todo','in_progress']})).toBe(true);
 });
 it('tags support any/all without duplicating or editing tags',()=>{
  expect(matches({}, {tagIds:['missing','food'],tagMatch:'any'})).toBe(true);
  expect(matches({}, {tagIds:['missing','food'],tagMatch:'all'})).toBe(false);
  expect(matches({}, {tagIds:['food','home'],tagMatch:'all'})).toBe(true);
  expect(task.tagIds).toEqual(['food','home']);
 });
 it('omitted facets are unrestricted; supplied empty facet matches nothing',()=>{
  expect(matches({},{})).toBe(true);expect(matches({}, {listIds:[]})).toBe(false);expect(matches({}, {tagIds:[],tagMatch:'all'})).toBe(false);
 });
 it('root-only excludes subtasks and does not conflate no section/assignee',()=>{
  expect(matches({parentId:'parent'}, {rootsOnly:true})).toBe(false);
  expect(matches({sectionId:null}, {sectionIds:['section-1']})).toBe(false);
  expect(matches({assigneeId:null}, {assigneeIds:['child']})).toBe(false);
 });
 it.each(['completed','wont_do'] as const)('terminal %s is never overdue',lifecycle=>{
  expect(matches({lifecycle}, {overdue:true})).toBe(false);expect(matches({lifecycle}, {overdue:false})).toBe(true);
 });
 it('pending approval keeps the active task overdue without marking it completed',()=>expect(matches({pendingApproval:true}, {overdue:true})).toBe(true));
 it('none due is not overdue and is absent from a due range',()=>{
  expect(matches({due:{kind:'none'}}, {overdue:true})).toBe(false);
  expect(matches({due:{kind:'none'}}, {dueRange:{from:'2026-10-11T00:00:00Z',toExclusive:'2026-10-12T00:00:00Z'}})).toBe(false);
 });
 it('period_end_exclusive excludes the exact ending boundary',()=>{
  const dueRange={from:'2026-10-11T23:00:00Z',toExclusive:'2026-10-12T00:00:00Z'};
  expect(matches({}, {dueRange})).toBe(true);
  expect(matches({due:{kind:'timed',instantUtc:dueRange.toExclusive,timezone:clock.timezone}}, {dueRange})).toBe(false);
 });
 it('all-day ranges use local day start, not deadline expiry',()=>{
  expect(matches({due:{kind:'all_day',date:'2026-10-11',timezone:clock.timezone}}, {dueRange:{from:'2026-10-10T17:00:00Z',toExclusive:'2026-10-11T17:00:00Z'}})).toBe(true);
 });
 it('trash is excluded unless explicitly included',()=>{
  expect(matches({deletedAt:'2026-10-10T00:00:00Z'},{})).toBe(false);
  expect(matches({deletedAt:'2026-10-10T00:00:00Z'},{includeTrash:true})).toBe(true);
 });
 it('search includes normalized Vietnamese title/body; never reads a permission from visibility',()=>{
  expect(matches({}, {query:'MUA SUA'})).toBe(true);expect(matches({}, {query:'bua sang'})).toBe(true);
  expect(matches({}, {query:'secret'})).toBe(false);
 });
 it.each([
  {rootsOnly:'yes'}, {rootsOnly:false,priority:['urgent']}, {rootsOnly:false,tagMatch:'every'},
  {rootsOnly:false,dueRange:{from:'2026-10-12T00:00:00Z',toExclusive:'2026-10-11T00:00:00Z'}},
  {rootsOnly:false,includeTrash:'true'}, {rootsOnly:false,listIds:[7]},
 ])('rejects malformed filter %#',value=>expect(()=>assertTaskFilter(value)).toThrow());
});
it('explicit dueKinds distinguish Inbox/no-date from dated tasks and reject invalid choices',()=>{
 expect(matchesFilter({...task,due:{kind:'none'}},{rootsOnly:true,dueKinds:['none']} as any,clock)).toBe(true);
 expect(matchesFilter(task,{rootsOnly:true,dueKinds:['none']} as any,clock)).toBe(false);
 expect(()=>assertTaskFilter({rootsOnly:true,dueKinds:['invented']})).toThrow();
});
it('trashOnly matches deleted records without including live tasks',()=>{
 expect(matchesFilter({...task,deletedAt:'2026-10-10T00:00:00Z'},{rootsOnly:true,includeTrash:true,trashOnly:true} as any,clock)).toBe(true);
 expect(matchesFilter(task,{rootsOnly:true,includeTrash:true,trashOnly:true} as any,clock)).toBe(false);
});
it('completed window uses an explicit read reference and preserves all-time unknown timestamps',()=>{
 const completed={...task,lifecycle:'completed' as const,completedReferenceAt:'2026-10-11T00:00:00Z'};
 expect(matchesFilter(completed,{rootsOnly:true,lifecycle:['completed'],completedWindowDays:7} as any,clock)).toBe(true);
 expect(matchesFilter({...completed,completedReferenceAt:'2026-08-01T00:00:00Z'},{rootsOnly:true,completedWindowDays:30} as any,clock)).toBe(false);
 expect(matchesFilter({...completed,completedReferenceAt:null},{rootsOnly:true,completedWindowDays:'all'} as any,clock)).toBe(true);
});
