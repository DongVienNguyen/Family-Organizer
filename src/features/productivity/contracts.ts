import type {UserRole} from '../../types.js';
import type {AppWriteTx} from '../../../server/appStore.js';
import {assertDue,utcInstant} from './dates.js';
import {assertTaskFilter} from './filters.js';
import {object,keys,text,choice,integer,boolean,strings} from './validation.js';
export type Id = string;
export type Revision = number;
export type AppActor = {userId:Id;role:`${UserRole}`};
export type ProductivityWriteTx = AppWriteTx;
export type AppCommand = {actor:AppActor;requestId:Id;expectedRevision:Revision};
export type Lifecycle = 'todo'|'in_progress'|'completed'|'wont_do';
export type Priority = 'high'|'medium'|'low'|'none';
export type Due = {kind:'none'}|{kind:'all_day';date:string;timezone:string}|{kind:'timed';instantUtc:string;timezone:string};
export type QueryClock = {nowUtc:string;timezone:string};
export type TaskRecord = {id:Id;listId:Id;sectionId:Id|null;parentId:Id|null;title:string;body:string;lifecycle:Lifecycle;priority:Priority;due:Due;scheduledStart:string|null;scheduledEnd:string|null;creatorId:Id;assigneeId:Id|null;isShared:boolean;tagIds:Id[];blocked:boolean;blockedReason:string|null;pendingApproval:boolean;rewardPoints:number;revision:Revision;deletedAt:string|null;completedReferenceAt?:string|null};
export type TaskPatch = Partial<Pick<TaskRecord,'title'|'body'|'priority'|'due'|'scheduledStart'|'scheduledEnd'|'assigneeId'|'blocked'|'blockedReason'|'tagIds'>>;
export type TaskFilter = {query?:string;listIds?:Id[];sectionIds?:Id[];tagIds?:Id[];tagMatch?:'any'|'all';assigneeIds?:Id[];priority?:Priority[];lifecycle?:Lifecycle[];overdue?:boolean;rootsOnly:boolean;dueRange?:{from:string;toExclusive:string};includeTrash?:boolean;trashOnly?:boolean;dueKinds?:Due['kind'][];completedWindowDays?:7|30|90|'all'};
export type Page<T> = {items:T[];nextCursor:string|null;totalUnique:number};
export type TaskQueryRefinements=Pick<TaskFilter,'query'|'listIds'|'sectionIds'|'tagIds'|'tagMatch'|'assigneeIds'|'priority'>;
export type SmartTaskView='inbox'|'today'|'next7'|'assigned'|'overdue'|'completed'|'wont_do'|'trash';
export type TaskQueryInput={filter:TaskFilter;timezone:string}|{smart:SmartTaskView;completedWindowDays?:7|30|90|'all';refine?:TaskQueryRefinements;timezone:string}|{queryId:Id;cursor:string};
export type TaskQueryPage=Page<TaskRecord>&{queryId:Id;clock:QueryClock};
export type TaskSelection={id:Id;taskIds:Id[];totalUnique:number;expiresAt:string;clock:QueryClock};
export type Quadrant = 'q1'|'q2'|'q3'|'q4';
export type RuleNode = {op:'and'|'or';args:RuleNode[]}|{op:'not';arg:RuleNode}|{op:'test';field:'list'|'section'|'tag'|'assignee'|'priority'|'lifecycle'|'due';operator:'in'|'any'|'all'|'window';value:string[]|{fromDay:number;toDayExclusive:number}};
export type TaskSort = 'rank'|'due'|'priority'|'title';
export type TaskGroup = 'none'|'list'|'section'|'assignee'|'priority'|'due'|'tag';
export type ViewConfig =
 | {kind:'list';sort:TaskSort;group:TaskGroup}
 | {kind:'matrix';preset:'deadline_importance'|'priority_only'|'custom';horizonDays:number;rules:Record<Quadrant,RuleNode>|null;order:Quadrant[];showCompleted:boolean}
 | {kind:'kanban';mode:'sections'|'workflow';group:TaskGroup;sort:TaskSort;columns:Id[];boardId?:Id}
 | {kind:'calendar';range:{from:string;toExclusive:string};style:'month'|'week'|'agenda'}
 | {kind:'timeline';range:{from:string;toExclusive:string};style:'day'|'week'};
