// Diagnostic only: compare process-local V8 wall clocks with SQLite's direct OS clock.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline';
export async function collectClockDiagnostics({addonPath,samples=100}){
 assert.ok(Number.isInteger(samples)&&samples>=1&&samples<=100);
 const Database=createRequire(import.meta.url)(addonPath),db=new Database(':memory:'),sql="SELECT CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3)AS INTEGER) AS ms",read=db.prepare(sql);
 const source=`const {createInterface}=require('node:readline'),Database=require(process.argv[1]),db=new Database(':memory:'),read=db.prepare(${JSON.stringify(sql)}),lines=createInterface({input:process.stdin});lines.on('line',raw=>{const index=Number(raw);process.stdout.write(JSON.stringify({index,pid:process.pid,dateMs:Date.now(),sqliteMs:read.get().ms,monotonicNs:process.hrtime.bigint().toString(),performanceMs:performance.timeOrigin+performance.now()})+'\\n');});lines.on('close',()=>db.close());`;
 const env={};for(const name of ['PATH','SystemRoot','SYSTEMROOT','windir','TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
 const child=spawn(process.execPath,['--eval',source,addonPath],{env,stdio:['pipe','pipe','pipe']}),done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(exitCode,signal)=>resolve({exitCode,signal}));}),lines=createInterface({input:child.stdout}),iterator=lines[Symbol.asyncIterator]();let stderr='';child.stderr.on('data',part=>stderr+=String(part));child.stdin.on('error',()=>{});const timer=setTimeout(()=>child.kill('SIGKILL'),5000),observations=[];
 try{
  for(let index=0;index<samples;index++){const before={dateMs:Date.now(),sqliteMs:read.get().ms,monotonicNs:process.hrtime.bigint().toString(),performanceMs:performance.timeOrigin+performance.now()};child.stdin.write(index+'\n');const line=await iterator.next(),after={dateMs:Date.now(),sqliteMs:read.get().ms,monotonicNs:process.hrtime.bigint().toString(),performanceMs:performance.timeOrigin+performance.now()};assert.equal(line.done,false);const sample=JSON.parse(line.value);assert.equal(sample.index,index);assert.notEqual(sample.pid,process.pid);observations.push({index,parentPid:process.pid,before,child:sample,after});}
  child.stdin.end();const exit=await done;assert.deepEqual(exit,{exitCode:0,signal:null},stderr);return {format:1,platform:process.platform,nodeVersion:process.version,samples,exit,observations,dateIntervalViolations:observations.filter(o=>o.child.dateMs<o.before.dateMs||o.child.dateMs>o.after.dateMs).length,sqliteIntervalViolations:observations.filter(o=>o.child.sqliteMs<o.before.sqliteMs||o.child.sqliteMs>o.after.sqliteMs).length,monotonicIntervalViolations:observations.filter(o=>BigInt(o.child.monotonicNs)<BigInt(o.before.monotonicNs)||BigInt(o.child.monotonicNs)>BigInt(o.after.monotonicNs)).length};
 }finally{clearTimeout(timer);lines.close();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await done;db.close();}
}
/** Validate every untrusted observation; known V8 offsets are reported, never
 * treated as native OS/monotonic clock successes. */
export function validateClockDiagnostics(value){
 try{
  assert.equal(value?.format,1);assert.equal(value.platform,'win32');assert.equal(value.nodeVersion,'v24.21.0');assert.equal(value.samples,100);assert.deepEqual(value.exit,{exitCode:0,signal:null});assert.equal(value.observations.length,100);let date=0,sqlite=0,monotonic=0;
  const integer=n=>{assert.ok(Number.isSafeInteger(n)&&n>=0);},ticks=n=>{assert.match(n,/^[0-9]{1,32}$/);return BigInt(n);};let parentPid,childPid;
  for(let index=0;index<100;index++){const o=value.observations[index];assert.equal(o.index,index);assert.equal(o.child.index,index);integer(o.parentPid);integer(o.child.pid);assert.ok(o.parentPid>0&&o.child.pid>0&&o.parentPid!==o.child.pid);parentPid??=o.parentPid;childPid??=o.child.pid;assert.equal(o.parentPid,parentPid);assert.equal(o.child.pid,childPid);
   for(const sample of [o.before,o.child,o.after]){integer(sample.dateMs);integer(sample.sqliteMs);assert.ok(Number.isFinite(sample.performanceMs));ticks(sample.monotonicNs);}
   if(o.child.dateMs<o.before.dateMs||o.child.dateMs>o.after.dateMs)date++;
   if(o.child.sqliteMs<o.before.sqliteMs||o.child.sqliteMs>o.after.sqliteMs)sqlite++;
   if(ticks(o.child.monotonicNs)<ticks(o.before.monotonicNs)||ticks(o.child.monotonicNs)>ticks(o.after.monotonicNs))monotonic++;
  }
  assert.equal(value.dateIntervalViolations,date);assert.equal(value.sqliteIntervalViolations,sqlite);assert.equal(value.monotonicIntervalViolations,monotonic);assert.equal(sqlite,0);assert.equal(monotonic,0);return [];
 }catch{return ['native clock diagnostic identity/observations/exit mismatch'];}
}
