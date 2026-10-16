import {createGroupedBoardReader} from './groupedBoardReader.js';
import {createBoardTaskComparator} from './boardSort.js';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {AppActor,QueryClock,TaskRecord} from '../../src/features/productivity/contracts.js';
import {integer,keys,object,text} from '../../src/features/productivity/validation.js';
import {timezoneFormatter,utcInstant} from '../../src/features/productivity/dates.js';
import {AppStoreError} from '../appErrors.js';
import {type TaskReader} from './access.js';
import {resolveBoardReference} from './boardViewSchema.js';
import {boardReadLimits} from './boardProjection.js';
import {projectTaskGroups,groupProjectionLimits,type BoardGroupKind} from './grouping.js';
import type {SavedTaskView} from './views.js';
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'grouped-board');};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Read-only groups of an owned canonical board; no DDL, seeding or WIP policy.
 * One page carries each canonical body once and separate scalar visual refs. */
export function createGroupedBoardProjection(ports:{reader:TaskReader;views:{getView(actor:AppActor,id:string):SavedTaskView};now?:()=>number;pageSize?:number;maxRows?:number;maxBytes?:number}){
 const reader=ports.reader,now=ports.now??Date.now,secret=randomBytes(32),pageSize=ports.pageSize??50,maxRows=ports.maxRows??boardReadLimits.rows,maxBytes=ports.maxBytes??boardReadLimits.bytes,admitted=createGroupedBoardReader({reader});
 integer(pageSize,1,100);integer(maxRows,1,boardReadLimits.rows);integer(maxBytes,1,boardReadLimits.bytes);
 const sign=(body:string)=>createHmac('sha256',secret).update(body).digest();
 const open=(cursor:string):{clock:QueryClock;offset:number;identity:string}=>{
  try{text(cursor,2048);const parts=cursor.split('.');if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))throw Error();const signature=Buffer.from(parts[1],'base64url');if(signature.length!==32||!timingSafeEqual(signature,sign(parts[0])))throw Error();const p=object(JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')));keys(p,['version','clock','offset','identity']);if(p.version!==1)throw Error();const clock=object(p.clock);keys(clock,['nowUtc','timezone']);text(clock.nowUtc,64);text(clock.timezone,100);utcInstant(clock.nowUtc);timezoneFormatter(clock.timezone);integer(p.offset,1,groupProjectionLimits.references);text(p.identity,64);if(!/^[a-f0-9]{64}$/.test(p.identity))throw Error();return {clock:clock as unknown as QueryClock,offset:p.offset,identity:p.identity};}catch{fail(400,'Con trỏ nhóm không hợp lệ.');}
 };
 return {project(actor:AppActor,viewId:string,options:unknown={}){
  const view=ports.views.getView(actor,viewId);let input:Record<string,any>;
  try{input=object(options);keys(input,['cursor','timezone']);if(input.cursor!==undefined)text(input.cursor,2048);if(input.timezone!==undefined){text(input.timezone,100);timezoneFormatter(input.timezone);}}catch{fail(400,'Tùy chọn nhóm không hợp lệ.');}
  const config=view.config;if(config.kind!=='kanban'||config.boardId===undefined) return fail(422,'Góc nhìn chưa liên kết bảng chuẩn.');
  const board=resolveBoardReference(reader,actor,config.boardId,config.mode);
  if(!['priority','assignee','due','tag'].includes(config.group))return fail(422,'Cách nhóm hoặc sắp xếp chưa được hỗ trợ.');
  if(config.group==='tag'&&![9,10,11].includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))fail(409,'Cần migration nhóm thẻ trước khi đọc.');
  const kind=config.group as BoardGroupKind,current=now(),prior=input.cursor===undefined?null:open(input.cursor),clock=prior?.clock??{nowUtc:new Date(current).toISOString(),timezone:input.timezone??'Asia/Saigon'};
  if(prior&&(utcInstant(clock.nowUtc)>current||utcInstant(clock.nowUtc)+boardReadLimits.ttlMs<=current||input.timezone!==undefined&&input.timezone!==clock.timezone))fail(409,'Trang nhóm đã hết hạn; tải lại bảng.');
  const {revision,rows,tasksById,ordering}=admitted.read(actor,view,board,kind,clock,{maxRows,maxBytes});
  let projected:ReturnType<typeof projectTaskGroups>;try{projected=projectTaskGroups(rows,kind,clock);}catch{fail(422,'Bảng vượt giới hạn nhóm.');}
  const counts=new Map<string,{group:{kind:BoardGroupKind;value:string|null};count:number}>();
  for(const card of projected!.cards){const key=JSON.stringify(card.group),entry=counts.get(key);if(entry)entry.count++;else{if(counts.size>=boardReadLimits.columns)fail(422,'Bảng vượt giới hạn số nhóm.');counts.set(key,{group:card.group,count:1});}}
  const columns=[...counts].map(([key,entry])=>({id:hash(JSON.parse(key)),group:entry.group,visibleCardCount:entry.count,wip:{policy:'off' as const,limit:null,activeRootCount:null,visibility:'redacted' as const}}));
  const priority=['high','medium','low','none'];columns.sort((a,b)=>kind==='priority'?priority.indexOf(a.group.value!)-priority.indexOf(b.group.value!):a.group.value===b.group.value?0:a.group.value===null?-1:b.group.value===null?1:a.group.value<b.group.value?-1:1);
  const columnOrder=new Map(columns.map((c,i)=>[JSON.stringify(c.group),i])),cards=projected!.cards.map(c=>{const rank=ordering.get(c.taskId);if(!Number.isSafeInteger(rank))fail(409,'Thứ tự nhóm không hợp lệ.');return {...c,rank:rank!};});
  const compare=createBoardTaskComparator(config.sort,clock);cards.sort((a,b)=>columnOrder.get(JSON.stringify(a.group))!-columnOrder.get(JSON.stringify(b.group))!||compare(tasksById.get(a.taskId)!,tasksById.get(b.taskId)!,a.rank,b.rank));
  const identity=hash({actor,viewId:view.id,viewRevision:view.revision,config,filter:view.filter,boardId:board.id,revision,clock,rows:cards.map(c=>[c.taskId,tasksById.get(c.taskId)!.revision,c.projectionId,c.rank])});
  if(prior&&(prior.identity!==identity||prior.offset>=cards.length))fail(409,'Nhóm công việc đã thay đổi; tải lại bảng.');
  const offset=prior?.offset??0,page=cards.slice(offset,offset+pageSize),selected:TaskRecord[]=[...new Set(page.map(c=>c.taskId))].map(id=>tasksById.get(id)!);let nextCursor:string|null=null;
  if(offset+pageSize<cards.length){const body=Buffer.from(JSON.stringify({version:1,clock,offset:offset+pageSize,identity})).toString('base64url');nextCursor=body+'.'+sign(body).toString('base64url');}
  return {viewId:view.id,viewRevision:view.revision,boardId:board.id,boardRevision:revision,group:kind,clock,columns,cards:page,tasks:selected,totalUnique:projected!.totalUnique,nextCursor};
 }};
}
