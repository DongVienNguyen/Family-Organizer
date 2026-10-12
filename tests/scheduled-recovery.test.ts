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
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo schedule synthetic ')),data=path.join(root,'data'),config=path.join(root,'config'),backupRoot=path.join(root,'backups'),keyFile=path.join(config,'recovery-backup.key');writeSyntheticInstallation(data);fs.mkdirSync(config);fs.mkdirSync(backupRoot);fs.writeFileSync(path.join(config,'.env'),'GEMINI_API_KEY=synthetic-scheduled-provider\n');const key=Buffer.alloc(32,17);if(mode!=='missing-key')fs.writeFileSync(keyFile,key);
 const settings:any={format:1,enabled:true,backupRoot,keyFile,includeCredentials:true,includeSettings:[],includeFiles:['sessionSigningKey'],includeEnv:['gemini']};if(mode==='invalid-config')settings.key='never allowed in config';if(mode!=='disabled')fs.writeFileSync(path.join(config,'recovery-backup.json'),JSON.stringify(settings));
 const env:NodeJS.ProcessEnv={};for(const name of ['PATH','SystemRoot','windir','TEMP','TMP','HOME','USERPROFILE'])if(process.env[name])env[name]=process.env[name];Object.assign(env,{NODE_ENV:'production',DATA_DIR:data,CONFIG_DIR:config,LOG_DIR:path.join(root,'logs'),PORT:'0',FO_NETWORK_ATTEMPTS:path.join(root,'network.jsonl')});
 const script=`import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
 const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication(),mode=${JSON.stringify(mode)},backupRoot=${JSON.stringify(backupRoot)};const sqlite=await import(${moduleUrl('sqlite')}),store=await import(${moduleUrl('appStore')});
 try{
 if(mode==='capture'){
  const deadline=Date.now()+2500;while(Date.now()<deadline&&!fs.readdirSync(backupRoot).some(name=>name.endsWith('.fo-recovery')))await new Promise(r=>setTimeout(r,25));const files=fs.readdirSync(backupRoot);assert.equal(files.length,1,'Scheduled encrypted capture missing');const encrypted=fs.readFileSync(path.join(backupRoot,files[0]));assert.ok(!encrypted.includes(Buffer.from('synthetic-scheduled-provider')));assert.ok(!encrypted.includes(Buffer.alloc(32,17)));const health=runtime.backupHealth();assert.equal(health.status,'ok');assert.ok(Number.isSafeInteger(health.lastSuccessAt));assert.equal(health.diskFull,false);
  const payload=JSON.stringify(sqlite.sqliteConnection().prepare("SELECT payload FROM app_jobs WHERE namespace='core-recovery'").all());assert.ok(!payload.includes(Buffer.alloc(32,17).toString('hex')));const metadata=JSON.stringify(sqlite.sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='recovery_backup_last_success'").get());assert.ok(!metadata.includes('synthetic-scheduled-provider'));assert.ok(!metadata.includes(Buffer.alloc(32,17).toString('hex')));
 }else if(mode==='disabled'){assert.deepEqual(runtime.backupHealth(),{enabled:false,status:'disabled',lastSuccessAt:null,ageMs:null,diskFull:false,lastError:null});assert.equal(fs.readdirSync(backupRoot).length,0);}
 else{await new Promise(r=>setTimeout(r,100));assert.equal(runtime.backupHealth().status,'failed');assert.equal(runtime.backupHealth().lastError,mode==='invalid-config'?'RECOVERY_BACKUP_CONFIG_INVALID':'RECOVERY_BACKUP_KEY_INVALID');assert.equal(fs.readdirSync(backupRoot).length,0);}
 assert.equal(runtime.state.phase,'ready');assert.equal(sqlite.sqliteConnection().open,true);store.withAppWriteTransaction({actorId:'user_admin',command:'synthetic:after-schedule',requestId:randomUUID(),payloadHash:'synthetic'},tx=>tx.legacy.tasks.push({id:'after-schedule',title:'Synthetic later scheduled write'}));assert.ok(sqlite.sqliteLoad().tasks.some(t=>t.id==='after-schedule'));assert.ok(!JSON.stringify(runtime.backupHealth()).includes(backupRoot));assert.ok(!JSON.stringify(runtime.backupHealth()).includes(process.env.CONFIG_DIR));
 }finally{await runtime.close();}assert.equal(sqlite.sqliteConnection().open,false);console.log('scheduled-proof-ok');`;
 const child=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href,'--input-type=module','--eval',script],{cwd:root,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
 try{const result=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});expect(result.signal,output).toBeNull();expect(result.code,output).toBe(0);expect(output).toContain('scheduled-proof-ok');expect(fs.existsSync(env.FO_NETWORK_ATTEMPTS!)?fs.readFileSync(env.FO_NETWORK_ATTEMPTS!,'utf8'):'').toBe('');}finally{clearTimeout(timer);key.fill(0);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});}
}
it.each(['capture','disabled','invalid-config','missing-key'])('managed startup backup schedule %s preserves readiness and storage owner',mode=>scenario(mode),20000);
