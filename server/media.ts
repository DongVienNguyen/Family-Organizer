import {detectedMediaType} from './mediaContent.js';
export {detectedMediaType} from './mediaContent.js';
/** @license SPDX-License-Identifier: Apache-2.0 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {appConfig} from './config.js';
import {sqliteConnection,sqliteLoad} from './sqlite.js';
import {runLegacyCommand,currentAppWriteTx} from './appStore.js';
import {canonicalMediaUrl,mediaPath,mediaKey,parseMediaMetadata,mayReadMedia,mediaReferences,reconcileMediaMetadata} from './mediaPolicy.js';
import type {LegacyActor} from './legacyVisibility.js';
export const UPLOADS_DIR=path.join(appConfig.dataRoot,'uploads');
export const UPLOADS_URL_PREFIX='/uploads/';
directory(appConfig.dataRoot);directory(UPLOADS_DIR,true);
const categories=new Set(['avatars','assets','receipts','documents','debts','notes']);
const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf'};
export interface SavedMedia {url:string;sizeKb:number}
export const isManagedUrl=(url:unknown):url is string=>typeof url==='string'&&url.startsWith(UPLOADS_URL_PREFIX);

function directory(dir:string,create=false):void {
 if(create&&!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:false});
 const stat=fs.lstatSync(dir);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Media directory must be ordinary');
 if(path.resolve(fs.realpathSync(dir)).toLowerCase()!==path.resolve(dir).toLowerCase())throw new Error('Media directory escape');
}
function location(url:string,create=false):string {
 const relative=mediaPath(url),parts=relative.split('/');directory(appConfig.dataRoot);directory(UPLOADS_DIR,create);
 let current=UPLOADS_DIR;for(const part of parts.slice(0,-1)){current=path.join(current,part);directory(current,create);}return path.join(current,parts.at(-1)!);
}
export function saveDataUrlToFile(dataUrl:unknown,category:string,subfolder?:string):SavedMedia {
 if(!categories.has(category)||typeof dataUrl!=='string'||dataUrl.length>15*1024*1024)throw new Error('Dữ liệu tệp không hợp lệ.');
 const match=/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);if(!match)throw new Error('Dữ liệu tệp không hợp lệ.');
 const mime=match[1].toLowerCase(),ext=extensions[mime];if(!ext)throw new Error('Định dạng tệp không được hỗ trợ.');
 const bytes=Buffer.from(match[2],'base64'),limit=ext==='pdf'?10*1024*1024:4*1024*1024;
 if(!bytes.length||bytes.length>limit||bytes.toString('base64')!==match[2]||detectedMediaType(bytes)!==(mime==='image/jpg'?'image/jpeg':mime))throw new Error('Nội dung hoặc kích thước tệp không hợp lệ.');
 const sub=String(subfolder??'').replace(/[^a-z0-9_-]/gi,'').slice(0,40);
 const url='/uploads/'+category+'/'+(sub?sub+'/':'')+Date.now()+'_'+crypto.randomBytes(16).toString('hex')+'.'+ext;
 fs.writeFileSync(location(url,true),bytes,{flag:'wx',mode:0o600});return {url,sizeKb:Math.max(1,Math.round(bytes.length/1024))};
}
export function initializeMediaMetadata():void {runLegacyCommand('initializeMediaMetadata',[],'system:media',()=>reconcileMediaMetadata(currentAppWriteTx()!));}
export function uploadMedia(dataUrl:unknown,category:string,subfolder:string|undefined,actorId:string):SavedMedia {
 let created:string|undefined;
 try{return runLegacyCommand('uploadMedia',[dataUrl,category,subfolder],actorId,()=>{
  const saved=saveDataUrlToFile(dataUrl,category,subfolder);created=saved.url;
  currentAppWriteTx()!.run('INSERT INTO app_meta VALUES (?,?)',mediaKey(saved.url),JSON.stringify({version:1,ownerId:actorId,createdAt:Date.now(),bindings:[]}));return saved;
 });}catch(error){if(created){try{fs.unlinkSync(location(created));}catch{}}throw error;}
}
export function authorizeMedia(url:string,actor:LegacyActor):boolean {
 try{url=canonicalMediaUrl(url);const row=sqliteConnection().prepare('SELECT value FROM app_meta WHERE key=?').get(mediaKey(url)) as any;return mayReadMedia(url,row?parseMediaMetadata(row.value):undefined,sqliteLoad(),actor);}catch{return false;}
}
export function readManagedMedia(url:string):{bytes:Buffer;mime:string} {
 const file=location(url),before=fs.lstatSync(file);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>10*1024*1024)throw new Error('Media file must be ordinary');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
 try{const after=fs.fstatSync(fd);if(!after.isFile()||after.nlink!==1||after.dev!==before.dev||after.ino!==before.ino||after.size>10*1024*1024)throw new Error('Media file changed');
  const bytes=fs.readFileSync(fd),mime=detectedMediaType(bytes);if(!mime||bytes.length>(mime==='application/pdf'?10:4)*1024*1024)throw new Error('Unsupported media content');return {bytes,mime};
 }finally{fs.closeSync(fd);}
}
export function deleteMediaByUrl(url:unknown):void {
 if(!isManagedUrl(url))return;
 try{const canonical=canonicalMediaUrl(url);if(mediaReferences(sqliteLoad()).has(canonical))return;
  const file=location(canonical),stat=fs.lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1)fs.unlinkSync(file);
 }catch(error:any){if(error.code!=='ENOENT')console.error('Managed media cleanup failed.');}
}
