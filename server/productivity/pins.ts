import {createHash} from 'node:crypto';
import type {AppActor,AppCommand} from '../../src/features/productivity/contracts.js';
import {UserRole} from '../../src/types.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {text,boolean} from '../../src/features/productivity/validation.js';
import {createTaskAccess,taskScope,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
export interface TaskPin {taskId:string;pinned:boolean;revision:number}
function context(ctx:AppCommand,reader:TaskReader,id?:string):void {
 assertContext(ctx,reader);if(![4,5,6,7,8,9,10,11].includes(reader.get("SELECT max(version) AS version FROM app_migrations WHERE namespace='productivity'")?.version))throw new AppStoreError('Cần migration ghim công việc trước khi dùng.',409,'task-pins-inactive');
 if(id!==undefined){try{text(id,256);}catch{throw new AppStoreError('Mã công việc không hợp lệ.',400,'task-pin');}if(!createTaskAccess(reader).getTask(ctx.actor,id))throw new AppStoreError('Không tìm thấy công việc.',404,'task-not-found');}
}
function current(reader:TaskReader,actor:AppActor,id:string):TaskPin {const row=reader.get('SELECT is_pinned,revision FROM productivity_task_pins WHERE user_id=? AND task_id=?',actor.userId,id);return {taskId:id,pinned:!!row?.is_pinned,revision:row?.revision??0};}
/** Personal read preferences still require fresh live actor/task access before cache and inside the owner tx. */
export function createTaskPins(ports:{reader:TaskReader;write:typeof withAppWriteTransaction}) {
 const readContext=(actor:AppActor,id?:string)=>context({actor,requestId:'task-pin-read',expectedRevision:0},ports.reader,id);
 const writeContext=(ctx:AppCommand,reader:TaskReader,id:string)=>{context(ctx,reader,id);if(ctx.actor.role===UserRole.GUEST)throw new AppStoreError('Khách chỉ có quyền xem.',403,'task-pin-forbidden');};
 return {
  getPin(actor:AppActor,id:string):TaskPin {readContext(actor,id);return current(ports.reader,actor,id);},
  listPins(actor:AppActor):TaskPin[] {readContext(actor);const filter=taskScope(actor);return ports.reader.all('SELECT p.task_id,p.is_pinned,p.revision FROM productivity_task_pins p JOIN productivity_tasks t ON t.id=p.task_id WHERE p.user_id=? AND ('+filter.sql+') ORDER BY p.task_id',actor.userId,...filter.args).map(row=>({taskId:row.task_id,pinned:!!row.is_pinned,revision:row.revision}));},
  setPin(ctx:AppCommand,id:string,pinned:boolean):TaskPin {
   try{boolean(pinned);}catch{throw new AppStoreError('Giá trị ghim không hợp lệ.',422,'task-pin');}writeContext(ctx,ports.reader,id);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:preference:pin',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({id,pinned,expectedRevision:ctx.expectedRevision})).digest('hex')},tx=>{
    writeContext(ctx,tx,id);const before=current(tx,ctx.actor,id);if(before.revision!==ctx.expectedRevision)throw new AppStoreError('Mục ghim vừa được thay đổi.',409,'edit-conflict');
    tx.run('INSERT INTO productivity_task_pins VALUES(?,?,?,?) ON CONFLICT(user_id,task_id) DO UPDATE SET is_pinned=excluded.is_pinned,revision=excluded.revision',ctx.actor.userId,id,Number(pinned),before.revision+1);return {taskId:id,pinned,revision:before.revision+1};
   });
  },
 };
}
