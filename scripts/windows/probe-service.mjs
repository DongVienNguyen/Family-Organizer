import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {createRequire} from 'node:module';
const [phase,release,instance,portText,report]=process.argv.slice(2);
const port=Number(portText),data=path.join(instance,'data');
const password='synthetic-service-only-password',salt='synthetic-service-only-salt';
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(data,'db.json'))).digest('hex');
const request=(endpoint,body,token)=>new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path:endpoint,method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})}},res=>{const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>1024*1024)res.destroy(new Error('Response too large'));else chunks.push(chunk);});res.once('error',reject);res.once('end',()=>{try{resolve({status:res.statusCode,json:JSON.parse(Buffer.concat(chunks).toString())});}catch(e){reject(e);}});});req.setTimeout(3000,()=>req.destroy(new Error('Service HTTP timeout')));req.once('error',reject);req.end(body?JSON.stringify(body):undefined);
});
let evidence=fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')):{commitSha:process.env.TEST_COMMIT_SHA,nodeVersion:process.version,platform:process.platform,architecture:process.arch,checks:[]};
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.version,'v24.21.0');
assert.equal(path.resolve(process.execPath).toLowerCase(),path.join(release,'bin/node.exe').toLowerCase());
if(phase==='seed'){
 assert.equal(fs.existsSync(path.join(data,'family.db')),false);assert.equal(fs.existsSync(path.join(data,'db.json')),false);
 fs.writeFileSync(path.join(data,'db.json'),JSON.stringify({users:[{id:'service-admin',username:'service-admin',fullName:'Synthetic service admin',role:'admin',passwordHash:salt+'$'+crypto.pbkdf2Sync(password,salt,120000,64,'sha512').toString('hex')}],tasks:[{id:'service-legacy',title:'Synthetic retained task',creatorId:'service-admin',assigneeId:'service-admin',isShared:false,status:'todo'}],pushSubscriptions:[]}));
 evidence.legacySourceSha256=hash();evidence.checks.push('synthetic-offline-fixture');
}else if(phase==='closed'){
 const Database=createRequire(path.join(release,'app/package.json'))('better-sqlite3'),db=new Database(path.join(data,'family.db'),{readonly:true});try{assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.equal(hash(),evidence.legacySourceSha256);}finally{db.close();}evidence.checks.push('closed-database-integrity');
}else{
 const login=await request('/api/auth/login',{username:'service-admin',password});assert.equal(login.status,200);const token=login.json.token;
 assert.ok((await request('/api/tasks',undefined,token)).json.tasks.some(task=>task.id==='service-legacy'));
 assert.equal(hash(),evidence.legacySourceSha256);
 if(phase==='first'){
  const result=await request('/api/finance',{type:'expense',amount:321,description:'Synthetic Windows service',date:'2026-10-12',category:'other'},token);assert.equal(result.status,200);evidence.financeId=result.json.transaction.id;evidence.checks.push('service-finance-write');
 }else{
  assert.equal((await request('/api/finance',undefined,token)).json.transactions.find(row=>row.id===evidence.financeId).amount,321);evidence.checks.push(phase==='restarted'?'service-restart-persistence':'service-crash-recovery-persistence');
 }
}
fs.writeFileSync(report,JSON.stringify(evidence,null,2)+'\n');
