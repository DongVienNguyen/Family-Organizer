import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {sqliteLoad,sqliteSave,sqliteConnection} from './sqlite.js';
import {withAppWriteTransaction} from './appStore.js';
import {collectAppSnapshot,validateAppSnapshot,restoreAppSnapshot} from './appSnapshot.js';
import {initializeMediaMetadata,uploadMedia,authorizeMedia,deleteMediaByUrl,UPLOADS_DIR} from './media.js';
import {mediaKey,parseMediaMetadata,mediaReferences,mayReadMedia} from './mediaPolicy.js';
import {UserRole} from '../src/types.js';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=';
const change=(work:(tx:any)=>any,actor='synthetic-member')=>withAppWriteTransaction({actorId:actor,command:'synthetic:media',requestId:randomUUID(),payloadHash:'synthetic'},work);
const row=(url:string)=>(sqliteConnection().prepare('SELECT value FROM app_meta WHERE key=?').get(mediaKey(url)) as any)?.value;
function fixture(){
 const id=randomUUID();const url='/uploads/notes/'+id+'.png';fs.mkdirSync(path.join(UPLOADS_DIR,'notes'),{recursive:true});fs.writeFileSync(path.join(UPLOADS_DIR,'notes',id+'.png'),Buffer.from(png,'base64'));
 const db=sqliteLoad();db.users=[{id:'synthetic-admin',role:UserRole.ADMIN},{id:'synthetic-member',role:UserRole.MEMBER},{id:'synthetic-child',role:UserRole.CHILD},{id:'synthetic-guest',role:UserRole.GUEST}] as any;db.notes=[{id,creatorId:'synthetic-member',isShared:false,content:`![synthetic](${url})`} as any];db.tasks=[];db.documents=[];db.transactions=[];db.assets=[];db.debts=[];sqliteSave(db);initializeMediaMetadata();return {url,id};
}
it('reconciles legacy bindings repeatedly without guessing ownership of orphan files',()=>{const {url}=fixture();const metadata=row(url);initializeMediaMetadata();expect(row(url)).toBe(metadata);expect(parseMediaMetadata(metadata)).toMatchObject({ownerId:null,bindings:[{domain:'notes'}]});expect(authorizeMedia('/uploads/notes/orphan.png',{userId:'synthetic-admin',role:UserRole.ADMIN})).toBe(false);});
it('rolls back a staged binding and all business/command writes if another reference is forbidden',()=>{const {url}=fixture();const staged=uploadMedia('data:image/png;base64,'+png,'notes',undefined,'synthetic-member');const before=sqliteLoad();const commands=sqliteConnection().prepare('SELECT count(*) AS n FROM app_commands').get();
 expect(()=>change(tx=>{tx.legacy.notes.unshift({id:randomUUID(),creatorId:'synthetic-member',content:`![synthetic](${staged.url})`,isShared:true});tx.legacy.notes.push({id:randomUUID(),creatorId:'synthetic-member',content:`![forged](${url})`,isShared:true});})).toThrow(/gắn tệp/);
 expect(sqliteLoad()).toEqual(before);expect(parseMediaMetadata(row(staged.url)).bindings).toEqual([]);expect(sqliteConnection().prepare('SELECT count(*) AS n FROM app_commands').get()).toEqual(commands);
});
it('keeps migrated files while another canonical record still references them',()=>{const {url,id}=fixture();const db=sqliteLoad();db.notes.push({...db.notes[0],id:'other-'+id});sqliteSave(db);
 // Model initial migration of two legacy references, rather than a new URL claim.
 sqliteConnection().prepare('DELETE FROM app_meta WHERE key=?').run(mediaKey(url));initializeMediaMetadata();
 change(tx=>{tx.legacy.notes=tx.legacy.notes.filter((n:any)=>n.id!==id);});deleteMediaByUrl(url);expect(fs.existsSync(path.join(UPLOADS_DIR,url.slice(9)))).toBe(true);
 change(tx=>{tx.legacy.notes=[];});deleteMediaByUrl(url);expect(fs.existsSync(path.join(UPLOADS_DIR,url.slice(9)))).toBe(false);expect(parseMediaMetadata(row(url)).bindings).toHaveLength(2);
});
it('expires staging and fails closed for unknown actors without granting a bound uploader override',()=>{const {url}=fixture();const stored=parseMediaMetadata(row(url));expect(mayReadMedia(url,stored,sqliteLoad(),{userId:'synthetic-member',role:'unknown' as any})).toBe(false);
 const staged={version:1 as const,ownerId:'synthetic-member',createdAt:1000,bindings:[]};expect(mayReadMedia(url,staged,sqliteLoad(),{userId:'synthetic-member',role:UserRole.MEMBER},1001)).toBe(true);expect(mayReadMedia(url,staged,sqliteLoad(),{userId:'synthetic-member',role:UserRole.MEMBER},1000+86400000)).toBe(false);
 sqliteSave({...sqliteLoad(),notes:[]});expect(authorizeMedia(url,{userId:'synthetic-member',role:UserRole.MEMBER})).toBe(false);
});
it('extracts canonical avatars/proofs/markdown/documents/receipts/assets/debts references',()=>{fixture();const db=sqliteLoad();for(const [domain,record] of Object.entries({users:{avatarImage:'/uploads/avatars/a.png'},tasks:{proofImage:'/uploads/notes/t.png'},documents:{files:[{url:'/uploads/documents/d.pdf'}]},transactions:{receiptImage:'/uploads/receipts/r.png'},assets:{photos:[{thumbnailDataUrl:'/uploads/assets/a.png',fullDataUrl:'/uploads/assets/b.png'}]},debts:{attachments:['/uploads/debts/d.png']}}))(db as any)[domain]=[{id:'synthetic',...record}];expect(mediaReferences(db).size).toBe(8);});
it('restores metadata and files together without reviving a deleted binding',async()=>{const {url,id}=fixture();const snapshot=change(tx=>collectAppSnapshot(tx));change(tx=>{tx.legacy.notes=[];});fs.writeFileSync(path.join(UPLOADS_DIR,url.slice(9)),'synthetic changed');
 await restoreAppSnapshot(validateAppSnapshot(snapshot),{maintenance:async work=>work()});expect(sqliteLoad().notes.map(n=>n.id)).toContain(id);expect(authorizeMedia(url,{userId:'synthetic-member',role:UserRole.MEMBER})).toBe(true);expect(fs.readFileSync(path.join(UPLOADS_DIR,url.slice(9))).toString('base64')).toBe(png);expect(row(url)).toBe(snapshot.tables.app_meta.find(r=>r.key===mediaKey(url))!.value);
});
