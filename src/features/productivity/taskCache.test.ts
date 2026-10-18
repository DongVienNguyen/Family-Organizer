import {it,expect} from 'vitest';
import {canonicalTaskFixture as task} from '../../../tests/fixtures/canonicalTask.js';
import {createTaskCache} from './taskCache.js';
import type {TaskRecord} from './contracts.js';
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
it('one task ID shares its dirty editor across list and checklist projections without clone or reset',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{title:'Pending title'});cache.open(task.id);expect(cache.draft(task.id)?.values.title).toBe('Pending title');expect(cache.draft(task.id)?.baseRevision).toBe(7);expect(cache.record(task.id)?.title).toBe(task.title);
});
it('SSE invalidation hides old private records until reauthorization without replacing a dirty draft',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{body:'Pending description'});cache.invalidate(task.id);expect(cache.record(task.id)).toBeUndefined();await cache.load(task.id,async()=>({...task,title:'Remote title',revision:8}));expect(cache.record(task.id)?.title).toBe('Remote title');expect(cache.draft(task.id)?.values.body).toBe('Pending description');expect(cache.draft(task.id)?.baseRevision).toBe(7);
});
it('409 preserves the exact draft and original expected revision rather than overwriting a newer task',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{body:'Pending description'});await cache.load(task.id,async()=>({...task,title:'Remote title',revision:8}));let payload:unknown;
 await expect(cache.save(task.id,async(id,revision,patch)=>{payload={id,revision,patch};throw Object.assign(Error('Conflict'),{status:409});})).rejects.toMatchObject({status:409});expect(payload).toEqual({id:task.id,revision:7,patch:{body:'Pending description'}});expect(cache.draft(task.id)?.values.body).toBe('Pending description');expect(cache.record(task.id)?.title).toBe('Remote title');
});
it('a missing/private response removes both the cached record and draft',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{body:'Private draft'});await expect(cache.load(task.id,async()=>{throw Object.assign(Error('Not found'),{status:404});})).rejects.toMatchObject({status:404});expect(cache.record(task.id)).toBeUndefined();expect(cache.draft(task.id)).toBeUndefined();
});
it('logout disposes all private state and ignores late responses from the previous session',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);const pending=deferred<TaskRecord>(),load=cache.load(task.id,()=>pending.promise);cache.dispose();pending.resolve({...task,title:'Previous user private text'});await load;expect(cache.record(task.id)).toBeUndefined();expect(cache.draft(task.id)).toBeUndefined();expect(()=>cache.open(task.id)).toThrow();
});
it('request sequencing rejects an older late response even when its revision is greater',async()=>{
 const cache=createTaskCache(),first=deferred<TaskRecord>(),old=cache.load(task.id,()=>first.promise);await cache.load(task.id,async()=>({...task,title:'Newest request',revision:8}));first.resolve({...task,title:'Old private response',revision:9});await old;expect(cache.record(task.id)?.title).toBe('Newest request');
});
it('save uses server result, blocks simultaneous edits/saves, and clears only the accepted draft',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{title:'Saved title'});const pending=deferred<TaskRecord>(),save=cache.save(task.id,()=>pending.promise);expect(()=>cache.edit(task.id,{title:'Concurrent'})).toThrow();await expect(cache.save(task.id,async()=>task)).rejects.toThrow();pending.resolve({...task,title:'Saved title',revision:8});await save;expect(cache.record(task.id)?.revision).toBe(8);expect(cache.draft(task.id)).toBeUndefined();
});
it('an unchanged draft sends no command, explicit discard is separate from closing a projection',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);let commands=0;await cache.save(task.id,async()=>{commands++;return task;});expect(commands).toBe(0);cache.open(task.id);cache.edit(task.id,{title:'Temporary'});cache.discard(task.id);expect(cache.draft(task.id)).toBeUndefined();expect(cache.record(task.id)?.title).toBe(task.title);
});
it('cache getters deep copy state and subscribe snapshots remain stable between changes',async()=>{
 const cache=createTaskCache();let notifications=0;const off=cache.subscribe(()=>notifications++);await cache.load(task.id,async()=>task);cache.open(task.id);cache.draft(task.id)!.values.tagIds!.push('external mutation');cache.record(task.id)!.tagIds.push('external mutation');expect(cache.record(task.id)?.tagIds).toEqual(task.tagIds);expect(cache.draft(task.id)?.values.tagIds).toEqual(task.tagIds);expect(cache.snapshot()).toBe(cache.snapshot());expect(notifications).toBeGreaterThan(0);off();
});
it('mismatched response IDs and stale revisions cannot replace the requested task',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);await expect(cache.load(task.id,async()=>({...task,id:'forged-other-task'}))).rejects.toThrow();expect(cache.record(task.id)).toBeUndefined();await cache.load(task.id,async()=>({...task,revision:8}));await expect(cache.load(task.id,async()=>({...task,revision:7}))).rejects.toThrow();expect(cache.record(task.id)).toBeUndefined();
});
it('a lost save response retries the same idempotency key and payload without a second command identity',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{title:'Retry title'});const calls:any[][]=[];
 const saver=async(...args:any[])=>{calls.push(args);if(calls.length===1)throw Error('Synthetic lost response');return {...task,title:'Retry title',revision:8};};
 await expect(cache.save(task.id,saver)).rejects.toThrow('Synthetic lost response');await cache.save(task.id,saver);expect(calls[0][3]).toMatch(/^[a-f0-9-]{36}$/);expect(calls[1]).toEqual(calls[0]);expect(cache.record(task.id)?.revision).toBe(8);
});
it('temporary invalid form values survive editing while save validation prevents every network write',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{title:''});let commands=0;await expect(cache.save(task.id,async()=>{commands++;return task;})).rejects.toThrow();expect(commands).toBe(0);expect(cache.draft(task.id)?.values.title).toBe('');cache.edit(task.id,{title:'Corrected title'});await cache.save(task.id,async()=>{commands++;return {...task,title:'Corrected title',revision:8};});expect(commands).toBe(1);expect(cache.record(task.id)?.title).toBe('Corrected title');
});
it('an authoritative full visible list purges omitted private drafts and retains authorized dirty drafts',async()=>{
 const cache=createTaskCache(),other={...task,id:'synthetic-private-other',title:'Synthetic private other'};await cache.load(task.id,async()=>task);await cache.load(other.id,async()=>other);cache.open(task.id);cache.edit(task.id,{title:'Keep own draft'});cache.open(other.id);cache.edit(other.id,{body:'Revoked private draft'});
 cache.replaceVisible([task]);expect(cache.record(other.id)).toBeUndefined();expect(cache.draft(other.id)).toBeUndefined();expect(cache.draft(task.id)?.values.title).toBe('Keep own draft');
});
it('full-list replacement rejects duplicates before mutating state and does not replace a newer accepted revision',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>({...task,revision:8,title:'Newer accepted task'}));expect(()=>cache.replaceVisible([task,task])).toThrow();expect(cache.record(task.id)?.title).toBe('Newer accepted task');cache.replaceVisible([task]);expect(cache.record(task.id)?.revision).toBe(8);
});
it('effect cleanup clears private state immediately and old loads cannot cross a fresh lifecycle generation',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);const pending=deferred<TaskRecord>(),old=cache.load(task.id,()=>pending.promise);cache.clear();expect(cache.record(task.id)).toBeUndefined();expect(cache.draft(task.id)).toBeUndefined();await cache.load(task.id,async()=>({...task,title:'Fresh lifecycle',revision:8}));pending.resolve({...task,title:'Old lifecycle private text',revision:9});await old;expect(cache.record(task.id)?.title).toBe('Fresh lifecycle');
});
it('a cleared lifecycle ignores old save completions and preserves the new lifecycle draft',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{title:'Old pending save'});const pending=deferred<TaskRecord>(),old=cache.save(task.id,()=>pending.promise);cache.clear();await cache.load(task.id,async()=>({...task,title:'Fresh task',revision:9}));cache.open(task.id);cache.edit(task.id,{title:'Fresh draft'});pending.resolve({...task,title:'Old pending save',revision:8});await old;expect(cache.record(task.id)?.title).toBe('Fresh task');expect(cache.draft(task.id)?.values.title).toBe('Fresh draft');cache.dispose();expect(()=>cache.clear()).toThrow();
});
it('raw tag entry and captured labels stay with the draft across view close/refresh',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.tagEditor(task.id,'Original label');cache.editTagText(task.id,'Original label, ambiguous draft');await cache.load(task.id,async()=>({...task,revision:8}));cache.open(task.id);expect(cache.draft(task.id)?.tagEditor).toEqual({originalText:'Original label',text:'Original label, ambiguous draft'});cache.clear();expect(cache.draft(task.id)).toBeUndefined();
});
it('an invalidated board entry refuses opening without throwing or exposing the prior record',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.invalidate(task.id);expect(cache.open(task.id)).toBe(false);expect(cache.record(task.id)).toBeUndefined();await cache.load(task.id,async()=>task);expect(cache.open(task.id)).toBe(true);
});
it('explicit reload reads and authorizes the current revision before discarding a conflict draft',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.edit(task.id,{title:'Unsent conflict'});let reads=0;await cache.reload(task.id,async()=>{reads++;return {...task,title:'Actual remote',revision:8};});expect(reads).toBe(1);expect(cache.draft(task.id)?.baseRevision).toBe(8);expect(cache.draft(task.id)?.values.title).toBe('Actual remote');
});
it('unsent drawer inputs survive projection/save/refresh but are hidden and purged on revoked access or logout',async()=>{
 const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.editInputs(task.id,{comment:'Private unsent comment',newCheck:'Unsent checklist',subtaskTitle:'Unsent subtask'});cache.discard(task.id);cache.open(task.id);cache.invalidate(task.id);expect(cache.inputs(task.id)).toBeUndefined();cache.replaceVisible([task]);expect(cache.inputs(task.id)).toEqual({comment:'Private unsent comment',newCheck:'Unsent checklist',subtaskTitle:'Unsent subtask'});cache.replaceVisible([]);await cache.load(task.id,async()=>task);expect(cache.inputs(task.id)).toEqual({comment:'',newCheck:'',subtaskTitle:''});cache.editInputs(task.id,{comment:'New private comment'});cache.clear();await cache.load(task.id,async()=>task);expect(cache.inputs(task.id)?.comment).toBe('');
});
it('keeps a recurrence editor draft across close and SSE while clearing it on privacy removal and session clear',async()=>{const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);const recurrence=JSON.stringify({seriesId:'synthetic-private-series',revision:2,missed:'latest',rotationMembers:['synthetic-private-member']});cache.editInputs(task.id,{recurrence});cache.discard(task.id);cache.open(task.id);cache.invalidate(task.id);expect(cache.inputs(task.id)).toBeUndefined();cache.replaceVisible([{...task,revision:task.revision+1}]);expect(cache.inputs(task.id)?.recurrence).toBe(recurrence);cache.replaceVisible([]);await cache.load(task.id,async()=>task);expect(cache.inputs(task.id)?.recurrence).toBeUndefined();cache.editInputs(task.id,{recurrence});cache.clear();await cache.load(task.id,async()=>task);expect(cache.inputs(task.id)?.recurrence).toBeUndefined();});
it('retains recurrence panel expansion through an authorized refresh and clears it with privacy or session state',async()=>{const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.editInputs(task.id,{recurrenceOpen:'open'});cache.invalidate(task.id);cache.replaceVisible([{...task,revision:task.revision+1}]);expect(cache.inputs(task.id)?.recurrenceOpen).toBe('open');cache.discard(task.id);cache.open(task.id);expect(cache.inputs(task.id)?.recurrenceOpen).toBe('open');cache.replaceVisible([]);await cache.load(task.id,async()=>task);expect(cache.inputs(task.id)?.recurrenceOpen).toBeUndefined();cache.editInputs(task.id,{recurrenceOpen:'open'});cache.clear();await cache.load(task.id,async()=>task);expect(cache.inputs(task.id)?.recurrenceOpen).toBeUndefined();});
it('comment acknowledgement clears only its composer even when an SSE temporarily hides the task',async()=>{const cache=createTaskCache();await cache.load(task.id,async()=>task);cache.open(task.id);cache.editInputs(task.id,{comment:'Synthetic committed text',mentionUserIds:['synthetic-member'],newCheck:'Unsent checklist'});cache.invalidate(task.id);cache.acknowledgeComment(task.id);expect(cache.inputs(task.id)).toBeUndefined();cache.replaceVisible([{...task,revision:8}]);expect(cache.inputs(task.id)).toMatchObject({comment:'',mentionUserIds:[],newCheck:'Unsent checklist'});expect(cache.draft(task.id)).toBeUndefined();});
