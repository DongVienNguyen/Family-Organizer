import type {DragEndEvent} from '@dnd-kit/react';
import type {MatrixPreviewInput} from '../../../server/productivity/matrix.js';
export function matrixDragIntent(event:Pick<DragEndEvent,'canceled'>&{operation:{source?:{id:unknown}|null;target?:{id:unknown}|null}},scope:{viewId:string;visibleIds:ReadonlySet<string>;mode:'attributes'|'view_pin'}):MatrixPreviewInput|null {
 const source=event.operation.source?.id,target=event.operation.target?.id;
 if(event.canceled!==false||typeof source!=='string'||!scope.visibleIds.has(source)||typeof target!=='string'||!/^matrix-q[1-4]$/.test(target))return null;
 return {viewId:scope.viewId,taskId:source,target:target.slice(7)as MatrixPreviewInput['target'],mode:scope.mode};
}

export interface KanbanSectionDragScope{viewId:string;boardId:string;viewRevision:number;boardRevision:number;tasks:ReadonlyMap<string,{revision:number;columnId:string}>;columns:ReadonlySet<string>}
/** Pointer/touch drops express the same readonly-preview intent as the menu.
 * Both endpoints must belong to the current visible board; same-lane drops and
 * stale/cancelled/foreign operations never become a command. */
export function kanbanSectionDragIntent(event:Pick<DragEndEvent,'canceled'>&{operation:{source?:{id:unknown;data?:unknown}|null;target?:{id:unknown;data?:unknown}|null}},scope:KanbanSectionDragScope):{viewId:string;taskId:string;targetColumnId:string;beforeTaskId:null}|null{
 const source=event.operation.source,target=event.operation.target;if(event.canceled!==false||typeof source?.id!=='string'||typeof target?.id!=='string')return null;const task=scope.tasks.get(source.id);if(!task)return null;
 const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null,s=record(source.data),t=record(target.data);
 if(!s||!t||s.kind!=='kanban-section-task'||t.kind!=='kanban-section-column'||s.viewId!==scope.viewId||s.boardId!==scope.boardId||s.viewRevision!==scope.viewRevision||s.boardRevision!==scope.boardRevision||s.taskRevision!==task.revision||t.viewId!==scope.viewId||t.boardId!==scope.boardId||t.viewRevision!==scope.viewRevision||t.boardRevision!==scope.boardRevision||typeof t.columnId!=='string'||target.id!=='kanban-section-column:'+t.columnId||!scope.columns.has(t.columnId)||task.columnId===t.columnId)return null;
 return {viewId:scope.viewId,taskId:source.id,targetColumnId:t.columnId,beforeTaskId:null};
}
