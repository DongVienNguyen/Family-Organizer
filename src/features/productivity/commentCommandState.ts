import {createDraftCommandState} from './draftCommandState.js';
import {commentInput,type CommentInput} from './collaborationApi.js';
import {text,integer} from './validation.js';
import type {TaskApi} from './api.js';
export interface CommentDraft {taskId:string;revision:number;input:CommentInput}
/** One in-memory packet per Task/session. Navigation and SSE cannot replace an
 * uncertain comment with a new revision/key. Logout/authoritative denial clears it. */
export function createCommentCommandState(ports:{api:Pick<TaskApi,'addTaskComment'>;onCommitted():Promise<void>;newRequestId?:()=>string}){return createDraftCommandState<CommentDraft,Awaited<ReturnType<TaskApi['addTaskComment']>>>({validate:draft=>{text(draft.taskId,256);integer(draft.revision,1);commentInput(draft.input);},send:(draft,key)=>ports.api.addTaskComment(draft.taskId,draft.revision,draft.input,key),onCommitted:()=>ports.onCommitted(),newRequestId:ports.newRequestId});}
export type CommentCommandState=ReturnType<typeof createCommentCommandState>;
