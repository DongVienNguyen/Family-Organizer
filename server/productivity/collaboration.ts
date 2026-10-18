import {createHash,randomUUID} from 'node:crypto';
import type {TaskComment,TaskHistory,User} from '../../src/types.js';
import {UserRole} from '../../src/types.js';
import type {AppActor,AppCommand} from '../../src/features/productivity/contracts.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {object,keys,text,integer} from '../../src/features/productivity/validation.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {validateTaskComment} from '../taskPolicy.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
import {savePilotTask} from './store.js';
import {taskCommentRecord} from './commentRecord.js';
export interface CommentInput {content:string;mentionUserIds?:string[]}
export interface CommentResult {comment:TaskComment;activity:TaskHistory;taskRevision:number;mentionedUserIds:string[]}
export type TaskActivity=TaskHistory&{sourceIndex:number;createdAtKnown:boolean};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'task-collaboration');};
function input(raw:unknown):Required<CommentInput>{try{const v=structuredClone(object(raw));keys(v,['content','mentionUserIds']);validateTaskComment(v.content);const ids=v.mentionUserIds??[];if(!Array.isArray(ids)||ids.length>20||new Set(ids).size!==ids.length)throw Error();for(const id of ids)text(id,256);return {content:v.content,mentionUserIds:ids as string[]};}catch(error){if(error instanceof AppStoreError)throw error;return fail(400,'Bình luận hoặc danh sách người được nhắc không hợp lệ.');}}
/** All comments/history remain in the canonical Task legacy payload. Commands
 * use its revision and the shared I01 receipt; there is no second comment store. */
export function createTaskCollaboration(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;now?:()=>number;recordMention?:(taskId:string,commentId:string,userId:string)=>string}){
 const authorize=(actor:AppActor,reader=ports.reader)=>assertContext({actor,requestId:'collaboration:read',expectedRevision:0},reader),owned=(actor:AppActor,id:string,writing=false,reader=ports.reader)=>{authorize(actor,reader);try{text(id,256);}catch{return fail(400,'Mã công việc không hợp lệ.');}const access=createTaskAccess(reader),task=writing?access.assertTaskCommand(actor,id,'update'):access.getTask(actor,id);if(!task)return fail(404,'Không tìm thấy công việc.');return task;};
 const mentions=(actor:AppActor,id:string,ids:string[],reader:TaskReader)=>{for(const userId of ids){const raw=reader.get('SELECT data FROM users WHERE id=?',userId),user:User|undefined=raw?JSON.parse(raw.data):undefined;if(!user||user.isDeleted||!Object.values(UserRole).includes(user.role)||!createTaskAccess(reader).getTask({userId,role:user.role},id))fail(422,'Người được nhắc cần đang hoạt động và có quyền xem công việc.');}if(ids.length&&!ports.recordMention)fail(409,'Bộ gửi nhắc tên chưa sẵn sàng.');};
 function page(actor:AppActor,id:string,cursor:string|null,limit:number,kind:'activities'|'comments'){
  const task=owned(actor,id);try{integer(limit,1,100);}catch{return fail(400,'Số mục lịch sử không hợp lệ.');}
  const source=kind==='activities'?task.legacy.history:task.legacy.comments,rows=source.map((entry,sourceIndex)=>{let createdAtKnown=true;try{utcInstant(entry.createdAt);}catch{createdAtKnown=false;}return {...structuredClone(entry),sourceIndex,createdAtKnown};}).sort((a,b)=>Number(b.createdAtKnown)-Number(a.createdAtKnown)||(a.createdAtKnown?b.createdAt.localeCompare(a.createdAt):0)||a.sourceIndex-b.sourceIndex),binding=hash({actor,taskId:id,revision:task.revision,kind,rows:rows.map(row=>[row.sourceIndex,row.id])});let offset=0;
  if(cursor!==null){try{text(cursor,2048);const value=object(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));keys(value,['version','binding','offset']);if(value.version!==1||value.binding!==binding)throw Error();integer(value.offset,0,rows.length);offset=value.offset;}catch{return fail(409,'Lịch sử đã thay đổi hoặc con trỏ không thuộc phạm vi này.');}}
  const items=rows.slice(offset,offset+limit),next=offset+items.length;owned(actor,id);return {items,totalUnique:rows.length,taskRevision:task.revision,nextCursor:next<rows.length?Buffer.from(JSON.stringify({version:1,binding,offset:next})).toString('base64url'):null};
 }
 return {
  addTaskComment(rawContext:AppCommand,id:string,raw:unknown,onChanged?:(userIds:string[])=>void):CommentResult {
   const ctx=structuredClone(rawContext),value=input(raw);assertContext(ctx,ports.reader);owned(ctx.actor,id,true);mentions(ctx.actor,id,value.mentionUserIds,ports.reader);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:comment:add',requestId:ctx.requestId,payloadHash:hash({taskId:id,expectedRevision:ctx.expectedRevision,...value})},tx=>{const user=assertContext(ctx,tx),before=owned(ctx.actor,id,true,tx);if(before.revision!==ctx.expectedRevision||before.revision>=Number.MAX_SAFE_INTEGER)fail(409,'Công việc đã thay đổi; tải lại trước khi bình luận.');mentions(ctx.actor,id,value.mentionUserIds,tx);const at=new Date((ports.now??Date.now)()).toISOString(),record=taskCommentRecord(value.content,{userId:ctx.actor.userId,username:user.username},at),row={...before,revision:before.revision+1,legacy:structuredClone(before.legacy)};row.legacy.comments.push(record.comment);row.legacy.history.unshift(record.activity);row.legacy.updatedAt=at;savePilotTask(tx,row,ctx.actor);
    tx.legacy.activityLogs.unshift({id:'log_'+randomUUID(),userId:ctx.actor.userId,username:user.username,action:'Bình luận Task',details:'Đã bình luận trong công việc "'+row.title+'".',sourceRef:{domain:'task',id},createdAt:at});if(tx.legacy.activityLogs.length>300)tx.legacy.activityLogs=tx.legacy.activityLogs.slice(0,300);
    for(const recipient of value.mentionUserIds)if(recipient!==ctx.actor.userId)ports.recordMention!(id,record.comment.id,recipient);if(onChanged)tx.afterCommit(()=>onChanged(value.mentionUserIds.filter(userId=>userId!==ctx.actor.userId)));return {...structuredClone(record),taskRevision:row.revision,mentionedUserIds:value.mentionUserIds.filter(userId=>userId!==ctx.actor.userId)};
   });
  },
  mentionCandidates(actor:AppActor,id:string){owned(actor,id,true);const users=ports.reader.all('SELECT data FROM users ORDER BY id').map(row=>JSON.parse(row.data)as User).filter(user=>!user.isDeleted&&Object.values(UserRole).includes(user.role)&&createTaskAccess(ports.reader).getTask({userId:user.id,role:user.role},id)).map(user=>user.id);owned(actor,id,true);return {taskId:id,userIds:users};},
  getActivities(actor:AppActor,id:string,cursor:string|null=null,limit=50){const result=page(actor,id,cursor,limit,'activities');return {...result,items:result.items as TaskActivity[]};},
  getComments(actor:AppActor,id:string,cursor:string|null=null,limit=50){const result=page(actor,id,cursor,limit,'comments');return {...result,items:result.items as (TaskComment&{sourceIndex:number;createdAtKnown:boolean})[]};},
 };
}
