import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const [app,fixture,cwd,report]=process.argv.slice(2);
const data=path.join(fixture,'functional dữ liệu'),config=path.join(fixture,'functional config'),logs=path.join(fixture,'functional logs');
for(const root of [data,config,logs])fs.mkdirSync(root,{recursive:true});
const password='synthetic-package-only-password',salt='synthetic-package-only-salt';
const user={id:'package-admin',username:'package-admin',fullName:'Synthetic package admin',role:'admin',passwordHash:salt+'$'+crypto.pbkdf2Sync(password,salt,120000,64,'sha512').toString('hex')};
const rewardChild={...user,id:'package-child',username:'package-child',fullName:'Synthetic package child',role:'child'};
const legacy={users:[user,rewardChild],tasks:[{id:'migration-task',title:'Synthetic migrated task',creatorId:user.id,assigneeId:user.id,isShared:false,status:'todo'}]};
const legacyBytes=JSON.stringify(legacy);fs.writeFileSync(path.join(data,'db.json'),legacyBytes);
const network=path.join(fixture,'functional-network.jsonl'),preload=fileURLToPath(new URL('./block-network.cjs',import.meta.url));
const env={NODE_ENV:'production',DATA_DIR:data,CONFIG_DIR:config,LOG_DIR:logs,FO_NETWORK_ATTEMPTS:network};
for(const name of ['SystemRoot','WINDIR','TEMP','TMP','PATH'])if(process.env[name])env[name]=process.env[name];
const Database=createRequire(path.join(app,'package.json'))('better-sqlite3');
let child,output='';
function request(port,endpoint,body,token,method){return new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path:endpoint,method:method??(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})}},res=>{const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)res.destroy(new Error('Response exceeds budget'));else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,text,json:JSON.parse(text)});});});req.setTimeout(3000,()=>req.destroy(new Error('HTTP timeout')));req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
});}
async function start(){const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(process.execPath,['--require',preload,path.join(app,'dist/server.cjs')],{cwd,env:{...env,PORT:String(port)},stdio:['pipe','pipe','pipe']});child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
 const deadline=Date.now()+15000;while(Date.now()<deadline){if(child.exitCode!==null)throw new Error(output);try{if((await request(port,'/api/ready')).status===200)return port;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Package startup timeout');
}
async function stop(){if(!child)return;const current=child;child=undefined;if(current.exitCode!==null)return;const exited=once(current,'exit');current.stdin.write('stop\n');const timer=setTimeout(()=>current.kill('SIGKILL'),5000);try{const [code,signal]=await exited;assert.equal(code,0,output);assert.equal(signal,null);}finally{clearTimeout(timer);}}
async function login(port){const result=await request(port,'/api/auth/login',{username:user.username,password});assert.equal(result.status,200);return result.json.token;}
const checks=[];
try{
 let port=await start(),token=await login(port);
 assert.ok((await request(port,'/api/tasks',undefined,token)).json.tasks.some(task=>task.id==='migration-task'));assert.equal(fs.readFileSync(path.join(data,'db.json'),'utf8'),legacyBytes);checks.push('legacy-migration-source-preserved');
 const create=await request(port,'/api/finance',{type:'expense',amount:12345,description:'Synthetic package finance',date:'2026-10-12',category:'other'},token);assert.equal(create.status,200);const id=create.json.transaction.id;
 const edited=await request(port,'/api/finance',{...create.json.transaction,amount:40000},token);assert.equal(edited.status,200);assert.equal(edited.json.transaction.amount,40000);
 const task=await request(port,'/api/tasks',{title:'Synthetic package reward',assigneeId:rewardChild.id,rewardPoints:17,status:'todo'},token);assert.equal(task.status,200);
 const childLogin=await request(port,'/api/auth/login',{username:rewardChild.username,password});assert.equal(childLogin.status,200);
 assert.equal((await request(port,'/api/tasks',{id:task.json.task.id,status:'completed'},childLogin.json.token)).status,200);
 assert.equal((await request(port,'/api/tasks/'+task.json.task.id+'/approve',{},token)).status,200);
 const rewards=(await request(port,'/api/rewards',undefined,token)).json.entries;assert.equal(rewards.filter(row=>row.taskId===task.json.task.id).length,1);assert.equal(rewards.find(row=>row.taskId===task.json.task.id).points,17);checks.push('finance-create-read-update','task-reward-once');
 await stop();port=await start();token=await login(port);assert.equal((await request(port,'/api/finance',undefined,token)).json.transactions.find(row=>row.id===id).amount,40000);assert.deepEqual((await request(port,'/api/rewards',undefined,token)).json.entries,rewards);checks.push('restart-preserves-finance-reward');
 const backup=await request(port,'/api/admin/backups',{},token);assert.equal(backup.status,200);const backups=(await request(port,'/api/admin/backups',undefined,token)).json.backups;const backupId=backups.find(row=>row.filename===backup.json.filename).id;
 const snapshot=JSON.parse(fs.readFileSync(path.join(data,'backups',backup.json.filename),'utf8'));assert.equal(snapshot.manifest.schemaVersion,1);assert.ok(snapshot.tables.app_commands.length>0);assert.ok(snapshot.tables.app_jobs.length>0);
 assert.equal((await request(port,'/api/finance/'+id,undefined,token,'DELETE')).status,200);assert.ok(!(await request(port,'/api/finance',undefined,token)).json.transactions.some(row=>row.id===id));checks.push('finance-delete');
 const restored=await request(port,'/api/admin/backups/'+backupId+'/restore',{},token);assert.equal(restored.status,200,restored.text);
 assert.equal((await request(port,'/api/auth/me',undefined,token)).status,401);token=await login(port);
 assert.equal((await request(port,'/api/finance',undefined,token)).json.transactions.find(row=>row.id===id).amount,40000);assert.deepEqual((await request(port,'/api/rewards',undefined,token)).json.entries,rewards);checks.push('shared-snapshot-restore','restore-revokes-session','restore-preserves-reward-no-replay');
 await stop();const db=new Database(path.join(data,'family.db'),{readonly:true});try{assert.equal(db.pragma('integrity_check',{simple:true}),'ok');for(const name of ['app_commands','app_reward_claims','app_migrations']){const rows=db.prepare(`SELECT * FROM ${name}`).all();for(const saved of snapshot.tables[name])assert.ok(rows.some(row=>JSON.stringify(row)===JSON.stringify(saved)),`Snapshot ${name} row lost`);}}finally{db.close();}
 assert.equal(fs.existsSync(network)?fs.readFileSync(network,'utf8'):'','');checks.push('snapshot-core-rows-preserved','offline-providers','native-handles-closed');
 fs.writeFileSync(report,JSON.stringify({commitSha:process.env.TEST_COMMIT_SHA,nodeVersion:process.version,nodeExecutable:process.execPath,platform:process.platform,architecture:process.arch,checks,networkAttempts:[],snapshotChecksum:snapshot.manifest.checksum},null,2)+'\n');
}finally{await stop();fs.writeFileSync(path.join(path.dirname(report),'package-functional-server.log'),output);}
