import {createHash} from 'node:crypto';
import type {AppActor,AppCommand,Due,Priority} from '../../src/features/productivity/contracts.js';
import {object,keys,text,integer,choice,boolean} from '../../src/features/productivity/validation.js';
import {assertDue} from '../../src/features/productivity/dates.js';
import {UserRole} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import type {withAppWriteTransaction} from '../appStore.js';
import type {TaskReader} from './access.js';
import {assertContext,createTaskWithinTransaction} from './tasks.js';
import {assertTaskListManage} from './structure.js';
import {resolveBoardReference} from './boardViewSchema.js';
import {createBoardCatalog} from './boardCatalog.js';
import {createTaskViews} from './views.js';
import {projectTaskRecord} from './query.js';
export interface BoardViewCreateInput {listId:string;mode:'sections'|'workflow';title:string}
export interface BoardTaskCreateInput {viewId:string;expectedViewRevision:number;columnId:string;title:string;priority:Priority;due:Due;isShared:boolean}
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'board-create');};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const syntax=(fn:()=>void)=>{try{fn();}catch{fail(400,'Dữ liệu tạo mới trong bảng không hợp lệ.');}};
/** Board/view and quick-add composition use one existing I01 write owner. */
export function createBoardCreation(ports:{reader:TaskReader;write:typeof withAppWriteTransaction;afterWrite?:()=>void}){
 const ready=(r:TaskReader)=>{if(![8,9,10,11,12,13].includes(r.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))fail(409,'Cần migration góc nhìn bảng trước khi tạo.');};
 const manager=(r:TaskReader,actor:AppActor,listId:string)=>{assertContext({actor,requestId:'board-create:scope',expectedRevision:0},r);if(actor.role!==UserRole.ADMIN&&actor.role!==UserRole.MEMBER)fail(403,'Bạn không có quyền tạo trong bảng.');return assertTaskListManage(r,actor,listId);};
 const target=(r:TaskReader,actor:AppActor,input:BoardTaskCreateInput)=>{
  ready(r);const view=createTaskViews({reader:r,write:ports.write}).getView(actor,input.viewId),c=view.config;
  if(c.kind!=='kanban'||!c.boardId||c.group!=='none')fail(422,'Chỉ thêm nhanh vào cột chuẩn.');
  const config=c as Extract<typeof c,{kind:'kanban'}>,board=resolveBoardReference(r,actor,config.boardId!,config.mode);manager(r,actor,board.list_id);
  const column=r.get("SELECT c.* FROM productivity_board_columns c LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='section' AND m.entity_id=c.section_id WHERE c.board_id=? AND c.id=? AND c.archived_at IS NULL AND m.archived_at IS NULL",board.id,input.columnId);
  if(!column)fail(404,'Không tìm thấy cột.');if(board.mode==='workflow'&&column.column_key!=='todo')fail(422,'Công việc mới phải bắt đầu ở Cần làm.');
  return {view,board,column,revision:r.get('SELECT revision FROM productivity_boards WHERE id=?',board.id).revision};
 };
 return {
  createView(ctx:AppCommand,input:BoardViewCreateInput){
   syntax(()=>{keys(object(input),['listId','mode','title']);text(input.listId,256);text(input.title,500);choice(input.mode,['sections','workflow']);});assertContext(ctx,ports.reader);ready(ports.reader);manager(ports.reader,ctx.actor,input.listId);if(ctx.expectedRevision!==0)fail(409,'Phiên bản tạo góc nhìn phải bằng0.');
   const payload=structuredClone(input);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:board:create-view',requestId:ctx.requestId,payloadHash:hash(payload)},tx=>{
    ready(tx);manager(tx,ctx.actor,payload.listId);const within:typeof withAppWriteTransaction=(_meta,work)=>work(tx),catalog=createBoardCatalog({reader:tx,write:within}),existing=tx.get('SELECT id FROM productivity_boards WHERE list_id=? AND mode=?',payload.listId,payload.mode);
    const board=existing?catalog.read(ctx.actor,existing.id):catalog.configure({...ctx,expectedRevision:0},{listId:payload.listId,mode:payload.mode,policies:[]});
    const view=createTaskViews({reader:tx,write:within}).saveView({...ctx,expectedRevision:0},{title:payload.title,kind:'kanban',filter:{rootsOnly:true,listIds:[payload.listId]},config:{kind:'kanban',mode:payload.mode,group:'none',sort:'rank',columns:[],boardId:board.id}});
    ports.afterWrite?.();return {board,view};
   });
  },
  createTask(ctx:AppCommand,input:BoardTaskCreateInput){
   syntax(()=>{keys(object(input),['viewId','expectedViewRevision','columnId','title','priority','due','isShared']);text(input.viewId,256);text(input.columnId,256);text(input.title,500);integer(input.expectedViewRevision,1);choice(input.priority,['high','medium','low','none']);assertDue(input.due);boolean(input.isShared);});assertContext(ctx,ports.reader);target(ports.reader,ctx.actor,input);
   const payload=structuredClone(input);
   return ports.write({actorId:ctx.actor.userId,command:'productivity:board:create-task',requestId:ctx.requestId,payloadHash:hash({expectedRevision:ctx.expectedRevision,input:payload})},tx=>{
    const v=target(tx,ctx.actor,payload);if(v.revision!==ctx.expectedRevision||v.view.revision!==payload.expectedViewRevision)fail(409,'Bảng vừa thay đổi; xem lại bản nháp trước khi tạo.');
    const task=createTaskWithinTransaction(tx,{...ctx,expectedRevision:0},{listId:v.board.list_id,title:payload.title,priority:payload.priority,due:payload.due,isShared:payload.isShared},row=>{row.sectionId=v.column.section_id;});
    ports.afterWrite?.();return {viewId:v.view.id,boardId:v.board.id,boardRevision:tx.get('SELECT revision FROM productivity_boards WHERE id=?',v.board.id).revision,task:projectTaskRecord(task)};
   });
  }
 };
}
