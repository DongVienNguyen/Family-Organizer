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
