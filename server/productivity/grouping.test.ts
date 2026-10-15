import {expect,it} from 'vitest';
import type {TaskRecord,QueryClock} from '../../src/features/productivity/contracts.js';
import {canonicalTaskFixture as fixture} from '../../tests/fixtures/canonicalTask.js';
import {projectTaskGroups,groupMovePatch,uniqueGroupTaskIds} from './grouping.js';
const clock:QueryClock={nowUtc:'2026-10-15T03:00:00Z',timezone:'Asia/Saigon'};
const task=(id:string,patch:Partial<TaskRecord>={}):TaskRecord=>({...structuredClone(fixture),id,...patch});
it('uses distinct visual identities and canonical IDs without copying bodies for multi-tag tasks',()=>{
 const rows=[task('one',{tagIds:['tag-a','tag-b']}),task('two',{tagIds:[]})],before=structuredClone(rows);
 const result=projectTaskGroups(rows,'tag',clock);
 expect(result.totalUnique).toBe(2);expect(result.cards).toHaveLength(3);
 expect(result.cards.map(c=>[c.taskId,c.group])).toEqual([['one',{kind:'tag',value:'tag-a'}],['one',{kind:'tag',value:'tag-b'}],['two',{kind:'tag',value:null}]]);
 expect(new Set(result.cards.map(c=>c.projectionId)).size).toBe(3);
 expect(result.cards.every(c=>Object.keys(c).sort().join(',')==='group,projectionId,taskId')).toBe(true);expect(rows).toEqual(before);
 expect(projectTaskGroups(rows,'tag',clock)).toEqual(result);
});
it('deduplicates bulk projections in first-seen canonical order',()=>{
 const result=projectTaskGroups([task('one',{tagIds:['a','b']}),task('two')],'tag',clock);
 expect(uniqueGroupTaskIds([...result.cards,...result.cards].reverse())).toEqual(['two','one']);
});
it('deduplicates repeated tag labels and identical input rows without losing canonical totals',()=>{
 const row=task('one',{tagIds:['a','a','b']});const result=projectTaskGroups([row,structuredClone(row)],'tag',clock);
 expect(result.totalUnique).toBe(1);expect(result.cards).toHaveLength(2);
});
it('refuses conflicting facts for one canonical ID instead of silently selecting one projection',()=>expect(()=>projectTaskGroups([task('one'),task('one',{revision:8})],'priority',clock)).toThrow());
it('keeps all-day dates literal while timed deadlines use the view timezone',()=>{
 const rows=[task('all-day',{due:{kind:'all_day',date:'2026-10-15',timezone:'Pacific/Kiritimati'}}),task('timed',{due:{kind:'timed',instantUtc:'2026-10-14T18:00:00Z',timezone:'UTC'}}),task('none')];
 expect(projectTaskGroups(rows,'due',clock).cards.map(c=>c.group)).toEqual([{kind:'due',value:'2026-10-15'},{kind:'due',value:'2026-10-15'},{kind:'due',value:null}]);
 expect(projectTaskGroups(rows,'due',{...clock,timezone:'America/Los_Angeles'}).cards.map(c=>c.group)).toEqual([{kind:'due',value:'2026-10-15'},{kind:'due',value:'2026-10-14'},{kind:'due',value:null}]);
});
it.each(['priority','assignee']as const)('derives %s from canonical fields only',kind=>{
 const row=task('one',{priority:'high',assigneeId:'synthetic-member'});
 expect(projectTaskGroups([row],kind,clock).cards[0].group).toEqual({kind,value:kind==='priority'?'high':'synthetic-member'});
});
it('projection IDs frame tuple values rather than joining attacker-controlled delimiters',()=>{
 const a=projectTaskGroups([task('a:b',{tagIds:['c']})],'tag',clock).cards[0];
 const b=projectTaskGroups([task('a',{tagIds:['b:c']})],'tag',clock).cards[0];expect(a.projectionId).not.toBe(b.projectionId);
});
it('priority and assignee moves patch only the selected field',()=>{
 const row=task('one'),before=structuredClone(row);
 expect(groupMovePatch(row,{kind:'priority',value:'high'})).toEqual({priority:'high'});
 expect(groupMovePatch(row,{kind:'assignee',value:'synthetic-member'})).toEqual({assigneeId:'synthetic-member'});
 expect(groupMovePatch(row,{kind:'assignee',value:null})).toEqual({assigneeId:null});expect(row).toEqual(before);
});
it('due changes require an explicit validated deadline and never invent a timed instant',()=>{
 const row=task('one');const due={kind:'all_day',date:'2026-10-16',timezone:'Asia/Saigon'}as const;
 expect(groupMovePatch(row,{kind:'due',value:due})).toEqual({due});
 expect(groupMovePatch(row,{kind:'due',value:{kind:'none'}})).toEqual({due:{kind:'none'}});
 expect(()=>groupMovePatch(row,{kind:'due',value:'2026-10-16'}as never)).toThrow();
 expect(()=>groupMovePatch(row,{kind:'due',value:{kind:'all_day',date:'2026-02-30',timezone:'UTC'}})).toThrow();
});
it('tag A to B replaces only A and preserves all other tags without duplicates',()=>{
 const row=task('one',{tagIds:['a','keep','b']}),before=structuredClone(row);
 expect(groupMovePatch(row,{kind:'tag',source:'a',target:'b'})).toEqual({tagIds:['b','keep']});expect(row).toEqual(before);
 expect(groupMovePatch(row,{kind:'tag',source:'a',target:null})).toEqual({tagIds:['keep','b']});
});
it('an untagged projection can add a tag but a stale source tag refuses',()=>{
 expect(groupMovePatch(task('one',{tagIds:[]}),{kind:'tag',source:null,target:'b'})).toEqual({tagIds:['b']});
 expect(()=>groupMovePatch(task('one',{tagIds:['keep']}),{kind:'tag',source:'a',target:'b'})).toThrow();
 expect(()=>groupMovePatch(task('one',{tagIds:['keep']}),{kind:'tag',source:null,target:'b'})).toThrow();
});
it('All-tags requires an explicit add/replace choice and keeps the selected semantics',()=>{
 const row=task('one',{tagIds:['a','keep']});
 expect(()=>groupMovePatch(row,{kind:'tag',source:{all:true},target:'b'}as never)).toThrow();
 expect(groupMovePatch(row,{kind:'tag',source:{all:true},target:'b',choice:'add'})).toEqual({tagIds:['a','keep','b']});
 expect(groupMovePatch(row,{kind:'tag',source:{all:true},target:'b',choice:'replace'})).toEqual({tagIds:['b']});
});
it.each(['created','modified','overdue','workflow','section'])('rejects derived or unrelated group %s as a field mutation',kind=>expect(()=>groupMovePatch(task('one'),{kind,value:'forged'}as never)).toThrow());
it('refuses forged fields, unknown priorities, invalid clock and invalid task facts',()=>{
 expect(()=>groupMovePatch(task('one'),{kind:'priority',value:'urgent'}as never)).toThrow();
 expect(()=>groupMovePatch(task('one'),{kind:'priority',value:'high',lifecycle:'completed'}as never)).toThrow();
 expect(()=>projectTaskGroups([task('one')],'priority',{...clock,timezone:'invalid'})).toThrow();
 expect(()=>projectTaskGroups([task('one',{pendingApproval:true,lifecycle:'completed'})],'tag',clock)).toThrow();
});
it('caps canonical input and projected references without truncating or silently dropping cards',()=>{
 expect(()=>projectTaskGroups(Array.from({length:5001},(_,i)=>task('row-'+i)),'priority',clock)).toThrow();
 const tags=Array.from({length:1000},(_,i)=>'tag-'+i),rows=Array.from({length:21},(_,i)=>task('row-'+i,{tagIds:tags}));
 expect(()=>projectTaskGroups(rows,'tag',clock)).toThrow();
});

it('rejects tag moves that would exceed the canonical tag list bound',()=>{
 const row=task('one',{tagIds:Array.from({length:1000},(_,i)=>'tag-'+i)});
 expect(()=>groupMovePatch(row,{kind:'tag',source:{all:true},target:'extra',choice:'add'})).toThrow();
 expect(groupMovePatch(row,{kind:'tag',source:'tag-0',target:'extra'}).tagIds).toHaveLength(1000);
});

it('enforces an aggregate byte budget even when row and reference counts fit',()=>{
 const rows=Array.from({length:170},(_,i)=>task('row-'+i,{body:'x'.repeat(100000),tagIds:[]}));
 expect(()=>projectTaskGroups(rows,'priority',clock)).toThrow();
});
it('treats a literal all tag ID separately from the All-tags projection',()=>{
 expect(groupMovePatch(task('one',{tagIds:['all','keep']}),{kind:'tag',source:'all',target:'b'})).toEqual({tagIds:['b','keep']});
});
