import {it,expect} from 'vitest';
import {createTaskDraft,editTaskDraft,changedTaskFields,newTaskDefaults} from './editor.js';
import {canonicalTaskFixture as syntheticTask} from '../../../tests/fixtures/canonicalTask.js';

it('new task forms do not silently turn no-date/no-priority into Today/Medium or a reward',()=>{
 const values=newTaskDefaults();expect(values.due).toEqual({kind:'none'});expect(values.priority).toBe('none');expect(values.assigneeId).toBeNull();expect(values.tagIds).toEqual([]);expect(Object.hasOwn(values,'rewardPoints')).toBe(false);
});
it('a title edit leaves due none, priority none and identity-based tags intact',()=>{
 const draft=editTaskDraft(createTaskDraft(syntheticTask),{title:'Changed title'});expect(draft.baseRevision).toBe(7);expect(draft.taskId).toBe(syntheticTask.id);expect(changedTaskFields(syntheticTask,draft)).toEqual({title:'Changed title'});
 expect(draft.values.due).toEqual({kind:'none'});expect(draft.values.priority).toBe('none');expect(draft.values.tagIds).toEqual(['synthetic-tag-id']);
});
it('drafts deep copy inputs so external mutations cannot change the pending payload',()=>{
 const task=structuredClone(syntheticTask),draft=createTaskDraft(task);task.tagIds.push('forged');expect(draft.values.tagIds).toEqual(['synthetic-tag-id']);
 const due={kind:'all_day' as const,date:'2028-02-29',timezone:'Asia/Saigon'},edited=editTaskDraft(draft,{due});due.date='2028-03-01';expect(edited.values.due).toEqual({kind:'all_day',date:'2028-02-29',timezone:'Asia/Saigon'});expect(draft.values.due).toEqual({kind:'none'});
});
it('server lifecycle/reward/approval fields cannot enter the editable patch',()=>{
 expect(()=>editTaskDraft(createTaskDraft(syntheticTask),{pendingApproval:false,rewardPoints:900} as any)).toThrow();expect(()=>editTaskDraft(createTaskDraft(syntheticTask),{lifecycle:'completed'} as any)).toThrow();
});
it('checklist/list projections can share one draft without resetting its revision or datetime',()=>{
 const original={...syntheticTask,due:{kind:'timed' as const,instantUtc:'2028-02-28T23:30:00Z',timezone:'Asia/Saigon'}};
 const draft=editTaskDraft(createTaskDraft(original),{body:'Pending description'});expect(changedTaskFields(original,draft)).toEqual({body:'Pending description'});expect(draft.values.due).toEqual(original.due);
});
it('unchanged due values are semantic even when JSON property order differs',()=>{
 const task={...syntheticTask,due:{kind:'all_day' as const,date:'2028-02-29',timezone:'Asia/Saigon'}};const draft=editTaskDraft(createTaskDraft(task),{due:{timezone:'Asia/Saigon',date:'2028-02-29',kind:'all_day'}});expect(changedTaskFields(task,draft)).toEqual({});
});
it('an incomplete title remains in the draft but cannot become a publishable patch',()=>{
 const draft=editTaskDraft(createTaskDraft(syntheticTask),{title:''});expect(draft.values.title).toBe('');expect(()=>changedTaskFields(syntheticTask,draft)).toThrow();expect(syntheticTask.title).toBe('Synthetic task');
});
