import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {isDeepStrictEqual} from 'node:util';
const [phase,release,instance,id,port,manifestHash,report]=process.argv.slice(2);
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(path.resolve(process.execPath).toLowerCase(),path.join(release,'bin/node.exe').toLowerCase());
const evidence=fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')):{commitSha:process.env.TEST_COMMIT_SHA,platform:process.platform,architecture:process.arch,checks:[],nativeExitCodes:[]};
const Database=createRequire(path.join(release,'app/package.json'))('better-sqlite3');
function rows(){const db=new Database(path.join(instance,'data/family.db'),{readonly:true});try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all().map(row=>({...row,...(typeof row.data==='string'?{data:JSON.parse(row.data)}:{})}))]));}finally{db.close();}}
const key=randomBytes(32).toString('hex'),file=path.join(path.dirname(instance),'owned-service.fo-recovery');
async function invoke(label,operation,extra=[],input){
 const args=['-NoProfile','-NonInteractive','-File',path.join(release,'ops/Recovery.ps1'),'-Operation',operation,'-ReleaseRoot',release,'-InstanceRoot',instance,'-ServiceId',id,'-Port',port,'-ExpectedManifestSha256',manifestHash,...extra];
 const child=spawn(path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/powershell.exe'),args,{env:{...process.env,PSModulePath:path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/Modules')},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});const closed=once(child,'close');child.stdin.end(input===undefined?undefined:JSON.stringify(input));const timeout=setTimeout(()=>child.kill('SIGKILL'),45000);
 try{const [exitCode,signal]=await closed;assert.equal(signal,null);assert.ok(!(stdout+stderr).includes(key),'recovery wrapper leaked key');evidence.nativeExitCodes.push({phase:label,exitCode});return {exitCode,stdout,stderr};}finally{clearTimeout(timeout);}
}
evidence.completed=false;
try{
 if(phase==='active'){
  for(const operation of ['Backup','Restore']){const result=await invoke('active-'+operation,operation,['-ValidateOnly']);assert.equal(result.exitCode,1);assert.match(result.stdout+result.stderr,/owned service stopped/);}
  evidence.checks.push('owned-recovery-running-service-refused-before-input');
 }else{
  assert.equal(phase,'stopped');const before=rows();
  for(const operation of ['Backup','Restore'])for(const flag of ['-ValidateOnly','-WhatIf']){const result=await invoke(operation+flag,operation,[flag]);assert.equal(result.exitCode,0,result.stdout+result.stderr);assert.ok(isDeepStrictEqual(rows(),before),'validation mutated rows');assert.equal(fs.existsSync(file),false);}
  evidence.checks.push('owned-recovery-validation-whatif-no-input-mutation');
  const input={file,key,includeCredentials:true};const backup=await invoke('encrypted-backup','Backup',[],input);assert.equal(backup.exitCode,0,backup.stdout+backup.stderr);const saved=JSON.parse(backup.stdout.trim().split(/\r?\n/).at(-1)),encrypted=fs.readFileSync(file);assert.equal(saved.sha256,createHash('sha256').update(encrypted).digest('hex'));assert.equal(saved.encrypted,true);assert.ok(!encrypted.includes(Buffer.from(key)));for(const user of before.users)assert.ok(!encrypted.includes(Buffer.from(user.data.passwordHash)));
  evidence.checks.push('owned-recovery-encrypted-backup-external-key');
  const afterBackup=rows(),wrong=await invoke('wrong-key','Restore',[],{...input,key:randomBytes(32).toString('hex')});assert.equal(wrong.exitCode,1);assert.match(wrong.stdout+wrong.stderr,/native exit 1 \(RECOVERY_ENVELOPE_INVALID\)/);assert.ok(isDeepStrictEqual(rows(),afterBackup),'wrong key mutated rows');evidence.checks.push('owned-recovery-wrong-key-no-mutation');
  const restored=await invoke('encrypted-restore','Restore',[],input);assert.equal(restored.exitCode,0,restored.stdout+restored.stderr);const result=JSON.parse(restored.stdout.trim().split(/\r?\n/).at(-1));assert.equal(result.sessionsRevoked,true);const actual=rows();for(const table of ['users','tasks','transactions','reward_ledger','app_reward_claims','app_migrations'])assert.ok(isDeepStrictEqual(actual[table],before[table]),'owned recovery lost business/identity rows');assert.equal((actual.auth_sessions??[]).length,0);assert.ok(fs.readFileSync(file).equals(encrypted));
  evidence.checks.push('owned-recovery-restore-business-ids-session-revocation');evidence.encryptedSha256=saved.sha256;evidence.encryptedBytes=encrypted.length;
 }
 evidence.completed=true;
}finally{fs.writeFileSync(report,JSON.stringify(evidence,null,2)+'\n');}
