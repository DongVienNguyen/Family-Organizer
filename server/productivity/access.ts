import type {AppActor,TaskRecord} from '../../src/features/productivity/contracts.js';
import {UserRole} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import {decodeTaskRow,type StoredTask} from './store.js';
export interface TaskReader {get(sql:string,...args:any[]):any;all(sql:string,...args:any[]):any[]}
export type ListPermission='read'|'write'|'manage';
const known=(actor:AppActor)=>Object.values(UserRole).includes(actor.role as UserRole)&&typeof actor.userId==='string'&&!!actor.userId;
export function canReadTask(actor:AppActor,task:TaskRecord,permission?:ListPermission):boolean {
 return known(actor)&&task.deletedAt===null&&(actor.role===UserRole.ADMIN||task.isShared||task.creatorId===actor.userId||task.assigneeId===actor.userId||actor.role===UserRole.MEMBER&&permission!==undefined);
}
export function listPermission(reader:TaskReader,actor:AppActor,listId:string):ListPermission|undefined {
 if(actor.role!==UserRole.MEMBER)return;
 const list=reader.get('SELECT owner_id FROM productivity_lists WHERE id=?',listId);
 if(list?.owner_id===actor.userId)return 'manage';
 const permission=reader.get('SELECT permission FROM productivity_list_grants WHERE list_id=? AND user_id=?',listId,actor.userId)?.permission;
 return ['read','write','manage'].includes(permission)?permission:undefined;
}
function directScope(actor:AppActor):{sql:string;args:unknown[]} {
 if(!known(actor))return {sql:'0',args:[]};
 if(actor.role===UserRole.ADMIN)return {sql:'t.deleted_at IS NULL',args:[]};
 const grant=actor.role===UserRole.MEMBER?" OR EXISTS(SELECT 1 FROM productivity_lists l WHERE l.id=t.list_id AND l.owner_id=?) OR EXISTS(SELECT 1 FROM productivity_list_grants g WHERE g.list_id=t.list_id AND g.user_id=? AND g.permission IN('read','write','manage'))":'';
 return {sql:"t.deleted_at IS NULL AND (t.is_shared=1 OR t.creator_id=? OR t.assignee_id=?"+grant+")",args:[actor.userId,actor.userId,...(grant?[actor.userId,actor.userId]:[])]};
}
export function taskScope(actor:AppActor):{sql:string;args:unknown[]} {
 const direct=directScope(actor);if(!known(actor)||actor.role===UserRole.ADMIN)return direct;
 const parent=directScope(actor),parentSql=parent.sql.replaceAll('t.','a.');
 return {sql:'('+direct.sql+`) AND NOT EXISTS (
  WITH RECURSIVE ancestors(id,parent_id,list_id,is_shared,creator_id,assignee_id,deleted_at,depth) AS (
   SELECT p.id,p.parent_id,p.list_id,p.is_shared,p.creator_id,p.assignee_id,p.deleted_at,1 FROM productivity_tasks p WHERE p.id=t.parent_id
   UNION ALL SELECT p.id,p.parent_id,p.list_id,p.is_shared,p.creator_id,p.assignee_id,p.deleted_at,a.depth+1 FROM productivity_tasks p JOIN ancestors a ON p.id=a.parent_id WHERE a.depth<5
  ) SELECT 1 FROM ancestors a WHERE a.depth>=5 OR NOT COALESCE((`+parentSql+'),0))',args:[...direct.args,...parent.args]};
}
/** Resolve ACL in SQL before reading/decoding task bodies or provenance. */
export function createTaskAccess(reader:TaskReader){
 const decode=(row:any)=>decodeTaskRow(row,reader.all('SELECT tag_id FROM productivity_task_tags WHERE task_id=? ORDER BY tag_id',row.id).map(x=>x.tag_id));
 const getTask=(actor:AppActor,id:string):StoredTask|null=>{
  const filter=taskScope(actor),row=reader.get('SELECT t.* FROM productivity_tasks t WHERE t.id=? AND ('+filter.sql+')',id,...filter.args);
  return row?decode(row):null;
 };
 return {
  getTask,
  listTasks(actor:AppActor,options:{rootsOnly?:boolean}={}):StoredTask[]{const filter=taskScope(actor);return reader.all('SELECT t.* FROM productivity_tasks t WHERE ('+filter.sql+')'+(options.rootsOnly?' AND t.parent_id IS NULL':'')+' ORDER BY t.rank,t.id',...filter.args).map(decode);},
  assertTaskCommand(actor:AppActor,id:string,_operation:'update'):StoredTask {
   const row=getTask(actor,id);if(!row)throw new AppStoreError('Không tìm thấy công việc.',404,'task-not-found');
   const own=row.creatorId===actor.userId||row.assigneeId===actor.userId;
   const permission=listPermission(reader,actor,row.listId);
   if(actor.role===UserRole.ADMIN||actor.role===UserRole.CHILD&&own||actor.role===UserRole.MEMBER&&(own||permission==='write'||permission==='manage'))return row;
   throw new AppStoreError('Bạn không có quyền sửa công việc.',403,'task-forbidden');
  },
 };
}
