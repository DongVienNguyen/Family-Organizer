import type {SavedTaskView,SaveViewInput} from '../../../server/productivity/views.js';
import type {TaskFilter} from './contracts.js';
/** Editing base is separate from the live metadata list refreshed by SSE. */
export function createSavedViewDraft(){
 let base:SavedTaskView|undefined;
 return {
  choose(view?:SavedTaskView){base=view?structuredClone(view):undefined;},
  metadata(_next:SavedTaskView[]){/* Metadata cannot replace an explicitly chosen editing base. */},
  prepare(title:string,filter:TaskFilter,copy:boolean):{input:SaveViewInput;revision:number}{const before=base;return {input:{...(!copy&&before?{id:before.id}:{}),title:title.trim(),filter,kind:before?.kind??'list',...(before?.formatVersion===9?{formatVersion:9 as const}:{}),config:before?structuredClone(before.config):{kind:'list',sort:'rank',group:'none'}},revision:copy?0:before?.revision??0};},
 };
}
