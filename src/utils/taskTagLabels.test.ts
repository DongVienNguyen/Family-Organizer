import {it,expect} from 'vitest';
import {tagLabel,tagInput,resolveTagInput} from './taskTagLabels.js';
const tags=[{id:'synthetic-uuid',name:'Gia đình'},{id:'synthetic-work',name:'Công việc'}];
it('displays and searches visible named tags while retaining identity-based fallback',()=>{
 expect(tagLabel('synthetic-uuid',tags)).toBe('Gia đình');expect(tagLabel('legacy-freeform',tags)).toBe('legacy-freeform');expect(tagInput(['synthetic-uuid','synthetic-work'],tags)).toBe('Gia đình, Công việc');
});
it('editing a named tag resolves its existing ID instead of creating a label-shaped duplicate',()=>{
 expect(resolveTagInput('Gia đình',tags,['synthetic-uuid'],tagInput(['synthetic-uuid'],tags))).toEqual(['synthetic-uuid']);expect(resolveTagInput('Gia đình, Công việc',tags,['synthetic-uuid'],tagInput(['synthetic-uuid'],tags))).toEqual(['synthetic-uuid','synthetic-work']);
});
it('unchanged drafts preserve stable IDs after a catalog rename',()=>{
 const original=tagInput(['synthetic-uuid'],tags),renamed=[{id:'synthetic-uuid',name:'Gia đình đổi tên'}];expect(resolveTagInput(original,renamed,['synthetic-uuid'],original)).toEqual(['synthetic-uuid']);
});
it('ambiguous visible names refuse a new association while unchanged existing duplicate labels preserve IDs',()=>{
 const duplicate=[{id:'first',name:'Trùng tên'},{id:'second',name:'Trùng tên'}];expect(()=>resolveTagInput('Trùng tên',duplicate,[],'')).toThrow();expect(resolveTagInput('Trùng tên, Trùng tên',duplicate,['first','second'],'Trùng tên, Trùng tên')).toEqual(['first','second']);
});
it('removal and Adult legacy freeform preserve intended identities and do not consult hidden names',()=>{
 expect(resolveTagInput('Công việc',tags,['synthetic-uuid','synthetic-work'],'Gia đình, Công việc')).toEqual(['synthetic-work']);expect(resolveTagInput('New visible freeform',tags,[],'')).toEqual(['New visible freeform']);expect(resolveTagInput('',tags,['synthetic-uuid'],'Gia đình')).toEqual([]);
});
