// Diagnostic observations only. Required unit/native acceptance checks stay separate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.match(process.env.TEST_COMMIT_SHA,/^[a-f0-9]{40}$/);
const report=process.argv[2];assert.equal(report,'reports/file-publication-native.json');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo publication diagnostic ')),cases=[];
const observe=work=>{try{return {value:work()};}catch(error){return {errorCode:error.code??'UNKNOWN',syscall:error.syscall??null};}};
const stat=work=>observe(()=>{const s=work();return Object.fromEntries(['dev','ino','nlink','size','mtimeNs','ctimeNs'].map(key=>[key,s[key].toString()]));});
try{
 for(const method of ['node-rename-replace','dotnet-replace-remove-backup']){
  const directory=path.join(root,method);fs.mkdirSync(directory);const fixed=path.join(directory,'control.json'),staged=path.join(directory,'staged.json'),backup=path.join(directory,'previous.json');
  fs.writeFileSync(fixed,'held');fs.writeFileSync(staged,'approve');const fd=fs.openSync(fixed,'r');let closed=false;
  try{
   const before=stat(()=>fs.fstatSync(fd,{bigint:true})),bytes=Buffer.alloc(4);assert.equal(fs.readSync(fd,bytes,0,4,null),4);assert.equal(bytes.toString(),'held');
   let operation;
   if(method==='node-rename-replace')operation=observe(()=>{fs.renameSync(staged,fixed);return 'completed';});
   else{
    const env={};for(const key of ['SystemRoot','windir','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];Object.assign(env,{FO_PUBLICATION_STAGED:staged,FO_PUBLICATION_FIXED:fixed,FO_PUBLICATION_BACKUP:backup});
    const child=spawnSync(path.join(process.env.windir,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command','$ErrorActionPreference="Stop"; [IO.File]::Replace($env:FO_PUBLICATION_STAGED,$env:FO_PUBLICATION_FIXED,$env:FO_PUBLICATION_BACKUP); Remove-Item -LiteralPath $env:FO_PUBLICATION_BACKUP -Force; exit 0'],{env,encoding:'utf8',timeout:10000,maxBuffer:16384});
    assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.ok(Number.isInteger(child.status));operation={nativeExitCode:child.status};
   }
   const extra=observe(()=>fs.readSync(fd,Buffer.alloc(1),0,1,null)),after=stat(()=>fs.fstatSync(fd,{bigint:true})),fixedStat=stat(()=>fs.lstatSync(fixed,{bigint:true})),fixedText=observe(()=>fs.readFileSync(fixed,'utf8'));
   fs.closeSync(fd);closed=true;cases.push({method,before,operation,extra,after,fixedStat,fixedText,descriptorClosed:true});
  }finally{if(!closed)fs.closeSync(fd);}
 }
}finally{fs.rmSync(root,{recursive:true,force:true});}
assert.equal(fs.existsSync(root),false);assert.equal(cases.length,2);
fs.mkdirSync('reports',{recursive:true});fs.writeFileSync(report,JSON.stringify({format:1,diagnosticOnly:true,commitSha:process.env.TEST_COMMIT_SHA,nodeVersion:process.version,platform:process.platform,architecture:process.arch,cases,fixtureCleanup:true},null,2)+'\n');
console.log('FILE_PUBLICATION_DIAGNOSTICS_COLLECTED_NOT_ACCEPTANCE');
