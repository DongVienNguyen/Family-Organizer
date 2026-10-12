import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';
import {writeSyntheticInstallation} from './synthetic-installation.js';
const repo=fileURLToPath(new URL('..',import.meta.url));
const moduleUrl=(name:string)=>JSON.stringify(pathToFileURL(path.join(repo,'server',name+'.ts')).href);
async function scenario(mode:string){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo online recovery synthetic ')),data=path.join(root,'data'),config=path.join(root,'config');writeSyntheticInstallation(data);fs.mkdirSync(config);fs.writeFileSync(path.join(config,'.env'),'GEMINI_API_KEY=synthetic-online-provider\nAPI_KEY=synthetic-online-fallback\nAPP_URL=https://retained.invalid\n');
 const env:NodeJS.ProcessEnv={};for(const name of ['PATH','SystemRoot','windir','TEMP','TMP','HOME','USERPROFILE'])if(process.env[name])env[name]=process.env[name];Object.assign(env,{NODE_ENV:'production',DATA_DIR:data,CONFIG_DIR:config,LOG_DIR:path.join(root,'logs'),PORT:'0',FO_NETWORK_ATTEMPTS:path.join(root,'network.jsonl')});
 const script=`import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import http from 'node:http';
 const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication();
 const sqlite=await import(${moduleUrl('sqlite')}),store=await import(${moduleUrl('appStore')}),db=await import(${moduleUrl('db')}),{RewardStoreTx}=await import(${moduleUrl('rewardStore')}),{decryptRecovery}=await import(${moduleUrl('recoveryEnvelope')});
 const meta=()=>({actorId:'user_admin',command:'synthetic:online',requestId:randomUUID(),payloadHash:'synthetic'});const mode=${JSON.stringify(mode)};
 const file=path.join(process.cwd(),'online.fo-recovery'),key='a'.repeat(64),request={file,key,includeCredentials:true,includeSettings:['gemini'],includeFiles:['sessionSigningKey'],includeEnv:['gemini']};
 try{
 sqlite.sqliteConnection().pragma('wal_autocheckpoint=0');db.setAppSetting('geminiApiKey','synthetic-online-setting');db.setAppSetting('rewardsEnabled','1');
 const media=path.join(process.env.DATA_DIR,'uploads','online.bin');fs.writeFileSync(media,'synthetic online media');
 store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks.push({id:'online-task',title:'Synthetic in-WAL task'});tx.legacy.transactions.push({id:'online-finance',title:'Synthetic finance',amount:17});new RewardStoreTx(tx).applyCompletionGrant({claimId:'online-claim',taskId:'online-task',userId:'user_admin',points:17,actorId:'user_admin',reason:'Synthetic online claim'});});
 assert.equal(sqlite.sqliteConnection().pragma('journal_mode',{simple:true}),'wal');assert.ok(fs.statSync(path.join(process.env.DATA_DIR,'family.db-wal')).size>0);
 const beforeUsers=sqlite.sqliteLoad().users,beforeClaims=sqlite.sqliteConnection().prepare('SELECT * FROM app_reward_claims').all(),sourceLegacy=fs.readFileSync(path.join(process.env.DATA_DIR,'db.json'));
 if(mode==='collision')fs.writeFileSync(file,'synthetic existing output');
 if(mode==='invalid-selection')request.includeEnv=['NODE_OPTIONS'];
 if(mode==='forbidden-path')request.file=path.join(process.env.DATA_DIR,'forbidden.fo-recovery');
 if(mode==='invalid-key')request.key='unsafe';
 if(mode==='closed'){await runtime.close();await assert.rejects(runtime.backupRecovery(request),{message:'RECOVERY_RUNTIME_NOT_READY'});assert.equal(fs.existsSync(file),false);assert.equal(sqlite.sqliteConnection().open,false);console.log('online-proof-ok');process.exit(0);}
 if(mode==='shutdown'){
   const pending=runtime.backupRecovery(request),closing=runtime.close();await assert.rejects(pending,{message:'RECOVERY_RUNTIME_NOT_READY'});await closing;assert.equal(fs.existsSync(file),false);assert.equal(sqlite.sqliteConnection().open,false);console.log('online-proof-ok');process.exit(0);
 }
 if(!['capture','concurrent','overlap-writer'].includes(mode)){
  const originalWrite=fs.writeFileSync;let diskFaultObserved=false;if(mode==='disk-full')fs.writeFileSync=(fd,value,...args)=>{if(typeof fd==='number'&&Buffer.isBuffer(value)&&value.subarray(0,11).toString()==='FO-RECOVERY'){originalWrite(fd,value.subarray(0,8));diskFaultObserved=true;throw Object.assign(new Error('Synthetic disk full'),{code:'ENOSPC'});}return originalWrite(fd,value,...args);};
  try{await assert.rejects(runtime.backupRecovery(request),mode==='disk-full'?{message:'RECOVERY_STORAGE_FULL'}:undefined);if(mode==='disk-full')assert.equal(diskFaultObserved,true);}finally{fs.writeFileSync=originalWrite;}assert.equal(sqlite.sqliteConnection().open,true);assert.equal(runtime.state.phase,'ready');if(mode==='collision')assert.equal(fs.readFileSync(file,'utf8'),'synthetic existing output');else assert.equal(fs.existsSync(request.file),false);
 }else{
  let result;if(mode==='overlap-writer'){const pending=runtime.backupRecovery(request),writer=Promise.resolve().then(()=>store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks.push({id:'overlap-generation',title:'Synthetic overlapping writer'});fs.writeFileSync(media,'synthetic overlapping media');db.setAppSetting('rewardsEnabled','0');db.setAppSetting('geminiApiKey','synthetic-overlapping-setting');}));[result]=await Promise.all([pending,writer]);}else if(mode==='concurrent'){const outcomes=await Promise.allSettled([runtime.backupRecovery(request),runtime.backupRecovery(request)]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);result=outcomes.find(o=>o.status==='fulfilled').value;}else result=await runtime.backupRecovery(request);assert.equal(result.encrypted,true);assert.equal(sqlite.sqliteConnection().open,true);assert.equal(runtime.state.phase,'ready');
  const encrypted=fs.readFileSync(file);assert.ok(!encrypted.includes(Buffer.from('synthetic-online-provider')));const plain=decryptRecovery(encrypted,Buffer.from(key,'hex'));let saved;try{saved=JSON.parse(plain.toString('utf8'));}finally{plain.fill(0);}
  assert.equal(saved.format,'family-organizer-private-env-v1');const snapshot=saved.snapshot;assert.deepEqual(snapshot.legacy.users,beforeUsers);assert.ok(snapshot.legacy.tasks.some(t=>t.id==='online-task'));assert.ok(snapshot.legacy.transactions.some(t=>t.id==='online-finance'));assert.deepEqual(snapshot.tables.app_reward_claims,beforeClaims);assert.equal(snapshot.legacy.rewardLedger.filter(t=>t.points===17).length,1);const generation=snapshot.legacy.tasks.some(t=>t.id==='overlap-generation');assert.equal(snapshot.media['online.bin'],Buffer.from(generation?'synthetic overlapping media':'synthetic online media').toString('base64'));assert.equal(snapshot.settings.rewardsEnabled,generation?'0':'1');assert.equal(saved.privateSettings.values.geminiApiKey,generation?'synthetic-overlapping-setting':'synthetic-online-setting');if(mode==='overlap-writer')assert.ok(sqlite.sqliteLoad().tasks.some(t=>t.id==='overlap-generation'));assert.equal(saved.privateEnv.values.GEMINI_API_KEY,'synthetic-online-provider');assert.equal(saved.privateEnv.values.API_KEY,'synthetic-online-fallback');assert.equal(saved.privateFiles.values.sessionSigningKey,fs.readFileSync(path.join(process.env.CONFIG_DIR,'session_secret.key')).toString('base64'));
  assert.ok(!JSON.stringify(sqlite.sqliteConnection().prepare('SELECT result FROM app_commands').all()).includes('synthetic-online-provider'));assert.deepEqual(sqlite.sqliteConnection().prepare('SELECT * FROM app_reward_claims').all(),beforeClaims);assert.ok(fs.readFileSync(path.join(process.env.DATA_DIR,'db.json')).equals(sourceLegacy));
 }
 store.withAppWriteTransaction(meta(),tx=>tx.legacy.tasks.push({id:'after-online',title:'Synthetic later write'}));assert.ok(sqlite.sqliteLoad().tasks.some(t=>t.id==='after-online'));const address=runtime.server.address();const status=await new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:address.port,path:'/api/ready',agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);});assert.equal(status,200);
 }finally{await runtime.close();}assert.equal(sqlite.sqliteConnection().open,false);console.log('online-proof-ok');`;
 const child=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href,'--input-type=module','--eval',script],{cwd:root,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
 try{const result=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});expect(result.signal,output).toBeNull();expect(result.code,output).toBe(0);expect(output).toContain('online-proof-ok');expect(fs.existsSync(env.FO_NETWORK_ATTEMPTS!)?fs.readFileSync(env.FO_NETWORK_ATTEMPTS!,'utf8'):'').toBe('');}finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});}
}
it.each(['capture','concurrent','overlap-writer'])('captures live WAL rows, claims, media and selected secrets with %s without closing the runtime owner',mode=>scenario(mode),20000);
it.each(['collision','invalid-selection','forbidden-path','invalid-key','disk-full'])('failed online recovery %s preserves service and accepts later writes',mode=>scenario(mode),20000);
it('shutdown fences a pending online backup and drains ownership before SQLite close',()=>scenario('shutdown'),20000);

it('rejects backup after owned shutdown without reopening SQLite',()=>scenario('closed'),20000);
