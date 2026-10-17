import type {DragEndEvent} from '@dnd-kit/react';
import type {KanbanGroupSource,KanbanGroupTarget} from './kanbanGroupMenu.js';
type DragEvent=Pick<DragEndEvent,'canceled'>&{operation:{source?:{id:unknown;data?:unknown}|null;target?:{id:unknown;data?:unknown}|null}};
interface Scope {viewId:string;boardId:string;viewRevision:number;boardRevision:number}
export interface KanbanWorkflowDragScope extends Scope {tasks:ReadonlyMap<string,{revision:number;columnId:string;eligible:boolean}>;columns:ReadonlyMap<string,string>}
export interface KanbanGroupedDragScope extends Scope {group:string;cards:ReadonlyMap<string,{taskId:string;revision:number;group:KanbanGroupSource}>;columns:ReadonlyMap<string,KanbanGroupSource>}

const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
function endpoints(event:DragEvent,scope:Scope,sourceKind:string,targetKind:string){
 const source=event.operation.source,target=event.operation.target;if(event.canceled!==false||typeof source?.id!=='string'||typeof target?.id!=='string')return null;const s=record(source.data),t=record(target.data),bound=(v:Record<string,unknown>)=>v.viewId===scope.viewId&&v.boardId===scope.boardId&&v.viewRevision===scope.viewRevision&&v.boardRevision===scope.boardRevision;
 return s&&t&&s.kind===sourceKind&&t.kind===targetKind&&bound(s)&&bound(t)&&typeof t.columnId==='string'&&target.id===targetKind+':'+t.columnId?{source,target,s,t,columnId:t.columnId}:null;
}
/** Readonly form intents; cross-column lifecycle still belongs to P10. */
export function kanbanWorkflowDragIntent(event:DragEvent,scope:KanbanWorkflowDragScope):{kind:'active'|'completion';taskId:string;targetColumnId:string}|null{
 const e=endpoints(event,scope,'kanban-workflow-task','kanban-workflow-column');if(!e)return null;const task=scope.tasks.get(e.source.id as string),key=scope.columns.get(e.columnId);
 if(!task||!task.eligible||e.s.taskRevision!==task.revision||task.columnId===e.columnId||!key||!['todo','doing','waiting','done'].includes(key))return null;
 return {kind:key==='done'?'completion':'active',taskId:e.source.id as string,targetColumnId:e.columnId};
}
/** Visual projection identity selects one tag source; no all-tags replacement is
 * inferred and neither an order change nor a Task patch is applied here. */
export function kanbanGroupedDragIntent(event:DragEvent,scope:KanbanGroupedDragScope):{taskId:string;source:KanbanGroupSource;target:KanbanGroupTarget}|null{
 if(!['priority','assignee','due','tag'].includes(scope.group))return null;const e=endpoints(event,scope,'kanban-group-task','kanban-group-column');if(!e||typeof e.s.projectionId!=='string'||e.source.id!=='kanban-group-card:'+e.s.projectionId)return null;
 const card=scope.cards.get(e.s.projectionId),target=scope.columns.get(e.columnId);if(!card||e.s.taskId!==card.taskId||e.s.taskRevision!==card.revision||!target||card.group.kind!==scope.group||target.kind!==scope.group||target.value===card.group.value)return null;
 return {taskId:card.taskId,source:structuredClone(card.group),target:{value:target.value}};
}
