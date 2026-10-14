import {it,expect} from 'vitest';
import {assertTaskRecord,assertTaskView} from './contracts.js';
const task={id:'task',listId:'list',sectionId:null,parentId:null,title:'Task',body:'',lifecycle:'todo',priority:'none',due:{kind:'none'},scheduledStart:null,scheduledEnd:null,creatorId:'adult',assigneeId:null,isShared:false,tagIds:[],blocked:false,blockedReason:null,pendingApproval:false,rewardPoints:0,revision:1,deletedAt:null};
const view={id:'view',ownerId:'adult',revision:1,filter:{rootsOnly:true},kind:'list',config:{kind:'list',sort:'rank',group:'none'}};
it('accepts tagged task and view DTOs without changing legacy Task',()=>{expect(()=>assertTaskRecord(task)).not.toThrow();expect(()=>assertTaskView(view)).not.toThrow();});
it.each([{title:'x'.repeat(501)},{body:'x'.repeat(100001)},{revision:-1},{lifecycle:'overdue'},{lifecycle:'completed',pendingApproval:true},{scheduledStart:'2026-10-12T00:00:00Z',scheduledEnd:'2026-10-11T00:00:00Z'}])('rejects invalid task DTO %#',patch=>expect(()=>assertTaskRecord({...task,...patch})).toThrow());
it('rejects a view with config belonging to another kind',()=>expect(()=>assertTaskView({...view,config:{kind:'kanban',mode:'sections',sort:'rank',group:'none',columns:[]}})).toThrow());
it('rejects cross-kind fields even when config.kind agrees',()=>expect(()=>assertTaskView({...view,config:{...view.config,columns:['fake']}})).toThrow());
it('validates custom Matrix rule depth and count without evaluating code',()=>{
 const rule={op:'test',field:'priority',operator:'in',value:['high']};
 const matrix={...view,kind:'matrix',config:{kind:'matrix',preset:'custom',horizonDays:1,rules:{q1:rule,q2:rule,q3:rule,q4:rule},order:['q1','q2','q3','q4'],showCompleted:false}};
 expect(()=>assertTaskView(matrix)).not.toThrow();
 expect(()=>assertTaskView({...matrix,config:{...matrix.config,rules:{...matrix.config.rules,q1:{op:'test',field:'due',operator:'in',value:['2026-01-01']}}}})).toThrow();
 let deep:any=rule;for(let i=0;i<5;i++)deep={op:'not',arg:deep};
 expect(()=>assertTaskView({...matrix,config:{...matrix.config,rules:{...matrix.config.rules,q1:deep}}})).toThrow();
 expect(()=>assertTaskView({...matrix,config:{...matrix.config,rules:{...matrix.config.rules,q1:{op:'and',args:Array(33).fill(rule)}}}})).toThrow();
});
