import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {it,expect} from 'vitest';
const repo=fileURLToPath(new URL('..',import.meta.url));
const moduleUrl=(name:string)=>JSON.stringify(pathToFileURL(path.join(repo,'server',name+'.ts')).href);
async function child(root:string,script:string){
 const env:NodeJS.ProcessEnv={};for(const key of ['PATH','SystemRoot','windir','TEMP','TMP','USERPROFILE','HOME'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{NODE_ENV:'production',DATA_DIR:path.join(root,'dữ liệu'),CONFIG_DIR:path.join(root,'config with spaces'),LOG_DIR:path.join(root,'logs'),PORT:'0',FO_NETWORK_ATTEMPTS:path.join(root,'unexpected.jsonl')});
 const processChild=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href,'--input-type=module','--eval',script],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let output='';processChild.stdout.on('data',chunk=>{output+=chunk;});processChild.stderr.on('data',chunk=>{output+=chunk;});const timer=setTimeout(()=>processChild.kill('SIGKILL'),15000);
 try{const result=await new Promise<any>((resolve,reject)=>{processChild.once('error',reject);processChild.once('exit',(code,signal)=>resolve({code,signal}));});expect(result.signal,output).toBeNull();expect(result.code,output).toBe(0);expect(fs.existsSync(env.FO_NETWORK_ATTEMPTS!)?fs.readFileSync(env.FO_NETWORK_ATTEMPTS!,'utf8'):'').toBe('');}finally{clearTimeout(timer);if(processChild.exitCode===null&&processChild.signalCode===null)processChild.kill('SIGKILL');}
}
it('cold restore and repeated startup preserve media ownership and permanent bound-file revocation',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo media cold synthetic '));
 try{
  await child(root,`
   import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
   const db=await import(${moduleUrl('db')});const store=await import(${moduleUrl('appStore')});const sqlite=await import(${moduleUrl('sqlite')});const media=await import(${moduleUrl('media')});const snapshots=await import(${moduleUrl('appSnapshot')});
   const meta=()=>({actorId:'synthetic-member',command:'synthetic:cold-media',requestId:randomUUID(),payloadHash:'synthetic'});
   store.withAppWriteTransaction(meta(),tx=>{tx.legacy.users=[{id:'synthetic-admin',role:'admin'},{id:'synthetic-member',role:'member'},{id:'synthetic-child',role:'child'}];});media.initializeMediaMetadata();
   const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=';
   const saved=media.uploadMedia('data:image/png;base64,'+data,'notes',undefined,'synthetic-member');fs.writeFileSync('url.json',JSON.stringify(saved.url));
   store.withAppWriteTransaction(meta(),tx=>{tx.legacy.notes=[{id:'synthetic-note',creatorId:'synthetic-member',isShared:false,content:'![synthetic]('+saved.url+')'}];});
   const captured=store.withAppWriteTransaction(meta(),snapshots.collectAppSnapshot);
   store.withAppWriteTransaction(meta(),tx=>{tx.legacy.notes=[];});media.deleteMediaByUrl(saved.url);assert.equal(fs.existsSync(path.join(media.UPLOADS_DIR,saved.url.slice(9))),false);
   await snapshots.restoreAppSnapshot(snapshots.validateAppSnapshot(captured),{maintenance:async work=>work()});assert.equal(media.authorizeMedia(saved.url,{userId:'synthetic-member',role:'member'}),true);sqlite.sqliteClose();
  `);
  await child(root,`
   import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
   const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication();
   try{const media=await import(${moduleUrl('media')});const db=await import(${moduleUrl('db')});const url=JSON.parse(fs.readFileSync('url.json','utf8'));
    assert.equal(media.authorizeMedia(url,{userId:'synthetic-member',role:'member'}),true);assert.equal(media.authorizeMedia(url,{userId:'synthetic-child',role:'child'}),false);
    const bytes=media.readManagedMedia(url).bytes;db.FamilyDB.deleteNote('synthetic-note','synthetic-member','Synthetic');assert.equal(media.authorizeMedia(url,{userId:'synthetic-member',role:'member'}),false);
    fs.writeFileSync(path.join(media.UPLOADS_DIR,url.slice(9)),bytes); // an orphan cannot revive its uploader grant
   }finally{await runtime.close();}
  `);
  await child(root,`
   import fs from 'node:fs';import assert from 'node:assert/strict';
   const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication();
   try{const media=await import(${moduleUrl('media')});const url=JSON.parse(fs.readFileSync('url.json','utf8'));media.initializeMediaMetadata();
    assert.equal(media.authorizeMedia(url,{userId:'synthetic-member',role:'member'}),false);assert.equal(media.authorizeMedia(url,{userId:'synthetic-admin',role:'admin'}),false);
   }finally{await runtime.close();}
  `);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
},50000);
