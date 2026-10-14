import {it,expect} from 'vitest';
import {canonicalTaskFixture as task} from '../../../tests/fixtures/canonicalTask.js';
import {createTaskApi} from './api.js';
function fixture(body:unknown={task},status=200){const calls:{path:string;options:RequestInit}[]=[];const api=createTaskApi({authHeaders:()=>({Authorization:'Bearer synthetic-task-session'}),request:async(input,options)=>{calls.push({path:String(input),options:options??{}});return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}});return {api,calls};}
it('reads a canonical task through the internal session transport with no browser response cache',async()=>{
 const {api,calls}=fixture();expect(await api.task(task.id)).toEqual(task);expect(calls[0].path).toBe('/api/productivity/tasks/'+task.id);expect(calls[0].options.cache).toBe('no-store');expect(new Headers(calls[0].options.headers).get('Authorization')).toBe('Bearer synthetic-task-session');
});
it('preserves exact fields/revision and caller-owned request identity when saving a draft',async()=>{
 const {api,calls}=fixture({...task,task:{...task,title:'Edited title',revision:8}});await api.patch(task.id,7,{title:'Edited title'},'synthetic-retry-key');const call=calls[0];expect(call.options.method).toBe('PATCH');expect(new Headers(call.options.headers).get('x-request-id')).toBe('synthetic-retry-key');expect(JSON.parse(String(call.options.body))).toEqual({expectedRevision:7,patch:{title:'Edited title'}});
});
it('canonical creation carries none defaults and keeps the caller key for lost-response retries',async()=>{
 const {api,calls}=fixture({task:{...task,revision:1}}),input={listId:'legacy-family',title:'New synthetic task',priority:'none' as const,due:{kind:'none' as const}};await api.create(input,'synthetic-create-key');expect(calls[0].path).toBe('/api/productivity/tasks');expect(JSON.parse(String(calls[0].options.body))).toEqual({expectedRevision:0,input});expect(new Headers(calls[0].options.headers).get('x-request-id')).toBe('synthetic-create-key');
});
it('private/missing and conflict responses retain typed status without inventing data',async()=>{
 for(const status of [401,403,404,409]){const {api}=fixture({error:'Synthetic rejected command'},status);await expect(api.task(task.id)).rejects.toMatchObject({status});}
});
it('untrusted metadata cannot enter a task patch and malformed IDs/revisions/keys issue no request',async()=>{
 const {api,calls}=fixture();await expect(api.patch(task.id,7,{creatorId:'forged',rewardPoints:100} as any,'synthetic-key')).rejects.toThrow();await expect(api.patch(task.id,-1,{title:'x'},'synthetic-key')).rejects.toThrow();await expect(api.task('')).rejects.toThrow();await expect(api.patch(task.id,7,{title:'x'},'invalid key')).rejects.toThrow();expect(calls).toEqual([]);
});
it('invalid task payloads and duplicate list IDs cannot become client cache records',async()=>{
 await expect(fixture({task:{...task,due:{kind:'none'},revision:-1}}).api.task(task.id)).rejects.toThrow();await expect(fixture({tasks:[task,task],totalUnique:2}).api.tasks()).rejects.toThrow();expect(await fixture({tasks:[task],totalUnique:1}).api.tasks()).toEqual([task]);
});
it('checklist commands use the shared task revision and preserve checklist identities',async()=>{
 const checklist={taskId:task.id,revision:8,items:[{id:'synthetic-check',text:'Keep item',done:true}],progress:100},{api,calls}=fixture({checklist});expect(await api.checklist(task.id)).toEqual(checklist);await api.setChecklist(task.id,7,[{id:'synthetic-check',text:'Keep item',done:true}],'synthetic-check-key');expect(calls[1].path).toBe('/api/productivity/tasks/'+task.id+'/checklist');expect(JSON.parse(String(calls[1].options.body))).toEqual({expectedRevision:7,input:[{id:'synthetic-check',text:'Keep item',done:true}]});
});
