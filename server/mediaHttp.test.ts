import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {it,expect} from 'vitest';
import {FamilyDB} from './db.js';
import {sqliteLoad,sqliteSave} from './sqlite.js';
import * as media from './media.js';
import {createApp} from './app.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=','base64');
async function fixture(work:(f:any)=>Promise<void>,domain?:string){
 const users=[UserRole.ADMIN,UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST].map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic'}));
 const url='/uploads/notes/'+randomUUID()+'.png';fs.mkdirSync(path.join(media.UPLOADS_DIR,'notes'),{recursive:true});fs.writeFileSync(path.join(media.UPLOADS_DIR,url.slice(9)),png);
 const db=sqliteLoad();sqliteSave({...db,users:users as any,notes:[{id:'private',creatorId:UserRole.MEMBER,isShared:false,title:'synthetic',content:`![synthetic](${url})`,allowedRolesToEdit:[]} as any],documents:[],tasks:[],transactions:[],assets:[],debts:[]});
 if(domain){const db=sqliteLoad();db.notes=[];if(domain==='tasks')db.tasks=[{id:'private',creatorId:UserRole.MEMBER,assigneeId:UserRole.MEMBER,isShared:false,proofImage:url} as any];if(domain==='documents')db.documents=[{id:'private',creatorId:UserRole.MEMBER,ownerId:UserRole.MEMBER,isShared:false,files:[{url}]} as any];if(domain==='transactions')db.transactions=[{id:'private',receiptImage:url} as any];sqliteSave(db);}
 if('initializeMediaMetadata' in media)(media as any).initializeMediaMetadata();
 const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db.FamilyDB=FamilyDB;deps.media=media;
 const tokens=Object.fromEntries(users.map(user=>[user.id,deps.auth.issue(user)]));
 const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const send=(route:string,role?:UserRole,body?:any)=>new Promise<any>((resolve,reject)=>{const bytes=body===undefined?undefined:JSON.stringify(body);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,method:bytes?'POST':'GET',agent:false,headers:{...(role?{Authorization:'Bearer '+tokens[role]}:{}),...(bytes?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)}:{})}},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,bytes,text:bytes.toString()});});});req.on('error',reject);req.end(bytes);});
 try{await work({url,send,tokens,deps});}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));handle.endStreams();await handle.drainHandlers();await handle.dispose();}
}
it('denies anonymous legacy media even with a valid token supplied only in its URL',()=>fixture(async({send,url,tokens}:any)=>{expect((await send(url)).status).toBe(401);expect((await send(url+'?token='+encodeURIComponent(tokens.member))).status).toBe(401);}));
it.each([UserRole.CHILD,UserRole.GUEST])('denies private note attachment to %s with the same response as missing',role=>fixture(async({send,url}:any)=>{const denied=await send(url,role),missing=await send('/uploads/notes/absent.png',role);expect(denied.status).toBe(404);expect(denied.text).toBe(missing.text);expect(denied.headers['cache-control']).toBe('no-store');}));
it.each([UserRole.ADMIN,UserRole.MEMBER])('preserves authorized private note attachment for %s',role=>fixture(async({send,url}:any)=>{const result=await send(url,role);expect(result.status).toBe(200);expect(result.bytes).toEqual(png);expect(result.headers['cache-control']).toBe('no-store');expect(result.headers['x-content-type-options']).toBe('nosniff');}));
it('follows sharing revocation immediately without changing the attachment URL',()=>fixture(async({send,url}:any)=>{let db=sqliteLoad();db.notes[0].isShared=true;sqliteSave(db);expect((await send(url,UserRole.CHILD)).status).toBe(200);db=sqliteLoad();db.notes[0].isShared=false;sqliteSave(db);expect((await send(url,UserRole.CHILD)).status).toBe(404);}));
it('does not resurrect uploader authority after the bound note is deleted',()=>fixture(async({send,url}:any)=>{sqliteSave({...sqliteLoad(),notes:[]});expect((await send(url,UserRole.MEMBER)).status).toBe(404);}));
it('rejects copying another domain managed URL into a new shared note atomically',()=>fixture(async({send,url}:any)=>{const before=sqliteLoad().notes;const result=await send('/api/notes',UserRole.CHILD,{title:'synthetic forged',content:`![stolen](${url})`,isShared:true});expect(result.status).toBe(403);expect(sqliteLoad().notes).toEqual(before);}));
it('gives an unbound upload only to its uploader, then uses the bound note policy',()=>fixture(async({send}:any)=>{
 const uploaded=await send('/api/uploads',UserRole.MEMBER,{dataUrl:'data:image/png;base64,'+png.toString('base64'),category:'avatars'});expect(uploaded.status).toBe(200);const url=JSON.parse(uploaded.text).url;
 expect((await send(url,UserRole.MEMBER)).status).toBe(200);expect((await send(url,UserRole.CHILD)).status).toBe(404);
 const saved=await send('/api/notes',UserRole.MEMBER,{title:'synthetic bound',content:`![owned](${url})`,isShared:true});expect(saved.status).toBe(200);expect((await send(url,UserRole.CHILD)).status).toBe(200);
 const db=sqliteLoad();db.notes=db.notes.filter(row=>row.id!==JSON.parse(saved.text).note.id);sqliteSave(db);expect((await send(url,UserRole.MEMBER)).status).toBe(404);
}));
it.each(['receipts','documents','assets','debts'])('denies finance/document staging uploads by a child for %s',category=>fixture(async({send}:any)=>{expect((await send('/api/uploads',UserRole.CHILD,{dataUrl:'data:image/png;base64,'+png.toString('base64'),category})).status).toBe(403);}));
it.each(['data:image/svg+xml;base64,'+Buffer.from('<svg onload="synthetic()"/>').toString('base64'),'data:image/png;base64,'+Buffer.from('<svg/>').toString('base64'),'data:image/png;base64,!!!!'])('rejects unsupported or mislabeled media content %s',dataUrl=>fixture(async({send}:any)=>{expect((await send('/api/uploads',UserRole.MEMBER,{dataUrl,category:'avatars'})).status).toBe(400);}));
it('does not serve media through a directory link outside uploads',()=>fixture(async({send}:any)=>{const outside=path.join(process.env.DATA_DIR!,'synthetic outside');fs.mkdirSync(outside,{recursive:true});fs.writeFileSync(path.join(outside,'image.png'),png);const linked=path.join(media.UPLOADS_DIR,'notes','linked');fs.symlinkSync(outside,linked,'junction');try{const db=sqliteLoad();db.notes[0].content='![synthetic](/uploads/notes/linked/image.png)';sqliteSave(db);if('initializeMediaMetadata' in media)(media as any).initializeMediaMetadata();expect((await send('/uploads/notes/linked/image.png',UserRole.MEMBER)).status).toBe(404);}finally{fs.unlinkSync(linked);}}));
it('does not serve hard-linked media',()=>fixture(async({send,url}:any)=>{const original=path.join(media.UPLOADS_DIR,url.slice(9)),other=path.join(process.env.DATA_DIR!,'synthetic-hardlink.png');fs.linkSync(original,other);try{expect((await send(url,UserRole.MEMBER)).status).toBe(404);}finally{fs.unlinkSync(other);}}));
it.each(['notes','debts'])('preserves an adult optimized image upload in %s',category=>fixture(async({send}:any)=>{expect((await send('/api/uploads',UserRole.MEMBER,{dataUrl:'data:image/png;base64,'+png.toString('base64'),category})).status).toBe(200);}));

for(const domain of ['tasks','documents','transactions'])for(const role of [UserRole.ADMIN,UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST])it(`reads ${domain} media according to the live domain ACL for ${role}`,()=>fixture(async({send,url}:any)=>{const allowed=role===UserRole.MEMBER||role===UserRole.ADMIN&&domain!=='documents';expect((await send(url,role)).status).toBe(allowed?200:404);},domain));
it('immediately follows a private proof assignee change',()=>fixture(async({send,url}:any)=>{const db=sqliteLoad();db.tasks[0].assigneeId=UserRole.CHILD;sqliteSave(db);expect((await send(url,UserRole.CHILD)).status).toBe(200);db.tasks[0].assigneeId=UserRole.MEMBER;sqliteSave(db);expect((await send(url,UserRole.CHILD)).status).toBe(404);},'tasks'));
