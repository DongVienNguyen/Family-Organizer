import {createDraftCommandState} from './draftCommandState.js';
import {listGrantInput,type ListGrantInput} from './listSharingApi.js';
import {text,integer} from './validation.js';
import type {TaskApi} from './api.js';
interface GrantDraft {listId:string;revision:number;input:ListGrantInput;memberName:string}
export function createListGrantCommand(ports:{api:Pick<TaskApi,'saveListGrant'>;onCommitted():Promise<void>}){return createDraftCommandState<GrantDraft,Awaited<ReturnType<TaskApi['saveListGrant']>>>({validate:draft=>{text(draft.listId,256);integer(draft.revision,1);text(draft.memberName,500);listGrantInput(draft.input);},send:(draft,key)=>ports.api.saveListGrant(draft.listId,draft.revision,draft.input,key),onCommitted:()=>ports.onCommitted()});}
export function createListGrantSession(ports:{api:Pick<TaskApi,'saveListGrant'>;onCommitted():Promise<void>}){
 const states=new Map<string,ReturnType<typeof createListGrantCommand>>();let disposed=false;
 return {forList(id:string){if(disposed)throw Error('List sharing session disposed');let state=states.get(id);if(!state){state=createListGrantCommand(ports);states.set(id,state);}return state;},reconcile(ids:readonly string[]){const managed=new Set(ids);for(const [id,state]of states)if(!managed.has(id)){state.clear();state.dispose();states.delete(id);}},clear(){for(const state of states.values())state.clear();},dispose(){if(disposed)return;disposed=true;for(const state of states.values())state.dispose();states.clear();}};
}
export type ListGrantSession=ReturnType<typeof createListGrantSession>;
