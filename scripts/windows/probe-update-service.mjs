import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const [phase,release,instance,id,port,manifestHash,report]=process.argv.slice(2);
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(path.resolve(process.execPath).toLowerCase(),path.join(release,'bin/node.exe').toLowerCase());
const evidence=fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')):{commitSha:process.env.TEST_COMMIT_SHA,platform:process.platform,architecture:process.arch,checks:[],nativeExitCodes:[]};evidence.completed=false;
const controlFile=path.join(instance,'config/update-control.json'),common=path.join(release,'ops/ServiceCommon.ps1'),powershell=path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/powershell.exe'),modules=path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/Modules'),quote=value=>"'"+value.replaceAll("'","''")+"'",Database=createRequire(path.join(release,'app/package.json'))('better-sqlite3');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function inspect(){const db=new Database(path.join(instance,'data/family.db'),{readonly:true});try{const business=Object.fromEntries(['users','tasks','transactions','reward_ledger','app_reward_claims','app_migrations'].map(name=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all().map(row=>({...row,...(typeof row.data==='string'?{data:JSON.parse(row.data)}:{})}))]));return {businessSha256:digest(business),jobsSha256:digest(db.prepare('SELECT * FROM app_jobs ORDER BY id').all()),opened:db.prepare('SELECT value FROM app_meta WHERE key=?').get('update_writes_opened:'+evidence.operationId),commandCount:db.prepare('SELECT COUNT(*) AS total FROM app_commands WHERE command=? AND request_id=?').get('core:update:open-writes',evidence.operationId).total,integrity:db.pragma('integrity_check',{simple:true}),pointClaimCount:db.prepare('SELECT COUNT(*) AS total FROM app_reward_claims WHERE claim_id=?').get('synthetic-scheduled-claim').total};}finally{db.close();}}
async function run(label,command){const child=spawn(powershell,['-NoProfile','-NonInteractive','-Command',`. ${quote(common)}; ${command}`],{env:{...process.env,PSModulePath:modules},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);const closed=once(child,'close'),timer=setTimeout(()=>child.kill('SIGKILL'),45000);try{const [exitCode,signal]=await closed;evidence.nativeExitCodes.push({phase:label,exitCode});assert.equal(signal,null,output);assert.equal(exitCode,0,output);}finally{clearTimeout(timer);}}
const call=(endpoint,body)=>new Promise((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port:Number(port),path:endpoint,method:body?'POST':'GET',agent:false,headers:{'Content-Type':'application/json'}},res=>{let text='';res.on('data',v=>text+=v);res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});request.setTimeout(2000,()=>request.destroy(new Error('Update fixture HTTP timeout')));request.on('error',reject);request.end(body?JSON.stringify(body):undefined);});
try{
 if(phase==='configure-held'||phase==='configure-approve'){
  const control={format:1,operationId:randomUUID(),manifestSha256:manifestHash,phase:'held'};evidence.operationId=control.operationId;fs.writeFileSync(controlFile,JSON.stringify(control));
  await run('update-'+phase+'-seal',`Assert-RecoveryCopyAncestors ${quote(path.join(instance,'config'))}; Set-OwnedServiceAcl ${quote(controlFile)} ${quote(id)} 'R'; Assert-BackupSecretAcl ${quote(controlFile)} ${quote(id)}`);
  await run('update-'+phase+'-reinstall',`& ${quote(path.join(release,'ops/Install-Service.ps1'))} -ReleaseRoot ${quote(release)} -InstanceRoot ${quote(instance)} -ServiceId ${quote(id)} -Port ${port} -ExpectedManifestSha256 ${quote(manifestHash)}`);
  await run('update-'+phase+'-reinstall-acl',`Assert-BackupSecretAcl ${quote(controlFile)} ${quote(id)}`);
  assert.deepEqual(JSON.parse(fs.readFileSync(controlFile,'utf8')),control);const before=inspect();assert.equal(before.opened,undefined);assert.equal(before.commandCount,0);assert.equal(before.integrity,'ok');assert.equal(before.pointClaimCount,1);evidence.businessSha256=before.businessSha256;evidence.jobsSha256=before.jobsSha256;
  if(phase==='configure-held')evidence.checks.push('owned-update-fixed-control-private-reader-reinstall-preserved');
 }else if(phase==='held'||phase==='approve'){
  const deadline=Date.now()+15000;let live;while(Date.now()<deadline){try{live=await call('/api/health');if(live.status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(live?.status,200);assert.equal(live.body.ok,true);assert.deepEqual((await call('/api/ready')).body,{ready:false,phase:'starting'});assert.equal((await call('/api/auth/login',{username:'service-admin',password:'synthetic-service-only-password'})).status,503);assert.equal((await call('/api/tasks',{title:'Synthetic blocked update write'})).status,503);
  const current=inspect();assert.equal(current.businessSha256,evidence.businessSha256);assert.equal(current.jobsSha256,evidence.jobsSha256);assert.equal(current.opened,undefined);assert.equal(current.commandCount,0);evidence.checks.push(phase==='held'?'owned-update-held-http-jobs-no-writes-open':'owned-update-new-attempt-held-before-approval');
  if(phase==='approve'){
   const staged=path.join(instance,'config/update-control.staged.json'),old=path.join(instance,'config/update-control.previous.json'),control=JSON.parse(fs.readFileSync(controlFile,'utf8'));fs.writeFileSync(staged,JSON.stringify({...control,phase:'approve'}));
   await run('update-approve-publish',`Set-OwnedServiceAcl ${quote(staged)} ${quote(id)} 'R'; [IO.File]::Replace(${quote(staged)},${quote(controlFile)},${quote(old)}); Assert-BackupSecretAcl ${quote(controlFile)} ${quote(id)}; Remove-Item -LiteralPath ${quote(old)} -Force`);
  }
 }else if(phase==='stopped-held'){
  const current=inspect();assert.equal(current.businessSha256,evidence.businessSha256);assert.equal(current.opened,undefined);assert.equal(current.commandCount,0);assert.equal(current.integrity,'ok');evidence.checks.push('owned-update-held-stop-graceful-closed-storage');
 }else{
  assert.equal(phase,'ready');const deadline=Date.now()+15000;let ready;while(Date.now()<deadline){ready=await call('/api/ready');if(ready.status===200)break;await new Promise(r=>setTimeout(r,100));}assert.equal(ready.status,200);const current=inspect();assert.deepEqual(JSON.parse(current.opened.value),{format:1,operationId:evidence.operationId,manifestSha256:manifestHash,writesMayOpen:true});assert.equal(current.commandCount,1);assert.equal(current.businessSha256,evidence.businessSha256);assert.equal(current.pointClaimCount,1);assert.equal(current.integrity,'ok');const login=await call('/api/auth/login',{username:'service-admin',password:'synthetic-service-only-password'});assert.equal(login.status,200);assert.ok(login.body.token);evidence.writesMayOpen=true;evidence.checks.push('owned-update-approved-health-smoke-durable-boundary-before-ready');
 }
 evidence.completed=true;
}finally{fs.writeFileSync(report,JSON.stringify(evidence,null,2)+'\n');}
