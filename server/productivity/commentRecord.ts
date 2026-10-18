import {randomUUID} from 'node:crypto';
import type {TaskComment,TaskHistory} from '../../src/types.js';
import {validateTaskComment} from '../taskPolicy.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
/** Shared record shape for existing legacy and typed canonical writers. IDs do
 * not depend on clock resolution; no database, job or notification is owned here. */
export function taskCommentRecord(content:string,actor:{userId:string;username:string},createdAt:string):{comment:TaskComment;activity:TaskHistory}{validateTaskComment(content);utcInstant(createdAt);return {comment:{id:'c_'+randomUUID(),userId:actor.userId,username:actor.username,content,createdAt},activity:{id:'h_'+randomUUID(),userId:actor.userId,username:actor.username,action:'Đã bình luận: "'+content.slice(0,30)+(content.length>30?'...':'')+'"',createdAt}};}
