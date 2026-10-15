import {hasTagOwnership,assertTagSelection} from './tagPolicy.js';
import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,AppCommand} from '../../src/features/productivity/contracts.js';
import {UserRole} from '../../src/types.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {object,keys,text,integer,boolean} from '../../src/features/productivity/validation.js';
import {createTaskAccess,listPermission,taskScope,type TaskReader} from './access.js';
import {assertContext,assertCreateList,createTaskWithinTransaction,type CreateTaskInput} from './tasks.js';
import {savePilotTask,type StoredTask} from './store.js';
export interface TaskList {id:string;title:string;ownerId:string;isShared:boolean;revision:number;archivedAt:string|null;permission?:'read'|'write'|'manage'}
export interface TaskSection {id:string;listId:string;title:string;revision:number;archivedAt:string|null}
export interface TaskTag {id:string;name:string;revision:number;archivedAt:string|null}
export interface CheckItemInput {id?:string;text:string;done:boolean}
const error=(status:number)=>new AppStoreError(status===404?'Không tìm thấy mục.':status===403?'Bạn không có quyền tổ chức mục này.':status===409?'Mục vừa được thay đổi.':'Cấu trúc công việc không hợp lệ.',status,status===409?'edit-conflict':'task-structure');
function payload(input:unknown,allowed:string[]):Record<string,any>{try{const value=object(input);if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error();keys(value,allowed);return value;}catch{throw error(400);}}
function value(fn:()=>void):void{try{fn();}catch{throw error(422);}}
function context(ctx:AppCommand,reader:TaskReader){const user=assertContext(ctx,reader);if(![2,3,4,5,6].includes(reader.get("SELECT max(version) AS version FROM app_migrations WHERE namespace='productivity'")?.version))throw new AppStoreError('Cần migration cấu trúc trước khi tổ chức công việc.',409,'task-structure-inactive');return user;}
function metadata(reader:TaskReader,kind:string,id:string){return reader.get('SELECT revision,archived_at FROM productivity_catalog_revisions WHERE entity_kind=? AND entity_id=?',kind,id)??{revision:1,archived_at:null};}
function setMetadata(tx:AppWriteTx,kind:string,id:string,revision:number,archivedAt:string|null=null){tx.run('INSERT INTO productivity_catalog_revisions VALUES(?,?,?,?) ON CONFLICT(entity_kind,entity_id) DO UPDATE SET revision=excluded.revision,archived_at=excluded.archived_at',kind,id,revision,archivedAt);}
function list(reader:TaskReader,actor:AppActor,id:string,operation:'read'|'write'|'manage'):TaskList {
 value(()=>text(id,256));const raw=reader.get('SELECT id,owner_id,is_shared FROM productivity_lists WHERE id=?',id),meta=metadata(reader,'list',id),permission=listPermission(reader,actor,id);
 if(!raw||meta.archived_at||!(actor.role===UserRole.ADMIN||raw.is_shared||actor.role===UserRole.MEMBER&&(raw.owner_id===actor.userId||permission)))throw error(404);
 if(operation==='manage'&&!(actor.role===UserRole.ADMIN||actor.role===UserRole.MEMBER&&permission==='manage'))throw error(403);
 if(operation==='write'&&!(actor.role===UserRole.ADMIN||actor.role===UserRole.MEMBER&&(permission==='manage'||permission==='write')))throw error(403);
 return {id:raw.id,title:reader.get('SELECT title FROM productivity_lists WHERE id=?',id).title,ownerId:raw.owner_id,isShared:!!raw.is_shared,revision:meta.revision,archivedAt:meta.archived_at};
}
function section(reader:TaskReader,actor:AppActor,id:string,manage=false,allowArchived=false):TaskSection {
 value(()=>text(id,256));const raw=reader.get('SELECT id,list_id FROM productivity_sections WHERE id=?',id);if(!raw)throw error(404);list(reader,actor,raw.list_id,manage?'manage':'read');const meta=metadata(reader,'section',id);if(meta.archived_at&&!allowArchived)throw error(404);return {id:raw.id,listId:raw.list_id,title:reader.get('SELECT title FROM productivity_sections WHERE id=?',id).title,revision:meta.revision,archivedAt:meta.archived_at};
}
function revision(current:number,expected:number){if(current!==expected)throw error(409);}
function task(reader:TaskReader,ctx:AppCommand,id:string):StoredTask{value(()=>text(id,256));return createTaskAccess(reader).assertTaskCommand(ctx.actor,id,'update');}
function saveTask(tx:AppWriteTx,ctx:AppCommand,before:StoredTask,patch:Partial<StoredTask>){revision(before.revision,ctx.expectedRevision);const now=new Date().toISOString(),row={...before,...patch,revision:before.revision+1,legacy:structuredClone(before.legacy)};row.legacy.updatedAt=now;row.legacy.history.unshift({id:randomUUID(),userId:ctx.actor.userId,username:tx.legacy.users.find(user=>user.id===ctx.actor.userId)!.username,action:'Tổ chức công việc',createdAt:now});savePilotTask(tx,row);return row;}
export function createStructureCommands(ports:{write:typeof withAppWriteTransaction;reader:TaskReader}){
 const run=<T>(ctx:AppCommand,name:string,input:unknown,preflight:(reader:TaskReader)=>void,fn:(tx:AppWriteTx)=>T):T=>{
  context(ctx,ports.reader);preflight(ports.reader);
  return ports.write({actorId:ctx.actor.userId,command:'productivity:structure:'+name,requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({expectedRevision:ctx.expectedRevision,input})).digest('hex')},tx=>{context(ctx,tx);preflight(tx);return fn(tx);});
 };
 const canCatalogCreate=(actor:AppActor)=>{if(actor.role!==UserRole.ADMIN&&actor.role!==UserRole.MEMBER)throw error(403);};
 const readContext=(actor:AppActor)=>context({actor,requestId:'structure-read',expectedRevision:0},ports.reader);
 const api={
  createSubtask(ctx:AppCommand,id:string,input:Omit<CreateTaskInput,'listId'>):StoredTask {
   payload(input,['title','body','due','priority','assigneeId','isShared','tagIds']);
   return run(ctx,'subtask',{id,input},r=>{const parent=task(r,ctx,id);assertCreateList(r,ctx.actor,parent.listId);if(input.tagIds!==undefined)assertTagSelection(r,ctx.actor,input.tagIds);},tx=>{
    const parent=task(tx,ctx,id);revision(parent.revision,ctx.expectedRevision);
    return createTaskWithinTransaction(tx,ctx,{...input,listId:parent.listId},row=>{row.parentId=parent.id;row.sectionId=parent.sectionId;});
   });
  },
  saveList(ctx:AppCommand,input:{id?:string;title:string;isShared:boolean}):TaskList {
   const data=payload(input,['id','title','isShared']);value(()=>{text(data.title,500);boolean(data.isShared);if(data.id!==undefined)text(data.id,256);});
   return run(ctx,'list',input,r=>{if(input.id)list(r,ctx.actor,input.id,'manage');else canCatalogCreate(ctx.actor);},tx=>{
    const old=input.id?list(tx,ctx.actor,input.id,'manage'):undefined;revision(old?.revision??0,ctx.expectedRevision);const id=old?.id??randomUUID();
    tx.run('INSERT INTO productivity_lists VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,is_shared=excluded.is_shared',id,input.title,old?.ownerId??ctx.actor.userId,Number(input.isShared));setMetadata(tx,'list',id,(old?.revision??0)+1);return list(tx,ctx.actor,id,'read');
   });
  },
  saveSection(ctx:AppCommand,input:{id?:string;listId:string;title:string}):TaskSection {
   const data=payload(input,['id','listId','title']);value(()=>{text(data.title,500);text(data.listId,256);if(data.id!==undefined)text(data.id,256);});
   return run(ctx,'section',input,r=>{list(r,ctx.actor,input.listId,'manage');if(input.id){const old=section(r,ctx.actor,input.id,true);if(old.listId!==input.listId)throw error(422);}},tx=>{
    const old=input.id?section(tx,ctx.actor,input.id,true):undefined;revision(old?.revision??0,ctx.expectedRevision);const id=old?.id??randomUUID();tx.run('INSERT INTO productivity_sections VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title',id,input.listId,input.title);setMetadata(tx,'section',id,(old?.revision??0)+1);const owner=list(tx,ctx.actor,input.listId,'manage');setMetadata(tx,'list',owner.id,owner.revision+1);return section(tx,ctx.actor,id);
   });
  },
  saveTag(ctx:AppCommand,input:{id?:string;name:string}):TaskTag {
   const data=payload(input,['id','name']);value(()=>{text(data.name,256);if(data.id!==undefined)text(data.id,256);});
   return run(ctx,'tag',input,()=>{canCatalogCreate(ctx.actor);if(input.id&&ctx.actor.role!==UserRole.ADMIN)throw error(403);},tx=>{
    const old=input.id?tx.get('SELECT * FROM productivity_tags WHERE id=?',input.id):undefined;if(input.id&&!old)throw error(404);const meta=old?metadata(tx,'tag',old.id):undefined;revision(meta?.revision??0,ctx.expectedRevision);const id=old?.id??randomUUID();tx.run('INSERT INTO productivity_tags VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',id,input.name);setMetadata(tx,'tag',id,(meta?.revision??0)+1);if(!old&&hasTagOwnership(tx))tx.run('INSERT INTO productivity_tag_owners VALUES(?,?)',id,ctx.actor.userId);return {id,name:input.name,revision:(meta?.revision??0)+1,archivedAt:null};
   });
  },
  setListGrant(ctx:AppCommand,id:string,input:{userId:string;permission:'read'|'write'|'manage'|null}):TaskList {
   const data=payload(input,['userId','permission']);value(()=>{text(data.userId,256);if(!['read','write','manage',null].includes(data.permission))throw Error();});
   return run(ctx,'grant',{id,input},r=>{if(ctx.actor.role===UserRole.CHILD||ctx.actor.role===UserRole.GUEST)throw error(403);list(r,ctx.actor,id,'manage');},tx=>{
    const old=list(tx,ctx.actor,id,'manage');revision(old.revision,ctx.expectedRevision);const user=tx.legacy.users.find(u=>u.id===input.userId&&!u.isDeleted&&u.role===UserRole.MEMBER);if(!user)throw error(422);
    if(input.permission===null)tx.run('DELETE FROM productivity_list_grants WHERE list_id=? AND user_id=?',id,input.userId);else tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?) ON CONFLICT(list_id,user_id) DO UPDATE SET permission=excluded.permission',id,input.userId,input.permission);
    setMetadata(tx,'list',id,old.revision+1);return {...old,revision:old.revision+1};
   });
  },
  archiveSection(ctx:AppCommand,id:string):TaskSection {
   return run(ctx,'archive-section',{id},r=>{section(r,ctx.actor,id,true,true);},tx=>{
    const old=section(tx,ctx.actor,id,true);revision(old.revision,ctx.expectedRevision);
    for(const raw of tx.all('SELECT id FROM productivity_tasks WHERE section_id=? AND deleted_at IS NULL',id)){const before=task(tx,ctx,raw.id);saveTask(tx,{...ctx,expectedRevision:before.revision},before,{sectionId:null});}
    const now=new Date().toISOString();setMetadata(tx,'section',id,old.revision+1,now);const owner=list(tx,ctx.actor,old.listId,'manage');setMetadata(tx,'list',owner.id,owner.revision+1);return {...old,revision:old.revision+1,archivedAt:now};
   });
  },
  moveTaskToList(ctx:AppCommand,id:string,targetListId:string,sectionId:string|null):StoredTask {
   value(()=>{text(targetListId,256);if(sectionId!==null)text(sectionId,256);});
   return run(ctx,'move-list',{id,targetListId,sectionId},r=>{if(ctx.actor.role===UserRole.CHILD||ctx.actor.role===UserRole.GUEST)throw error(403);const before=task(r,ctx,id);list(r,ctx.actor,before.listId,'write');list(r,ctx.actor,targetListId,'write');},tx=>{
    const before=task(tx,ctx,id);if(sectionId!==null){const target=section(tx,ctx.actor,sectionId);if(target.listId!==targetListId)throw error(422);}
    if(before.listId!==targetListId&&(before.parentId||tx.get('SELECT id FROM productivity_tasks WHERE parent_id=? AND deleted_at IS NULL',id)))throw error(422);
    return saveTask(tx,ctx,before,{listId:targetListId,sectionId});
   });
  },
  setTaskParent(ctx:AppCommand,id:string,parentId:string|null):StoredTask {
   value(()=>{if(parentId!==null)text(parentId,256);});
   return run(ctx,'parent',{id,parentId},r=>{task(r,ctx,id);if(parentId!==null&&!createTaskAccess(r).getTask(ctx.actor,parentId))throw error(404);},tx=>{const before=task(tx,ctx,id);return saveTask(tx,ctx,before,{parentId});});
  },
  setChecklist(ctx:AppCommand,id:string,input:CheckItemInput[]){
   value(()=>{if(!Array.isArray(input)||input.length>200)throw Error();});for(const item of input){const data=payload(item,['id','text','done']);value(()=>{text(data.text,2000);boolean(data.done);if(data.id!==undefined)text(data.id,256);});}
   return run(ctx,'checklist',{id,input},r=>{task(r,ctx,id);},tx=>{
    const before=task(tx,ctx,id);revision(before.revision,ctx.expectedRevision);const prior=new Set(tx.all('SELECT id FROM productivity_check_items WHERE task_id=?',id).map(row=>row.id)),ids=new Set<string>();
    const items=input.map(item=>{if(item.id&&!prior.has(item.id))throw error(422);const key=item.id??randomUUID();if(ids.has(key))throw error(422);ids.add(key);return {id:key,text:item.text,done:item.done};});
    tx.run('DELETE FROM productivity_check_items WHERE task_id=?',id);items.forEach((item,index)=>tx.run('INSERT INTO productivity_check_items VALUES(?,?,?,?,?)',item.id,id,item.text,Number(item.done),(index+1)*1024));const next=saveTask(tx,ctx,before,{});return {taskId:id,revision:next.revision,items,progress:items.length?Math.round(items.filter(item=>item.done).length/items.length*100):0};
   });
  },
  getChecklist(actor:AppActor,id:string){readContext(actor);const row=createTaskAccess(ports.reader).getTask(actor,id);if(!row)throw error(404);const items=ports.reader.all('SELECT id,text,is_done FROM productivity_check_items WHERE task_id=? ORDER BY rank,id',id).map(item=>({id:item.id,text:item.text,done:!!item.is_done}));return {taskId:id,revision:row.revision,items,progress:items.length?Math.round(items.filter(item=>item.done).length/items.length*100):0};},
  getCatalog(actor:AppActor){
   readContext(actor);
   const visible=actor.role===UserRole.ADMIN?{sql:'1',args:[] as string[]}:actor.role===UserRole.MEMBER?{sql:"(l.is_shared=1 OR l.owner_id=? OR EXISTS(SELECT 1 FROM productivity_list_grants g WHERE g.list_id=l.id AND g.user_id=? AND g.permission IN('read','write','manage')))",args:[actor.userId,actor.userId]}:{sql:'l.is_shared=1',args:[] as string[]};
   const listSql="SELECT l.id FROM productivity_lists l LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='list' AND m.entity_id=l.id WHERE m.archived_at IS NULL AND "+visible.sql;
   const lists=ports.reader.all(listSql+' ORDER BY l.title,l.id',...visible.args).map(row=>({...list(ports.reader,actor,row.id,'read'),permission:actor.role===UserRole.ADMIN?'manage' as const:listPermission(ports.reader,actor,row.id)??'read' as const}));
   const sections=ports.reader.all("SELECT s.id FROM productivity_sections s LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='section' AND m.entity_id=s.id WHERE m.archived_at IS NULL AND s.list_id IN("+listSql+') ORDER BY s.title,s.id',...visible.args).map(row=>section(ports.reader,actor,row.id));
   const filter=taskScope(actor),owned=hasTagOwnership(ports.reader)&&actor.role===UserRole.MEMBER,tagSql=actor.role===UserRole.ADMIN?'SELECT id,name FROM productivity_tags ORDER BY name,id':"SELECT tag.id,tag.name FROM productivity_tags tag WHERE "+(owned?"EXISTS(SELECT 1 FROM productivity_tag_owners o WHERE o.tag_id=tag.id AND o.user_id=?) OR ":'')+"EXISTS(SELECT 1 FROM productivity_task_tags tt JOIN productivity_tasks t ON t.id=tt.task_id WHERE tt.tag_id=tag.id AND ("+filter.sql+')) ORDER BY tag.name,tag.id';
   const tags:TaskTag[]=ports.reader.all(tagSql,...(actor.role===UserRole.ADMIN?[]:[...(owned?[actor.userId]:[]),...filter.args])).map(row=>({id:row.id,name:row.name,revision:metadata(ports.reader,'tag',row.id).revision,archivedAt:metadata(ports.reader,'tag',row.id).archived_at}));return {lists,sections,tags};
  },
  listRootTasks(actor:AppActor){readContext(actor);const items=createTaskAccess(ports.reader).listTasks(actor,{rootsOnly:true});return {items,totalUnique:items.length};},
 };
 return api;
}
