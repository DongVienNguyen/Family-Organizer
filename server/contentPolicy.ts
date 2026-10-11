/** @license SPDX-License-Identifier: Apache-2.0 */
import {isDeepStrictEqual as same} from 'node:util';
import {UserRole,DOCUMENT_TYPE_LABELS,type FamilyOrganizerDB} from '../src/types.js';
import {AppStoreError} from './appErrors.js';
import {canViewLegacyNote,canEditLegacyNote,canViewLegacyPlan,canViewLegacyDocument,isAdult,type LegacyActor} from './legacyVisibility.js';
import {canonicalMediaUrl} from './mediaPolicy.js';
import {contentText as text,plainContentObject as plain} from './contentInput.js';
export {validateContentHeader} from './contentInput.js';
export type ContentKind='note'|'plan'|'document';
const invalid=()=>new AppStoreError('Dữ liệu nội dung không hợp lệ.',400);
const forbidden=()=>new AppStoreError('Bạn không có quyền sửa nội dung hoặc quyền chia sẻ này.',403);
const missing=()=>new AppStoreError('Không tìm thấy nội dung.',404);
export function requireContentEdit(kind:ContentKind,old:any,actor:LegacyActor):void {
 if(kind==='plan'&&(!isAdult(actor)&&actor.role!==UserRole.CHILD)||kind==='document'&&!isAdult(actor))throw forbidden();
 if(!old)return;
 const visible=kind==='note'?canViewLegacyNote(old,actor):kind==='plan'?canViewLegacyPlan(old,actor):canViewLegacyDocument(old,actor);
 if(!visible)throw missing();
 const editable=kind==='note'?canEditLegacyNote(old,actor):kind==='plan'?old.creatorId===actor.userId||actor.role===UserRole.ADMIN:old.creatorId===actor.userId||old.ownerId===actor.userId||old.isShared===true&&actor.role===UserRole.ADMIN;
 if(!editable)throw forbidden();
}
export function requireContentDelete(kind:ContentKind,old:any,actor:LegacyActor):void {
 if(kind!=='note'){requireContentEdit(kind,old,actor);return;}
 if(old){if(!canViewLegacyNote(old,actor))throw missing();if(old.creatorId!==actor.userId&&actor.role!==UserRole.ADMIN)throw forbidden();}
}
function date(value:unknown,time=false):boolean {
 if(typeof value!=='string')return false;
 const match=(time?/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/:/^(\d{4})-(\d{2})-(\d{2})$/).exec(value);if(!match)return false;
 const [year,month,day]=match.slice(1,4).map(Number),parsed=new Date(0);parsed.setUTCFullYear(year,month-1,day);parsed.setUTCHours(0,0,0,0);
 if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day||match[4]&&Number(match[4])>=24||match[5]&&Number(match[5])>=60||match[6]&&Number(match[6])>=60)return false;
 if(match[7]&&match[7]!=='Z'){const [hour,minute]=match[7].slice(1).split(':').map(Number);if(hour>14||minute>=60||hour===14&&minute!==0)return false;}return true;
}
function documentFiles(value:unknown):boolean {
 if(!Array.isArray(value)||value.length>100)return false;
 const ids=new Set<string>();
 return value.every(file=>{
  if(!plain(file)||Object.keys(file).some(key=>!['id','fileName','url','sizeKb','createdAt'].includes(key))||!text(file.id,256,false)||ids.has(file.id)||!text(file.fileName,500,false)||!text(file.url,4096,false)||!text(file.createdAt,64,false)||!date(file.createdAt,true)||file.sizeKb!==undefined&&(!Number.isFinite(file.sizeKb)||file.sizeKb<0||file.sizeKb>10240))return false;
  ids.add(file.id);if(file.url.startsWith('/uploads/')){try{canonicalMediaUrl(file.url);return true;}catch{return false;}}
  try{return ['http:','https:'].includes(new URL(file.url).protocol);}catch{return false;}
 });
}
const fields={
 note:new Set(['id','title','content','isPinned','tags','isShared','allowedRolesToEdit']),
 plan:new Set(['id','title','description','startDate','endDate','isRecurring','recurrenceType','recurrenceWeekdays','isShared','color']),
 document:new Set(['id','title','type','ownerId','documentNumber','issuer','issueDate','expiryDate','notes','files','isShared']),
};
const protectedFields=new Set(['creatorId','createdAt','updatedAt']);
export function validateContentPayload(kind:ContentKind,input:Record<string,any>,old:any,actor:LegacyActor,db:FamilyOrganizerDB):Record<string,any> {
 requireContentEdit(kind,old,actor);const result:Record<string,any>={};
 const liveId=(value:unknown)=>text(value,256,false)&&db.users.some(user=>user.id===value&&!user.isDeleted&&Object.values(UserRole).includes(user.role));
 if(kind==='document'&&old)Object.assign(result,{title:old.title,type:old.type,files:old.files});
 for(const [key,value] of Object.entries(input)){
  if(value===undefined)continue;
  if(protectedFields.has(key)){if(!old||!same(value,old[key]))throw forbidden();continue;}
  if(!fields[kind].has(key)){if(!old||!Object.hasOwn(old,key)||!same(value,old[key]))throw invalid();continue;}
  // Old read-model values stay canonical; changed values must meet the schema.
  if(old&&same(value,old[key])){result[key]=old[key];continue;}
  let valid=true;
  switch(key){
   case 'id':valid=text(value,256,false);break;
   case 'title':valid=text(value,500,false);break;
   case 'description':valid=text(value,20000);break;
   case 'content':valid=text(value,1024*1024);break;
   case 'notes':valid=text(value,20000);break;
   case 'isShared':case 'isPinned':case 'isRecurring':valid=typeof value==='boolean';break;
   case 'tags':valid=Array.isArray(value)&&value.length<=40&&value.every(tag=>text(tag,128,false));break;
   case 'allowedRolesToEdit':valid=Array.isArray(value)&&value.length<=4&&new Set(value).size===value.length&&value.every(role=>Object.values(UserRole).includes(role));break;
   case 'recurrenceType':valid=['none','daily','weekly','monthly','yearly'].includes(value);break;
   case 'recurrenceWeekdays':valid=Array.isArray(value)&&value.length<=7&&new Set(value).size===value.length&&value.every(day=>Number.isInteger(day)&&day>=0&&day<=6);break;
   case 'startDate':case 'endDate':valid=value===''||date(value,true);break;
   case 'color':valid=text(value,64,false);break;
   case 'type':valid=typeof value==='string'&&Object.hasOwn(DOCUMENT_TYPE_LABELS,value);break;
   case 'ownerId':valid=value===''||liveId(value);break;
   case 'documentNumber':case 'issuer':valid=text(value,500);break;
   case 'issueDate':case 'expiryDate':valid=value===''||date(value);break;
   case 'files':valid=documentFiles(value);break;
  }
  if(!valid)throw invalid();
  if(kind==='note'&&old&&['isShared','allowedRolesToEdit'].includes(key)&&old.creatorId!==actor.userId&&actor.role!==UserRole.ADMIN)throw forbidden();
  result[key]=value;
 }
 return result;
}
