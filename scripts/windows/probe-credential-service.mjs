import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
const [phase,release,instance,id,port,manifestHash,report]=process.argv.slice(2);
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
assert.equal(path.resolve(process.execPath).toLowerCase(),path.join(release,'bin/node.exe').toLowerCase());
const password='synthetic-service-only-password',database=path.join(instance,'data/family.db');
const evidence=fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')):{commitSha:process.env.TEST_COMMIT_SHA,platform:process.platform,architecture:process.arch,checks:[],nativeExitCodes:[]};
const args=['-NoProfile','-NonInteractive','-File',path.join(release,'ops/Reset-Credentials.ps1'),'-ReleaseRoot',release,'-InstanceRoot',instance,'-ServiceId',id,'-Port',port,'-ExpectedManifestSha256',manifestHash];
// pwsh7->Node->powershell5 bypasses pwsh's native PowerShell compatibility
// handling. Use the Windows Desktop module root, never inherited Core modules.
const desktopModules=path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/Modules');
async function runPowerShell(label,arguments_,value){
 const child=spawn(path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/powershell.exe'),arguments_,{env:{...process.env,PSModulePath:desktopModules},stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});child.stdin.on('error',()=>{});
 const closed=once(child,'close');child.stdin.end(value===undefined?undefined:JSON.stringify(value));
 const timer=setTimeout(()=>child.kill('SIGKILL'),45000);
 try{const [exitCode,signal]=await closed;assert.equal(signal,null);assert.ok(!(stdout+stderr).includes(password));evidence.nativeExitCodes.push({phase:label,exitCode});return {exitCode,stdout,stderr};}finally{clearTimeout(timer);}
}
const invoke=(label,extra=[],value)=>runPowerShell(label,args.concat(extra),value);
const Database=createRequire(path.join(release,'app/package.json'))('better-sqlite3');
function rows(){const db=new Database(database,{readonly:true});try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));}finally{db.close();}}
if(phase==='active'){
 const host=await runPowerShell('desktop-host-validation',['-NoProfile','-NonInteractive','-Command','$ErrorActionPreference="Stop"; $command=Get-Command Get-Acl; $manifest=Get-Module -ListAvailable -Name Microsoft.PowerShell.Security | Select-Object -First 1; @{major=$PSVersionTable.PSVersion.Major;edition=$PSVersionTable.PSEdition;securityModulePath=$manifest.Path;commandModule=$command.ModuleName} | ConvertTo-Json -Compress']);
 assert.equal(host.exitCode,0,host.stdout+host.stderr);evidence.powershellHost=JSON.parse(host.stdout.trim());
 assert.equal(evidence.powershellHost.major,5);assert.equal(evidence.powershellHost.edition,'Desktop');assert.equal(evidence.powershellHost.commandModule,'Microsoft.PowerShell.Security');assert.ok(evidence.powershellHost.securityModulePath.toLowerCase().startsWith((desktopModules+path.sep).toLowerCase()));
 evidence.checks.push('windows-desktop-host-security-module-validated');
 const result=await invoke('active-refusal',['-ValidateOnly']);assert.equal(result.exitCode,1);assert.match(result.stderr+result.stdout,/owned service stopped/);evidence.checks.push('running-service-refused-before-input');
}else{
 assert.equal(phase,'stopped');const beforeValidation=rows();
 for(const flag of ['-ValidateOnly','-WhatIf']){const result=await invoke(flag);assert.equal(result.exitCode,0,result.stdout+result.stderr);assert.deepEqual(rows(),beforeValidation);}
 evidence.checks.push('validation-whatif-no-input-no-mutation');
 const db=new Database(database);try{const user=JSON.parse(db.prepare('SELECT data FROM users WHERE id=?').get('service-admin').data);delete user.passwordHash;db.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(user),user.id);db.pragma('wal_checkpoint(TRUNCATE)');}finally{db.close();}
 const before=rows(),userBefore=JSON.parse(before.users[0].data);
 const invalid=await invoke('invalid-batch',[],{users:[{id:'service-admin',password},{id:'missing-user',password}]});assert.equal(invalid.exitCode,1);assert.deepEqual(rows(),before);evidence.checks.push('invalid-batch-atomic-no-secret-output');
 const valid=await invoke('credential-reentry',[],{users:[{id:'service-admin',password}]});assert.equal(valid.exitCode,0,valid.stdout+valid.stderr);
 const lines=valid.stdout.trim().split(/\r?\n/),result=JSON.parse(lines.at(-1));assert.deepEqual(result,{resetUserIds:['service-admin'],sessionsRevoked:true});
 const after=rows(),userAfter=JSON.parse(after.users[0].data),{passwordHash,...safe}=userAfter;assert.match(passwordHash,/^[a-f0-9]+\$[a-f0-9]+$/);assert.deepEqual(safe,userBefore);
 for(const [table,values] of Object.entries(before))if(!['users','app_commands','auth_sessions','auth_user_versions'].includes(table))assert.deepEqual(after[table],values);
 assert.ok(!JSON.stringify(after).includes(password));evidence.checks.push('owned-compiled-operator-reentry-preserves-ids-roles-business');
}
fs.writeFileSync(report,JSON.stringify(evidence,null,2)+'\n');
