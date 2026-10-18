import {createCommentCommandState,type CommentCommandState} from './commentCommandState.js';
import type {TaskApi} from './api.js';
/** Provider owner: packets survive view/drawer navigation, never session or a
 * fresh visibility removal. Clearing also invalidates late async continuations. */
export function createCommentSession(ports:{api:Pick<TaskApi,'addTaskComment'>;onCommitted(id:string):Promise<void>}){
 const commands=new Map<string,CommentCommandState>();let disposed=false;
 return {
  forTask(id:string){if(disposed)throw Error('Comment session disposed');let state=commands.get(id);if(!state){state=createCommentCommandState({api:ports.api,onCommitted:()=>ports.onCommitted(id)});commands.set(id,state);}return state;},
  reconcile(ids:readonly string[]){const visible=new Set(ids);for(const [id,state]of commands)if(!visible.has(id)){state.clear();state.dispose();commands.delete(id);}},
  clear(){for(const state of commands.values())state.clear();},
  dispose(){if(disposed)return;disposed=true;for(const state of commands.values())state.dispose();commands.clear();},
 };
}
export type CommentSession=ReturnType<typeof createCommentSession>;
