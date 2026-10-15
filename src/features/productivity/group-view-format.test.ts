import {expect,it} from 'vitest';
import {assertTaskView} from './contracts.js';
const view=(kind:'list'|'kanban',group='tag')=>({id:'synthetic-tag-view',ownerId:'synthetic-owner',revision:1,kind,filter:{rootsOnly:true},config:{kind,sort:'rank',group,...(kind==='kanban'?{mode:'sections',columns:[]}: {})}});
it.each(['list','kanban']as const)('accepts explicit format9 %s tag grouping without widening the default contract',kind=>{expect(()=>assertTaskView(view(kind),9)).not.toThrow();expect(()=>assertTaskView(view(kind))).toThrow();});
it.each([5,6,7,8])('keeps stored format%s tag grouping invalid',version=>{for(const kind of ['list','kanban']as const)expect(()=>assertTaskView(view(kind),version)).toThrow();});
it.each(['none','priority','assignee','due','section','list'])('preserves historical group %s with both format8 and format9',group=>{expect(()=>assertTaskView(view('kanban',group),8)).not.toThrow();expect(()=>assertTaskView(view('kanban',group),9)).not.toThrow();});
it('format9 still refuses forged mixed-kind config fields and unknown group labels',()=>{expect(()=>assertTaskView(view('kanban','unknown'),9)).toThrow();const input=view('list')as any;input.config.mode='workflow';expect(()=>assertTaskView(input,9)).toThrow();});
