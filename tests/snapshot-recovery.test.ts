import { writeSyntheticInstallation } from './synthetic-installation.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
const repo = fileURLToPath(new URL('..',import.meta.url));
const moduleUrl = (name: string) => JSON.stringify(pathToFileURL(path.join(repo,'server',name+'.ts')).href);
async function child(root: string, script: string, expected: number) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH','SystemRoot','windir','TEMP','TMP','USERPROFILE','HOME']) if (process.env[key]) env[key]=process.env[key];
  Object.assign(env,{NODE_ENV:'production',DATA_DIR:path.join(root,'dữ liệu'),CONFIG_DIR:path.join(root,'config with spaces'),LOG_DIR:path.join(root,'logs'),PORT:'0',FO_NETWORK_ATTEMPTS:path.join(root,'unexpected.jsonl')});
  const processChild=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href,'--input-type=module','--eval',script],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let output='';processChild.stdout.on('data',data=>{output+=data;});processChild.stderr.on('data',data=>{output+=data;});
  const timer=setTimeout(()=>processChild.kill('SIGKILL'),15_000);
  try {
    const result=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{processChild.once('error',reject);processChild.once('exit',(code,signal)=>resolve({code,signal}));});
    expect(result.signal,output).toBeNull();expect(result.code,output).toBe(expected);
    expect(fs.existsSync(env.FO_NETWORK_ATTEMPTS!)?fs.readFileSync(env.FO_NETWORK_ATTEMPTS!,'utf8'):'').toBe('');
  } finally { clearTimeout(timer);if(processChild.exitCode===null&&processChild.signalCode===null)processChild.kill('SIGKILL'); }
}
it.each(['journal-written','media-old-renamed','media-promoted','settings-old-renamed','settings-promoted','sql-committed'])('recovers interrupted %s before runtime readiness in a fresh process',async phase=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo restore crash synthetic '));
  try {
    writeSyntheticInstallation(path.join(root,'dữ liệu'));
    await child(root,`
      import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
      const db=await import(${moduleUrl('db')});const store=await import(${moduleUrl('appStore')});const snapshots=await import(${moduleUrl('appSnapshot')});
      const meta=()=>({actorId:'synthetic',command:'synthetic:crash',requestId:randomUUID(),payloadHash:'synthetic'});
      const media=path.join(process.env.DATA_DIR,'uploads');fs.mkdirSync(media,{recursive:true});fs.writeFileSync(path.join(media,'synthetic.bin'),'snapshot bytes');
      db.setAppSetting('rewardsEnabled','1');db.setAppSetting('geminiApiKey','synthetic-secret');
      store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'snapshot-task',title:'Synthetic snapshot'}];});
      const captured=store.withAppWriteTransaction(meta(),snapshots.collectAppSnapshot);
      store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'current-task',title:'Synthetic current'}];});
      fs.writeFileSync(path.join(media,'synthetic.bin'),'current bytes');db.setAppSetting('rewardsEnabled','0');
      await snapshots.restoreAppSnapshot(snapshots.validateAppSnapshot(captured),{maintenance:async work=>work(),onBoundary:phase=>{if(phase===${JSON.stringify(phase)})process.exit(41);}});
      throw new Error('Synthetic crash boundary was not reached');
    `,41);
    await child(root,`
      import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
      const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication();
      try {
        assert.equal(runtime.state.phase,'ready');
        const db=await import(${moduleUrl('db')});const sqlite=await import(${moduleUrl('sqlite')});
        assert.equal(sqlite.sqliteLoad().tasks[0].id,${JSON.stringify(phase==='sql-committed'?'snapshot-task':'current-task')});
        assert.equal(fs.readFileSync(path.join(process.env.DATA_DIR,'uploads','synthetic.bin'),'utf8'),${JSON.stringify(phase==='sql-committed'?'snapshot bytes':'current bytes')});
        assert.equal(db.getAppSettings().rewardsEnabled,${JSON.stringify(phase==='sql-committed'?'1':'0')});
        assert.equal(db.getAppSettings().geminiApiKey,'synthetic-secret');
        assert.equal(fs.existsSync(path.join(process.env.DATA_DIR,'restore-journal.json')),false);
      } finally { await runtime.close(); }
    `,0);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
},35_000);

