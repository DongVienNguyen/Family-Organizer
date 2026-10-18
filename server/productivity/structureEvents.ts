import {hasTagOwnership,canSelectTag} from './tagPolicy.js';
import type {TaskReader} from './access.js';
import {createTaskAccess} from './access.js';
import {UserRole} from '../../src/types.js';
import type {StructureScope} from './structureRouter.js';
/** Metadata-only scopes; the realtime hub sends type/timestamp, never these IDs. */
export function createStructureEventScope(reader:TaskReader){
 const taskIds=(scope:StructureScope):string[]=>{
  if(scope.taskId)return reader.all(`WITH RECURSIVE descendants(id,depth) AS (
   SELECT id,0 FROM productivity_tasks WHERE id=? AND deleted_at IS NULL
   UNION ALL SELECT t.id,d.depth+1 FROM productivity_tasks t JOIN descendants d ON t.parent_id=d.id WHERE t.deleted_at IS NULL AND d.depth<5
  ) SELECT DISTINCT id FROM descendants`,scope.taskId).map(row=>row.id);
  if(scope.listId)return reader.all('SELECT id FROM productivity_tasks WHERE list_id=? AND deleted_at IS NULL',scope.listId).map(row=>row.id);
  if(scope.sectionId)return reader.all('SELECT id FROM productivity_tasks WHERE section_id=? AND deleted_at IS NULL',scope.sectionId).map(row=>row.id);
  if(scope.tagId)return reader.all('SELECT t.id FROM productivity_tasks t JOIN productivity_task_tags x ON x.task_id=t.id WHERE x.tag_id=? AND t.deleted_at IS NULL',scope.tagId).map(row=>row.id);
  return [];
 };
 const catalogAudience=(scope:StructureScope):Set<string>=>{
  const listId=scope.listId??(scope.sectionId?reader.get('SELECT list_id FROM productivity_sections WHERE id=?',scope.sectionId)?.list_id:undefined),list=listId?reader.get('SELECT id,owner_id,is_shared FROM productivity_lists WHERE id=?',listId):undefined;
  const ids=(scope.tagId||scope.taskId)?taskIds(scope):[],access=createTaskAccess(reader),audience=new Set<string>();
  for(const row of reader.all('SELECT data FROM users')){const user=JSON.parse(row.data);if(user.isDeleted||!Object.values(UserRole).includes(user.role))continue;const actor={userId:user.id,role:user.role};
   if(list&&(actor.role===UserRole.ADMIN||list.is_shared||actor.role===UserRole.MEMBER&&(list.owner_id===user.id||reader.get("SELECT permission FROM productivity_list_grants WHERE list_id=? AND user_id=? AND permission IN('read','write','manage')",list.id,user.id))))audience.add(user.id);
   if((scope.tagId||scope.taskId)&&(actor.role===UserRole.ADMIN||scope.tagId&&hasTagOwnership(reader)&&canSelectTag(reader,actor,scope.tagId)||ids.some(id=>access.getTask(actor,id))))audience.add(user.id);
  }
  return audience;
 };
 return {taskIds,catalogAudience};
}