export type TaskView = {id:Id;ownerId:Id;revision:Revision;filter:TaskFilter;kind:ViewConfig['kind'];config:ViewConfig};
export function assertTaskRecord(value:unknown):asserts value is TaskRecord {
 const t=object(value);
 for(const field of ['id','listId','creatorId'])text(t[field],256);
 for(const field of ['sectionId','parentId','assigneeId'])if(t[field]!==null)text(t[field],256);
 text(t.title,500);text(t.body,100_000,false);
 choice(t.lifecycle,['todo','in_progress','completed','wont_do']);choice(t.priority,['high','medium','low','none']);assertDue(t.due);
 for(const field of ['isShared','blocked','pendingApproval'])boolean(t[field]);
 if(t.blockedReason!==null)text(t.blockedReason,500,false);
 strings(t.tagIds);integer(t.revision);integer(t.rewardPoints);
 for(const field of ['scheduledStart','scheduledEnd','deletedAt'])if(t[field]!==null){text(t[field],30);utcInstant(t[field] as string);}
 if((t.scheduledStart===null)!==(t.scheduledEnd===null))throw new Error('Incomplete scheduled interval');
 if(t.scheduledStart!==null&&utcInstant(t.scheduledStart as string)>=utcInstant(t.scheduledEnd as string))throw new Error('Invalid scheduled interval');
 if(t.completedReferenceAt!==undefined&&t.completedReferenceAt!==null)utcInstant(t.completedReferenceAt as string);
 if(t.pendingApproval&&(t.lifecycle==='completed'||t.lifecycle==='wont_do'))throw new Error('Terminal task cannot await approval');
}
const sorts=['rank','due','priority','title'] as const;
const groups=['none','list','section','assignee','priority','due'] as const;
function rule(value:unknown,depth:number,budget:{conditions:number}):void {
 if(depth>4)throw new Error('Matrix rule depth limit');
 const r=object(value);
 if(r.op==='and'||r.op==='or'){
  keys(r,['op','args']);if(!Array.isArray(r.args)||r.args.length<1||r.args.length>32)throw new Error('Invalid rule operands');
  for(const child of r.args)rule(child,depth+1,budget);return;
 }
 if(r.op==='not'){keys(r,['op','arg']);rule(r.arg,depth+1,budget);return;}
 keys(r,['op','field','operator','value']);choice(r.op,['test']);
 choice(r.field,['list','section','tag','assignee','priority','lifecycle','due']);
 if(++budget.conditions>32)throw new Error('Matrix condition limit');
 if(r.field==='due'){
  choice(r.operator,['window']);const window=object(r.value);keys(window,['fromDay','toDayExclusive']);integer(window.fromDay,-36600,36600);integer(window.toDayExclusive,-36600,36600);if(window.fromDay>=window.toDayExclusive)throw new Error('Invalid due window');
 } else {
  choice(r.operator,r.field==='tag'?['any','all']:['in']);strings(r.value);if(r.value.length===0)throw new Error('Empty rule values');
  if(r.field==='priority')for(const p of r.value)choice(p,['high','medium','low','none']);
  if(r.field==='lifecycle')for(const l of r.value)choice(l,['todo','in_progress','completed','wont_do']);
 }
}
export function assertTaskView(value:unknown,formatVersion=8):asserts value is TaskView {
 integer(formatVersion,1,9);const viewGroups=formatVersion===9?[...groups,'tag']as const:groups;
 const view=object(value);text(view.id,256);text(view.ownerId,256);integer(view.revision);assertTaskFilter(view.filter);
 const c=object(view.config);if(c.kind!==view.kind)throw new Error('View/config kind mismatch');
 switch(c.kind){
  case 'list':keys(c,['kind','sort','group']);choice(c.sort,sorts);choice(c.group,viewGroups);break;
  case 'kanban':keys(c,['kind','mode','group','sort','columns','boardId']);if(c.boardId!==undefined)text(c.boardId,256);choice(c.mode,['sections','workflow']);choice(c.group,viewGroups);choice(c.sort,sorts);strings(c.columns);break;
  case 'matrix':{
   keys(c,['kind','preset','horizonDays','rules','order','showCompleted']);choice(c.preset,['deadline_importance','priority_only','custom']);integer(c.horizonDays,0,366);boolean(c.showCompleted);strings(c.order);
   if(c.order.length!==4||new Set(c.order).size!==4||c.order.some(q=>!['q1','q2','q3','q4'].includes(q)))throw new Error('Invalid quadrant order');
   if(c.preset==='custom'){const rules=object(c.rules);keys(rules,['q1','q2','q3','q4']);const budget={conditions:0};for(const q of ['q1','q2','q3','q4'])rule(rules[q],1,budget);}
   else if(c.rules!==null)throw new Error('Preset cannot carry custom rules');break;
  }
  case 'calendar':case 'timeline':{
   keys(c,['kind','range','style']);choice(c.style,c.kind==='calendar'?['month','week','agenda']:['day','week']);const range=object(c.range);keys(range,['from','toExclusive']);text(range.from,30);text(range.toExclusive,30);if(utcInstant(range.from)>=utcInstant(range.toExclusive))throw new Error('Invalid view range');break;
  }
  default:throw new Error('Invalid view kind');
 }
}
