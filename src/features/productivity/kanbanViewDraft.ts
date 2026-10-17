import type {SavedTaskView,SaveViewInput} from '../../../server/productivity/views.js';
import {assertTaskView} from './contracts.js';
import {choice,integer,keys,object,text} from './validation.js';
export interface KanbanViewDraft {base:SavedTaskView;input:SaveViewInput}
function fail():never{throw Error('Inconsistent Kanban view draft');}
const same=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const x=Object.keys(a),y=Object.keys(b);return x.length===y.length&&x.every(k=>Object.hasOwn(b,k)&&same((a as any)[k],(b as any)[k]));
};
const editableFilters=['query','priority','lifecycle']as const;
function assertBase(view:SavedTaskView){assertTaskView(view,view.formatVersion===9?9:8);text(view.title,500);integer(view.revision,1);if(view.kind!=='kanban'||view.config.kind!=='kanban'||!view.config.boardId)fail();if(view.formatVersion!==undefined&&view.formatVersion!==9)fail();choice(view.config.group,['none','priority','assignee','due','tag']);}
export function createKanbanViewDraft(view:SavedTaskView):KanbanViewDraft{
 assertBase(view);const {id,title,filter,kind,config,formatVersion}=view;return {base:structuredClone(view),input:structuredClone({id,title,filter,kind,config,...(formatVersion===9?{formatVersion}: {})})};
}
export function assertKanbanViewDraft(draft:KanbanViewDraft):void{
 keys(object(draft),['base','input']);assertBase(draft.base);const {base,input}=draft;keys(object(input),['id','title','filter','kind','config','formatVersion']);text(input.title,500);
 assertTaskView({id:input.id,ownerId:base.ownerId,revision:base.revision,filter:input.filter,kind:input.kind,config:input.config},input.formatVersion===9?9:8);
 if(input.id!==base.id||input.kind!=='kanban'||input.config.kind!=='kanban'||base.config.kind!=='kanban'||input.formatVersion!==base.formatVersion)fail();
 if(!same({...input.config,group:base.config.group,sort:base.config.sort},base.config))fail();choice(input.config.group,['none','priority','assignee','due','tag']);
 const fixed=(filter:typeof input.filter)=>Object.fromEntries(Object.entries(filter).filter(([k])=>!editableFilters.includes(k as any)));if(!same(fixed(input.filter),fixed(base.filter)))fail();
}
export function kanbanViewInput(draft:KanbanViewDraft):SaveViewInput{assertKanbanViewDraft(draft);return structuredClone(draft.input);}
/** Explicit three-way rebase: retain changed user fields; preserve unrelated
 * remote changes. Board/mode/owner identity can never be silently retargeted. */
export function rebaseKanbanViewDraft(draft:KanbanViewDraft,latest:SavedTaskView):KanbanViewDraft{
 assertKanbanViewDraft(draft);assertBase(latest);const {base,input}=draft;if(latest.id!==base.id||latest.ownerId!==base.ownerId||latest.config.kind!=='kanban'||base.config.kind!=='kanban'||input.config.kind!=='kanban'||latest.config.boardId!==base.config.boardId||latest.config.mode!==base.config.mode||latest.revision<base.revision)fail();
 const next=createKanbanViewDraft(latest);if(input.title!==base.title)next.input.title=input.title;
 if(next.input.config.kind!=='kanban')fail();for(const field of ['group','sort']as const)if(input.config[field]!==base.config[field])(next.input.config[field]as string)=input.config[field];
 for(const field of editableFilters)if(!same(input.filter[field],base.filter[field])){if(Object.hasOwn(input.filter,field))(next.input.filter as any)[field]=structuredClone(input.filter[field]);else delete next.input.filter[field];}
 assertKanbanViewDraft(next);return next;
}
export async function saveKanbanViewDraft(api:{saveView(input:SaveViewInput,revision:number,key:string):Promise<SavedTaskView>},draft:KanbanViewDraft,key:string):Promise<SavedTaskView>{
 const input=kanbanViewInput(draft),result=await api.saveView(input,draft.base.revision,key);assertBase(result);
 if(result.id!==draft.base.id||result.ownerId!==draft.base.ownerId||result.revision!==draft.base.revision+1||result.title!==input.title||!same(result.filter,input.filter)||!same(result.config,input.config))fail();return result;
}
