import {object,keys,text,integer,boolean,choice} from './validation.js';
import {utcInstant} from './dates.js';
import type {TaskList} from '../../../server/productivity/structure.js';
export type SharePermission='read'|'contribute'|'manage'|null;
export interface ListGrantInput {userId:string;permission:SharePermission}
export function listGrantInput(raw:unknown):ListGrantInput {const row=object(raw);keys(row,['userId','permission']);text(row.userId,256);if(row.permission!==null)choice(row.permission,['read','contribute','manage']);return structuredClone(row)as unknown as ListGrantInput;}
function listValue(raw:unknown,id:string):TaskList {const row=object(raw);keys(row,['id','title','ownerId','isShared','revision','archivedAt','permission']);if(row.id!==id)throw Error('List sharing identity mismatch');text(row.title,500);text(row.ownerId,256);boolean(row.isShared);integer(row.revision,1);if(row.archivedAt!==null)utcInstant(row.archivedAt as string);if(row.permission!==undefined)choice(row.permission,['read','write','manage']);return structuredClone(row)as unknown as TaskList;}
type Read=(path:string,method?:string,body?:unknown,key?:string)=>Promise<Record<string,any>>;
export function createListSharingApi(read:Read){const path=(id:string)=>{text(id,256);return '/api/productivity/lists/'+encodeURIComponent(id);};return {
 async listGrants(id:string){const data=await read(path(id)+'/grants');keys(data,['list','grants']);const list=listValue(data.list,id);if(!Array.isArray(data.grants)||data.grants.length>1000)throw Error('Invalid list grants');const grants=data.grants.map(raw=>{const row=object(raw);keys(row,['userId','permission']);text(row.userId,256);choice(row.permission,['read','write','manage']);return {userId:row.userId,permission:row.permission};});if(new Set(grants.map(row=>row.userId)).size!==grants.length)throw Error('Duplicate list member');return {list,grants};},
 async saveListGrant(id:string,revision:number,raw:ListGrantInput,key:string){integer(revision,1);const input=listGrantInput(raw),data=await read(path(id)+'/grant','POST',{expectedRevision:revision,input:{...input,permission:input.permission==='contribute'?'write':input.permission}},key);keys(data,['list']);const list=listValue(data.list,id);if(list.revision!==revision+1)throw Error('List grant revision mismatch');return list;},
 };}
