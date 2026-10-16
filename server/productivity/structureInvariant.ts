import type {AppWriteTx} from '../appStore.js';
import type {TaskRecord,AppActor} from '../../src/features/productivity/contracts.js';
import {AppStoreError} from '../appErrors.js';
import {UserRole} from '../../src/types.js';
import {canReadTask,listPermission,type TaskReader} from './access.js';
export interface TaskEdge {id:string;listId:string;parentId:string|null;creatorId:string;assigneeId:string|null;isShared:boolean;deletedAt:string|null}
const invalid=()=>new AppStoreError('Cây công việc không hợp lệ.',422,'task-tree');
export function edge(row:any):TaskEdge{return {id:row.id,listId:row.list_id,parentId:row.parent_id,creatorId:row.creator_id,assigneeId:row.assignee_id,isShared:!!row.is_shared,deletedAt:row.deleted_at};}
export function assertTaskTree(rows:TaskEdge[]):void {
 const live=new Map(rows.filter(row=>row.deletedAt===null).map(row=>[row.id,row]));
 for(const row of live.values()){
  const seen=new Set([row.id]);let current=row,depth=1;
  while(current.parentId!==null){const parent=live.get(current.parentId);if(!parent||seen.has(parent.id)||parent.listId!==current.listId||current.isShared&&!parent.isShared||++depth>5)throw invalid();seen.add(parent.id);current=parent;}
 }
}
export function hasStructureStorage(reader:TaskReader):boolean{return !!reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='app_migrations'")&&[2,3,4,5,6,7,8,9,10,11].includes(reader.get("SELECT max(version) AS version FROM app_migrations WHERE namespace='productivity'")?.version);}
const graph=(reader:TaskReader)=>reader.all('SELECT id,list_id,parent_id,creator_id,assignee_id,is_shared,deleted_at FROM productivity_tasks').map(edge);
export function assertCurrentTaskTree(reader:TaskReader):void {if(hasStructureStorage(reader))assertTaskTree(graph(reader));}
/** All write paths share structure validation. Dynamic ancestor ACL still narrows
 * reads after later role/grant changes; unrelated writes need not repair them. */
export function assertTaskStructure(reader:TaskReader,candidate:TaskEdge):void {
 if(!hasStructureStorage(reader)||candidate.deletedAt!==null)return;
 const rows=graph(reader),old=rows.find(row=>row.id===candidate.id),combined=rows.filter(row=>row.id!==candidate.id);combined.push(candidate);assertTaskTree(combined);
 const changed=!old||(['parentId','listId','creatorId','assigneeId','isShared'] as const).some(key=>old[key]!==candidate[key]);if(!changed)return;
 const live=new Map(combined.filter(row=>row.deletedAt===null).map(row=>[row.id,row]));
 const users=reader.all('SELECT data FROM users').map(row=>JSON.parse(row.data)).filter(user=>!user.isDeleted&&Object.values(UserRole).includes(user.role));
 for(const child of live.values()){
  if(child.parentId===null||child.id!==candidate.id&&child.parentId!==candidate.id)continue;const parent=live.get(child.parentId)!;
  for(const user of users){const actor:AppActor={userId:user.id,role:user.role},permission=listPermission(reader,actor,child.listId);if(canReadTask(actor,child as TaskRecord,permission)&&!canReadTask(actor,parent as TaskRecord,permission))throw invalid();}
 }
}
export function assertNoOpenSubtasks(reader:TaskReader,id:string):void {
 if(!hasStructureStorage(reader))return;
 if(reader.get("SELECT id FROM productivity_tasks WHERE parent_id=? AND deleted_at IS NULL AND lifecycle NOT IN('completed','wont_do') LIMIT 1",id))throw new AppStoreError('Hãy hoàn thành công việc con trước.',422,'task-open-subtasks');
}
