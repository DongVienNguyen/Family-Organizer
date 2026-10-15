import type {DragEndEvent} from '@dnd-kit/react';
import type {MatrixPreviewInput} from '../../../server/productivity/matrix.js';
export function matrixDragIntent(event:Pick<DragEndEvent,'canceled'>&{operation:{source?:{id:unknown}|null;target?:{id:unknown}|null}},scope:{viewId:string;visibleIds:ReadonlySet<string>;mode:'attributes'|'view_pin'}):MatrixPreviewInput|null {
 const source=event.operation.source?.id,target=event.operation.target?.id;
 if(event.canceled!==false||typeof source!=='string'||!scope.visibleIds.has(source)||typeof target!=='string'||!/^matrix-q[1-4]$/.test(target))return null;
 return {viewId:scope.viewId,taskId:source,target:target.slice(7)as MatrixPreviewInput['target'],mode:scope.mode};
}
