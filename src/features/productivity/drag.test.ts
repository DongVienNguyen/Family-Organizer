import {it,expect} from 'vitest';
import {matrixDragIntent} from './drag.js';
const event=(source:unknown='synthetic-task',target:unknown='matrix-q2',canceled=false)=>({canceled,operation:{source:source===null?null:{id:source},target:target===null?null:{id:target}}});
const scope={viewId:'synthetic-view',visibleIds:new Set(['synthetic-task','__proto__']),mode:'attributes' as const};
it('current DragDropProvider event becomes the same canonical intent as a keyboard move menu',()=>{expect(matrixDragIntent(event(),scope)).toEqual({viewId:scope.viewId,taskId:'synthetic-task',target:'q2',mode:'attributes'});expect(matrixDragIntent(event('__proto__','matrix-q4'),{...scope,mode:'view_pin'})).toEqual({viewId:scope.viewId,taskId:'__proto__',target:'q4',mode:'view_pin'});});
it.each([event(undefined as any,null),event(null),event('hidden-task'),event('synthetic-task','foreign-target'),event('synthetic-task','matrix-q5'),event('synthetic-task','matrix-q2',true),event(123)])('invalid or cancelled drag never creates an intent %j',value=>{expect(matrixDragIntent(value,scope)).toBeNull();});
