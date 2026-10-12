// Synthetic consumer harness only, never shipped as an application entry.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const chunks=[];let size=0;
process.stdin.on('data',chunk=>{size+=chunk.length;if(size>16384)throw new Error('Synthetic input limit');chunks.push(chunk);});
process.stdin.on('end',()=>{void probe().catch(error=>{console.error('ONLINE_RECOVERY_PROBE_FAILED');for(const line of String(error?.stack??'').split('\n').slice(1,9))if(/^\s+at /.test(line))console.error(line);process.exit(1);});});
async function probe(){
 const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));for(const bytes of chunks)bytes.fill(0);
 const application= require(path.join(process.env.APP_CODE_ROOT,'dist/server.cjs')).application;
 const runtime=await application;assert.equal(runtime.state.phase,'ready');
 const port=runtime.server.address().port,checks=[];
 function call(endpoint,body,token){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:endpoint,method:body?'POST':'GET',agent:false,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});req.setTimeout(3000,()=>req.destroy(new Error('Synthetic HTTP timeout')));req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
 let capturedTaskId,lateTaskId;
 try{
  assert.equal((await call('/api/ready')).status,200);
  const login=await call('/api/auth/login',{username:'package-admin',password:'Synthetic explicit package reentry passphrase'});assert.equal(login.status,200);const token=login.body.token;
  const task=await call('/api/tasks',{title:'Synthetic online WAL task',assigneeId:'package-admin',status:'todo',rewardPoints:0},token);assert.equal(task.status,200);capturedTaskId=task.body.task.id;
  assert.ok(fs.statSync(path.join(process.env.DATA_DIR,'family.db-wal')).size>0);
  console.log('ONLINE_RECOVERY_STAGE:capture');const result=await runtime.backupRecovery(input.request);assert.equal(result.encrypted,true);assert.deepEqual(result.includedEnv,['gemini']);assert.equal(runtime.state.phase,'ready');checks.push('compiled-online-live-wal-selected-secrets-encrypted');
  const encrypted=fs.readFileSync(input.request.file);
  await assert.rejects(runtime.backupRecovery(input.request));assert.ok(fs.readFileSync(input.request.file).equals(encrypted));
  await assert.rejects(runtime.backupRecovery({...input.request,includeEnv:['NODE_OPTIONS']}));assert.equal(runtime.state.phase,'ready');checks.push('compiled-online-failed-capture-keeps-runtime-and-prior-output');
  console.log('ONLINE_RECOVERY_STAGE:denied-output');await assert.rejects(runtime.backupRecovery({...input.request,file:input.deniedFile}));assert.equal(fs.existsSync(input.deniedFile),false);assert.equal(runtime.state.phase,'ready');checks.push('compiled-online-native-denied-output-keeps-runtime');
  const collision={...input.request,file:input.concurrentFile};const outcomes=await Promise.allSettled([runtime.backupRecovery(collision),runtime.backupRecovery(collision)]);assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(outcomes.filter(item=>item.status==='rejected').length,1);checks.push('compiled-online-concurrent-exclusive-publication');
  const later=await call('/api/tasks',{title:'Synthetic later online write',assigneeId:'package-admin',status:'todo',rewardPoints:0},token);assert.equal(later.status,200);lateTaskId=later.body.task.id;assert.equal((await call('/api/ready')).status,200);checks.push('compiled-online-later-http-write-owner-retained');
  console.log('ONLINE_RECOVERY_STAGE:shutdown');const pending=runtime.backupRecovery({...input.request,file:input.shutdownFile}),closing=runtime.close();await assert.rejects(pending,{message:'RECOVERY_RUNTIME_NOT_READY'});await closing;assert.equal(fs.existsSync(input.shutdownFile),false);assert.equal(runtime.state.phase,'stopped');checks.push('compiled-online-shutdown-fence-drained');
 }finally{await runtime.close();}
 await assert.rejects(runtime.backupRecovery(input.request),{message:'RECOVERY_RUNTIME_NOT_READY'});
 console.log('ONLINE_RECOVERY_REPORT:'+JSON.stringify({capturedTaskId,lateTaskId,checks}));process.exit(0);
}
