import {assertBoardViewReference} from './boardViewSchema.js';
import {createHash,randomUUID} from 'node:crypto';
import type {AppActor,AppCommand,TaskFilter,TaskView,ViewConfig} from '../../src/features/productivity/contracts.js';
import {assertTaskView} from '../../src/features/productivity/contracts.js';
import {object,keys,text,integer} from '../../src/features/productivity/validation.js';
import {UserRole} from '../../src/types.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import type {TaskReader} from './access.js';
import {assertContext} from './tasks.js';
export type SavedTaskView=TaskView&{title:string;formatVersion?:9};
export interface SaveViewInput {id?:string;formatVersion?:9;title:string;filter:TaskFilter;kind:ViewConfig['kind'];config:ViewConfig}
const format=(reader:TaskReader):number=>reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version??0;
function validated(input:SaveViewInput,ownerId:string,version:number):void {
 try{const value=object(input);keys(value,['id','title','filter','kind','config','formatVersion']);if(value.formatVersion!==undefined&&value.formatVersion!==9)throw Error('Unsupported view format');if(value.formatVersion===9&&version<9)throw new AppStoreError('Cần migration nhóm thẻ trước khi lưu.',409,'view-format');text(value.title,500);if(value.id!==undefined)text(value.id,256);assertTaskView({id:value.id??'new',ownerId,revision:1,filter:value.filter,kind:value.kind,config:value.config},value.formatVersion===9?9:8);}
 catch(error){if(error instanceof AppStoreError)throw error;throw new AppStoreError('Cấu hình góc nhìn không hợp lệ.',400,'view-input');}
}
function decode(row:any,version:number):SavedTaskView {
 const value={id:row.id,ownerId:row.owner_id,title:row.title,revision:row.revision,filter:JSON.parse(row.filter_json),kind:row.kind,config:JSON.parse(row.config_json),...(version>=9?{formatVersion:9 as const}:{})};
 text(value.title,500);integer(value.revision,1);assertTaskView(value,[10,11].includes(version)?9:version);return value;
}
function authorize(reader:TaskReader,actor:AppActor):void {
 assertContext({actor,requestId:'view:read',expectedRevision:0},reader);
 if(!reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='productivity_views'"))throw new AppStoreError('Kho góc nhìn chưa sẵn sàng.',409,'view-storage');
}
function own(reader:TaskReader,actor:AppActor,id:string):SavedTaskView {
 try{text(id,256);}catch{throw new AppStoreError('Mã góc nhìn không hợp lệ.',400,'view-input');}
 const row=reader.get('SELECT * FROM productivity_views WHERE id=? AND owner_id=?',id,actor.userId);
 if(!row)throw new AppStoreError('Không tìm thấy góc nhìn.',404,'view-missing');return decode(row,format(reader));
}
/** Actor-owned configuration only; filters never grant task access. I01 owns writes/retries. */
export function createTaskViews(ports:{reader:TaskReader;write:typeof withAppWriteTransaction}){
 return {
  getView(actor:AppActor,id:string):SavedTaskView{authorize(ports.reader,actor);return own(ports.reader,actor,id);},
  listViews(actor:AppActor):SavedTaskView[]{authorize(ports.reader,actor);return ports.reader.all('SELECT * FROM productivity_views WHERE owner_id=? ORDER BY title,id',actor.userId).map(row=>decode(row,format(ports.reader)));},
  saveView(ctx:AppCommand,input:SaveViewInput):SavedTaskView {
   assertContext(ctx,ports.reader);authorize(ports.reader,ctx.actor);if(ctx.actor.role===UserRole.GUEST)throw new AppStoreError('Bạn không có quyền lưu góc nhìn.',403,'view-forbidden');validated(input,ctx.actor.userId,format(ports.reader));assertBoardViewReference(ports.reader,ctx.actor,input.config);
   if(input.id)own(ports.reader,ctx.actor,input.id);else if(ctx.expectedRevision!==0)throw new AppStoreError('Phiên bản tạo mới phải bằng 0.',409,'view-conflict');
   const payload=structuredClone(input);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:view:save',requestId:ctx.requestId,payloadHash:createHash('sha256').update(JSON.stringify({expectedRevision:ctx.expectedRevision,input:payload})).digest('hex')},tx=>{
    assertContext(ctx,tx);authorize(tx,ctx.actor);assertBoardViewReference(tx,ctx.actor,payload.config);const before=payload.id?own(tx,ctx.actor,payload.id):null;
    if((before?.revision??0)!==ctx.expectedRevision)throw new AppStoreError('Góc nhìn vừa được thay đổi.',409,'view-conflict');
    const value:SavedTaskView={id:before?.id??randomUUID(),ownerId:ctx.actor.userId,title:payload.title,revision:(before?.revision??0)+1,filter:payload.filter,kind:payload.kind,config:payload.config,...(format(tx)>=9?{formatVersion:9 as const}:{})};
    tx.run('INSERT INTO productivity_views VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,revision=excluded.revision,filter_json=excluded.filter_json,kind=excluded.kind,config_json=excluded.config_json',value.id,value.ownerId,value.title,value.revision,JSON.stringify(value.filter),value.kind,JSON.stringify(value.config));
    return value;
   });
  },
 };
}
