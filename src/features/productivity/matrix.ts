import type {ViewConfig,TaskRecord,QueryClock,Quadrant,TaskPatch,RuleNode} from './contracts.js';
import {assertTaskRecord,assertTaskView} from './contracts.js';
import {calendarDate,dueInstant,localDateAt,localDayStart,timezoneFormatter,utcInstant} from './dates.js';
import {choice} from './validation.js';
export type MatrixConfig=Extract<ViewConfig,{kind:'matrix'}>;
export interface MatrixProjection {quadrants:Record<Quadrant,TaskRecord[]>;unmatched:TaskRecord[];matches:Record<string,Quadrant[]>;totalUnique:number}
export interface MatrixMoveProposal {target:Quadrant;mode:'attributes'|'view_pin';patch:TaskPatch;needsChoice:boolean;warnings:string[]}
const day=86400000,quadrants:Quadrant[]=['q1','q2','q3','q4'];
function context(config:MatrixConfig,clock:QueryClock){
 assertTaskView({id:'pure-matrix',ownerId:'already-authorized',revision:0,filter:{rootsOnly:false},kind:'matrix',config});
 timezoneFormatter(clock.timezone);const today=localDateAt(utcInstant(clock.nowUtc),clock.timezone),base=calendarDate(today);
 const date=(offset:number)=>new Date(base+offset*day).toISOString().slice(0,10);
 const rules=config.preset==='custom'?Object.fromEntries(config.order.map(q=>[q,compileRule(config.rules![q],clock,date)])) as Record<Quadrant,(task:TaskRecord)=>boolean>:null;
 return {today,date,boundary:localDayStart(date(config.horizonDays+1),clock.timezone),rules};
}
type DeadlineImportanceFact=Pick<TaskRecord,'priority'|'due'|'lifecycle'>;
const important=(task:DeadlineImportanceFact)=>task.priority==='high'||task.priority==='medium';
function urgent(task:DeadlineImportanceFact,boundary:number):boolean {const instant=dueInstant(task.due);return task.lifecycle!=='completed'&&task.lifecycle!=='wont_do'&&instant!==null&&instant<boundary;}
function deadlineImportanceQuadrant(task:DeadlineImportanceFact,boundary:number):Quadrant {return important(task)?urgent(task,boundary)?'q1':'q2':urgent(task,boundary)?'q3':'q4';}
/** Share the default planning policy without fabricating a full TaskRecord or
 * resolving its relative clock/horizon separately for every row. */
export function deadlineImportanceClassifier(clock:QueryClock,horizonDays=1):(task:DeadlineImportanceFact)=>Quadrant {const ctx=context({kind:'matrix',preset:'deadline_importance',horizonDays,rules:null,order:['q1','q2','q3','q4'],showCompleted:false},clock);return task=>{choice(task.priority,['high','medium','low','none']);choice(task.lifecycle,['todo','in_progress','completed','wont_do']);return deadlineImportanceQuadrant(task,ctx.boundary);};}
/** Resolve relative windows once per projection, before visiting any task. */
function compileRule(node:RuleNode,clock:QueryClock,date:(offset:number)=>string):(task:TaskRecord)=>boolean {
 if(node.op==='and'||node.op==='or'){const children=node.args.map(arg=>compileRule(arg,clock,date));return node.op==='and'?task=>children.every(test=>test(task)):task=>children.some(test=>test(task));}
 if(node.op==='not'){const child=compileRule(node.arg,clock,date);return task=>!child(task);}
 if(node.op!=='test')throw Error('Invalid Matrix rule');
 if(node.field==='due'){
  const window=node.value as {fromDay:number;toDayExclusive:number},from=localDayStart(date(window.fromDay),clock.timezone),to=localDayStart(date(window.toDayExclusive),clock.timezone);
  return task=>{const instant=dueInstant(task.due);return instant!==null&&instant>=from&&instant<to;};
 }
 const values=node.value as string[];
 if(node.field==='tag')return node.operator==='all'?task=>values.every(id=>task.tagIds.includes(id)):task=>values.some(id=>task.tagIds.includes(id));
 const field=node.field;
 return task=>{const value={list:task.listId,section:task.sectionId,assignee:task.assigneeId,priority:task.priority,lifecycle:task.lifecycle}[field];return value!==null&&values.includes(value);};
}
function matches(task:TaskRecord,config:MatrixConfig,clock:QueryClock,ctx:ReturnType<typeof context>):Quadrant[]{
 if(config.preset==='custom')return config.order.filter(q=>ctx.rules![q](task));
 if(config.preset==='priority_only')return [{high:'q1',medium:'q2',low:'q3',none:'q4'}[task.priority]as Quadrant];
 return [deadlineImportanceQuadrant(task,ctx.boundary)];
}
/** Pure projection of already-authorized, already-filtered rows. This grants no ACL.
 * A server adapter must query fresh authorized rows before calling this function.
 */
export function classifyMatrix(tasks:readonly TaskRecord[],config:MatrixConfig,clock:QueryClock):MatrixProjection {
 const ctx=context(config,clock),result:MatrixProjection={quadrants:{q1:[],q2:[],q3:[],q4:[]},unmatched:[],matches:Object.create(null),totalUnique:0},ids=new Set<string>();
 for(const task of tasks){
  assertTaskRecord(task);if(ids.has(task.id))throw Error('Duplicate Matrix task ID');ids.add(task.id);
  if(task.deletedAt||task.lifecycle==='wont_do'||task.lifecycle==='completed'&&!config.showCompleted)continue;
  const all=matches(task,config,clock,ctx),row=structuredClone(task);result.matches[task.id]=all;
  if(all.length)result.quadrants[all[0]].push(row);else result.unmatched.push(row);result.totalUnique++;
 }
 return result;
}
/** Untrusted, non-executable proposal. P06-b must issue its own5min preview,
 * recheck task/view revision, day and ACL, and require explicit date confirmation.
 */
export function proposeMatrixMove(task:TaskRecord,config:MatrixConfig,clock:QueryClock,target:Quadrant,mode:'attributes'|'view_pin'):MatrixMoveProposal {
 const ctx=context(config,clock);assertTaskRecord(task);choice(target,quadrants);choice(mode,['attributes','view_pin']);
 if(task.deletedAt||task.lifecycle==='completed'||task.lifecycle==='wont_do')throw Error('Cannot move a terminal or deleted task');
 const proposal:MatrixMoveProposal={target,mode,patch:{},needsChoice:false,warnings:[]};
 if(mode==='view_pin')return proposal;
 if(config.preset==='custom')return {...proposal,needsChoice:true,warnings:['custom-rule-choice']};
 if(config.preset==='priority_only'){
  const priority=({q1:'high',q2:'medium',q3:'low',q4:'none'}as const)[target];if(priority!==task.priority)proposal.patch.priority=priority;
 }else{
  const wantImportant=target==='q1'||target==='q2',wantUrgent=target==='q1'||target==='q3';
  if(important(task)!==wantImportant)proposal.patch.priority=wantImportant?'medium':'low';
  if(urgent(task,ctx.boundary)!==wantUrgent){proposal.patch.due={kind:'all_day',date:wantUrgent?ctx.today:ctx.date(config.horizonDays+1),timezone:clock.timezone};proposal.needsChoice=true;proposal.warnings.push('deadline-change');}
 }
 const projected=matches({...task,...proposal.patch},config,clock,ctx);if(projected[0]!==target)throw Error('Proposed attributes do not reach the requested quadrant');
 return proposal;
}
