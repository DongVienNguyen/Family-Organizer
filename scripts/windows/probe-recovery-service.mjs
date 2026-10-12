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
function launch(label,operation,extra=[],credential=false){
 const args=['-NoProfile','-NonInteractive','-File',path.join(release,credential?'ops/Reset-Credentials.ps1':'ops/Recovery.ps1'),...(credential?[]:['-Operation',operation]),'-ReleaseRoot',release,'-InstanceRoot',instance,'-ServiceId',id,'-Port',port,'-ExpectedManifestSha256',manifestHash,...extra];
 const child=spawn(path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/powershell.exe'),args,{env:{...process.env,PSModulePath:path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/Modules')},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});const closed=once(child,'close');const timeout=setTimeout(()=>child.kill('SIGKILL'),45000);
 const done=(async()=>{try{const [exitCode,signal]=await closed;assert.equal(signal,null);assert.ok(!(stdout+stderr).includes(key),'recovery wrapper leaked key');evidence.nativeExitCodes.push({phase:label,exitCode});return {exitCode,stdout,stderr};}finally{clearTimeout(timeout);}})();
 return {child,done};
}
async function invoke(label,operation,extra=[],input,credential=false){const task=launch(label,operation,extra,credential);task.child.stdin.end(input===undefined?undefined:JSON.stringify(input));return task.done;}
async function lockProbe(){
 const child=spawn(path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command','try { $h=[IO.File]::Open($env:FO_TEST_LOCK_MARKER,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read); $h.Dispose(); exit 0 } catch [IO.IOException] { exit 1 }'],{env:{...process.env,FO_TEST_LOCK_MARKER:path.join(instance,'service/installation.json')},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const closed=once(child,'close');const timeout=setTimeout(()=>child.kill('SIGKILL'),5000);
 try{const [exitCode,signal]=await closed;assert.equal(signal,null);assert.ok([0,1].includes(exitCode),'lock probe failed');(evidence.operationLockProbes??=[]).push(exitCode);return exitCode;}finally{clearTimeout(timeout);}
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
  const input={file,key,includeCredentials:true};assert.equal(await lockProbe(),0,'lock positive control failed');
  const first=launch('encrypted-backup','Backup');let backup;
  try{
   const deadline=Date.now()+8000;let locked=false;while(Date.now()<deadline){if(await lockProbe()===1){locked=true;break;}}
   assert.equal(locked,true,'owned recovery did not hold an exclusive operation lock before stdin');
   const journal=path.join(instance,'data/restore-journal.json');assert.equal(fs.existsSync(journal),false);const journalBytes=Buffer.from('synthetic pending journal must remain untouched');fs.writeFileSync(journal,journalBytes);
   try{
    for(const operation of ['Backup','Restore']){const denied=await invoke('overlap-'+operation,operation,[],input);assert.equal(denied.exitCode,1);assert.match(denied.stdout+denied.stderr,/Owned operator operation already active/);assert.ok(fs.readFileSync(journal).equals(journalBytes));assert.ok(isDeepStrictEqual(rows(),before),'overlap changed rows');assert.equal(fs.existsSync(file),false);}
    const denied=await invoke('overlap-Reset','',[],undefined,true);assert.equal(denied.exitCode,1);assert.match(denied.stdout+denied.stderr,/Owned operator operation already active/);assert.ok(fs.readFileSync(journal).equals(journalBytes));assert.ok(isDeepStrictEqual(rows(),before),'reset overlap changed rows');
   }finally{assert.ok(fs.readFileSync(journal).equals(journalBytes));fs.unlinkSync(journal);}
   evidence.checks.push('owned-recovery-operation-lock-overlap-no-journal-mutation');first.child.stdin.end(JSON.stringify(input));backup=await first.done;
  }finally{if(first.child.exitCode===null&&first.child.signalCode===null){first.child.stdin.end();await first.done;}}
  assert.equal(await lockProbe(),0,'owned operation retained its lock');
assert.equal(backup.exitCode,0,backup.stdout+backup.stderr);const saved=JSON.parse(backup.stdout.trim().split(/\r?\n/).at(-1)),encrypted=fs.readFileSync(file);assert.equal(saved.sha256,createHash('sha256').update(encrypted).digest('hex'));assert.equal(saved.encrypted,true);assert.ok(!encrypted.includes(Buffer.from(key)));for(const user of before.users)assert.ok(!encrypted.includes(Buffer.from(user.data.passwordHash)));
  evidence.checks.push('owned-recovery-encrypted-backup-external-key');
  const afterBackup=rows(),wrong=await invoke('wrong-key','Restore',[],{...input,key:randomBytes(32).toString('hex')});assert.equal(wrong.exitCode,1);assert.match(wrong.stdout+wrong.stderr,/native exit 1 \(RECOVERY_ENVELOPE_INVALID\)/);assert.ok(isDeepStrictEqual(rows(),afterBackup),'wrong key mutated rows');evidence.checks.push('owned-recovery-wrong-key-no-mutation');
  const restored=await invoke('encrypted-restore','Restore',[],input);assert.equal(restored.exitCode,0,restored.stdout+restored.stderr);const result=JSON.parse(restored.stdout.trim().split(/\r?\n/).at(-1));assert.equal(result.sessionsRevoked,true);const actual=rows();for(const table of ['users','tasks','transactions','reward_ledger','app_reward_claims','app_migrations'])assert.ok(isDeepStrictEqual(actual[table],before[table]),'owned recovery lost business/identity rows');assert.equal((actual.auth_sessions??[]).length,0);assert.ok(fs.readFileSync(file).equals(encrypted));assert.equal(await lockProbe(),0,'restore retained its lock');
  evidence.checks.push('owned-recovery-restore-business-ids-session-revocation');evidence.encryptedSha256=saved.sha256;evidence.encryptedBytes=encrypted.length;
 }
 evidence.completed=true;
}finally{fs.writeFileSync(report,JSON.stringify(evidence,null,2)+'\n');}