it.each(['journal-written','media-old-renamed','media-promoted','settings-old-renamed','settings-promoted','sql-committed'])('offline encrypted backup refuses interrupted %s without changing journal/files, then succeeds after normal recovery',async phase=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo offline recovery crash synthetic '));
 try{
  writeSyntheticInstallation(path.join(root,'dữ liệu'));
  await child(root,`
   import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
   const db=await import(${moduleUrl('db')});const store=await import(${moduleUrl('appStore')});const snapshots=await import(${moduleUrl('appSnapshot')});
   const meta=()=>({actorId:'synthetic',command:'synthetic:offline-crash',requestId:randomUUID(),payloadHash:'fixture'});
   const media=path.join(process.env.DATA_DIR,'uploads');fs.mkdirSync(media,{recursive:true});fs.writeFileSync(path.join(media,'synthetic.bin'),'snapshot bytes');db.setAppSetting('rewardsEnabled','1');
   store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'snapshot-task',title:'Synthetic snapshot'}];});const captured=store.withAppWriteTransaction(meta(),snapshots.collectAppSnapshot);
   store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'current-task',title:'Synthetic current'}];});fs.writeFileSync(path.join(media,'synthetic.bin'),'current bytes');db.setAppSetting('rewardsEnabled','0');
   await snapshots.restoreAppSnapshot(snapshots.validateAppSnapshot(captured),{maintenance:async work=>work(),onBoundary:value=>{if(value===${JSON.stringify(phase)})process.exit(41);}});throw new Error('Crash fixture not reached');
  `,41);
  await child(root,`
   import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
   const hashes=()=>{const result={};function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else result[path.relative(process.cwd(),file)]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}walk(process.cwd());return result;};
   const before=hashes(),request={file:path.join(process.cwd(),'refused.fo-recovery'),key:'a'.repeat(64),includeCredentials:true};const {runRecoveryOperator}=await import(${moduleUrl('recoveryOperator')});
   await assert.rejects(runRecoveryOperator(request,false),{message:'RECOVERY_PENDING_RESTORE'});assert.deepEqual(hashes(),before);assert.equal(fs.existsSync(request.file),false);
   const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication();await runtime.close();
  `,0);
  await child(root,`
   import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
   const {runRecoveryOperator}=await import(${moduleUrl('recoveryOperator')});const {decryptRecovery}=await import(${moduleUrl('recoveryEnvelope')});const file=path.join(process.cwd(),'consistent.fo-recovery');const key='a'.repeat(64);
   const result=await runRecoveryOperator({file,key,includeCredentials:true},false);assert.equal(result.encrypted,true);
   const snapshot=JSON.parse(decryptRecovery(fs.readFileSync(file),Buffer.from(key,'hex')).toString());assert.equal(snapshot.legacy.tasks[0].id,${JSON.stringify(phase==='sql-committed'?'snapshot-task':'current-task')});assert.equal(Buffer.from(snapshot.media['synthetic.bin'],'base64').toString(),${JSON.stringify(phase==='sql-committed'?'snapshot bytes':'current bytes')});assert.equal(snapshot.settings.rewardsEnabled,${JSON.stringify(phase==='sql-committed'?'1':'0')});
  `,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
},35_000);

it.each(['replace','remove'].flatMap(mode=>['staging-complete','journal-written','signing-key-old-renamed','signing-key-promoted','sql-committed'].map(phase=>({mode,phase}))))('recovers selected signing key $mode at $phase using the shared commit marker before auth readiness',async({mode,phase})=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo signing key crash synthetic '));
 try{
  writeSyntheticInstallation(path.join(root,'dữ liệu'));
  await child(root,`
   import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
   const db=await import(${moduleUrl('db')}),store=await import(${moduleUrl('appStore')}),snapshots=await import(${moduleUrl('appSnapshot')}),files=await import(${moduleUrl('recoveryFiles')});
   const meta=()=>({actorId:'synthetic',command:'synthetic:key-crash',requestId:randomUUID(),payloadHash:'synthetic'});
   store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'snapshot-key-task',title:'Synthetic recovered key task'}];});const captured=store.withAppWriteTransaction(meta(),snapshots.collectAppSnapshot);
   store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'current-key-task',title:'Synthetic retained key task'}];});
   fs.mkdirSync(process.env.CONFIG_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.CONFIG_DIR,'session_secret.key'),'synthetic-current-signing-key');
   const patch=files.selectRecoveryFiles(files.captureRecoveryFiles(${mode==='replace'?"{sessionSigningKey:Buffer.from('synthetic-restored-signing-key')}" :'{}'},['sessionSigningKey']),['sessionSigningKey']);
   await snapshots.restoreAppSnapshot(snapshots.validateAppSnapshot(captured),{maintenance:async work=>work(),privateFiles:patch,onBoundary:value=>{if(value===${JSON.stringify(phase)})process.exit(41);}});throw new Error('Synthetic signing-key crash boundary was not reached');
  `,41);
  await child(root,`
   import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
   const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication();
   try{assert.equal(runtime.state.phase,'ready');const sqlite=await import(${moduleUrl('sqlite')});assert.equal(sqlite.sqliteLoad().tasks[0].id,${JSON.stringify(phase==='sql-committed'?'snapshot-key-task':'current-key-task')});
    const key=fs.readFileSync(path.join(process.env.CONFIG_DIR,'session_secret.key'),'utf8');${phase==='sql-committed'&&mode==='remove'?"assert.match(key,/^[a-f0-9]{96}$/);assert.notEqual(key,'synthetic-current-signing-key');":`assert.equal(key,${JSON.stringify(phase==='sql-committed'?'synthetic-restored-signing-key':'synthetic-current-signing-key')});`}
    assert.equal(fs.existsSync(path.join(process.env.DATA_DIR,'restore-journal.json')),false);assert.equal(fs.readdirSync(process.env.CONFIG_DIR).some(name=>name.startsWith('.restore-')),false);
   }finally{await runtime.close();}
  `,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
},35000);

it.each(['env-old-renamed','env-promoted','sql-committed'])('recovers provider env %s before runtime/provider initialization',async phase=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo provider env crash synthetic '));
 try{writeSyntheticInstallation(path.join(root,'dữ liệu'));
  await child(root,`
   import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
   fs.mkdirSync(process.env.CONFIG_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.CONFIG_DIR,'.env'),'GEMINI_API_KEY=synthetic-current-env\\nAPI_KEY=synthetic-current-fallback\\nAPP_URL=https://retained.invalid\\n');
   const db=await import(${moduleUrl('db')}),store=await import(${moduleUrl('appStore')}),snapshots=await import(${moduleUrl('appSnapshot')}),env=await import(${moduleUrl('recoveryEnv')});const meta=()=>({actorId:'synthetic',command:'synthetic:env-crash',requestId:randomUUID(),payloadHash:'synthetic'});
   store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'snapshot-env-task',title:'Synthetic recovered env task'}];});const captured=store.withAppWriteTransaction(meta(),snapshots.collectAppSnapshot);store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'current-env-task',title:'Synthetic retained env task'}];});
   const patch=env.selectRecoveryEnv(env.captureRecoveryEnv('GEMINI_API_KEY=synthetic-restored-env\\n',['gemini']),['gemini']);await snapshots.restoreAppSnapshot(snapshots.validateAppSnapshot(captured),{maintenance:async work=>work(),privateEnv:patch,onBoundary:value=>{if(value===${JSON.stringify(phase)})process.exit(41);}});throw new Error('Synthetic env crash boundary was not reached');
  `,41);
  await child(root,`
   import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';const {parse}=createRequire(${JSON.stringify(path.join(repo,'package.json'))})('dotenv');
   const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication();try{assert.equal(runtime.state.phase,'ready');const sqlite=await import(${moduleUrl('sqlite')});assert.equal(sqlite.sqliteLoad().tasks[0].id,${JSON.stringify(phase==='sql-committed'?'snapshot-env-task':'current-env-task')});assert.equal(process.env.GEMINI_API_KEY,${JSON.stringify(phase==='sql-committed'?'synthetic-restored-env':'synthetic-current-env')});assert.equal(process.env.API_KEY,${phase==='sql-committed'?'undefined':"'synthetic-current-fallback'"});assert.equal(process.env.APP_URL,'https://retained.invalid');assert.equal(parse(fs.readFileSync(path.join(process.env.CONFIG_DIR,'.env'))).GEMINI_API_KEY,process.env.GEMINI_API_KEY);assert.equal(fs.existsSync(path.join(process.env.DATA_DIR,'restore-journal.json')),false);assert.equal(fs.readdirSync(process.env.CONFIG_DIR).some(name=>name.startsWith('.restore-')),false);}finally{await runtime.close();}
  `,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
},35000);
