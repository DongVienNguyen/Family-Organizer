import {probeCanonicalPackage} from './probe-productivity-package.mjs';
import {retainsSnapshotRows} from './package-contract.mjs';
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
const walletFixtureBytes=fs.readFileSync(new URL('./wallet-fixture.json',import.meta.url)),walletSeed=JSON.parse(walletFixtureBytes.toString('utf8'));assert.equal(walletSeed.commitSha,process.env.TEST_COMMIT_SHA);assert.equal(walletSeed.version,1);
const walletDb=work=>{const db=new Database(path.join(data,'family.db'));try{return work(db);}finally{db.close();}};
function seedWallet(){walletDb(db=>db.transaction(()=>{db.exec(walletSeed.schemaSql);db.prepare('DELETE FROM wallet_currencies').run();for(const [name,rows]of Object.entries(walletSeed.tables)){const columns=walletSeed.columns[name],insert=db.prepare(`INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);for(const row of rows)insert.run(...columns.map(column=>walletSeed.moneyColumns[name]?.includes(column)?BigInt(row[column]):row[column]));}db.prepare('INSERT INTO app_migrations VALUES(?,?,?,?)').run(...['namespace','version','checksum','applied_at'].map(key=>walletSeed.migration[key]));}).immediate());}
function assertWallet(){walletDb(db=>{assert.deepEqual(db.prepare('SELECT CAST(opening_minor AS TEXT) AS money,typeof(opening_minor) AS type FROM wallet_accounts').get(),{money:'9223372036854775807',type:'integer'});assert.deepEqual(db.prepare('SELECT CAST(delta_minor AS TEXT) AS money,typeof(delta_minor) AS type FROM wallet_postings').get(),{money:'-9223372036854775808',type:'integer'});assert.equal(db.prepare("SELECT max(version) AS version FROM app_migrations WHERE namespace='wallet'").get().version,1);assert.equal(db.prepare("SELECT value FROM app_meta WHERE key='wallet_active'").get(),undefined);});}
async function walletOperator(command,packet){const processChild=spawn(process.execPath,['--require',preload,path.join(app,'dist/operator.cjs'),command],{cwd,env:{...env,APP_CODE_ROOT:app},stdio:['pipe','pipe','pipe']});let text='';processChild.stdout.on('data',chunk=>text+=chunk);processChild.stderr.on('data',chunk=>text+=chunk);processChild.stdin.on('error',()=>{});const done=once(processChild,'close'),timer=setTimeout(()=>processChild.kill('SIGKILL'),15000);try{processChild.stdin.end(JSON.stringify(packet));assert.deepEqual(await done,[0,null],text);}finally{clearTimeout(timer);}}
let child,output='';
function request(port,endpoint,body,token,method){return new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path:endpoint,method:method??(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})}},res=>{const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)res.destroy(new Error('Response exceeds budget'));else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,text,json:JSON.parse(text)});});});req.setTimeout(3000,()=>req.destroy(new Error('HTTP timeout')));req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
});}
async function start(){const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(process.execPath,['--require',preload,path.join(app,'dist/server.cjs')],{cwd,env:{...env,PORT:String(port)},stdio:['pipe','pipe','pipe']});child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
 const deadline=Date.now()+15000;while(Date.now()<deadline){if(child.exitCode!==null)throw new Error(output);try{if((await request(port,'/api/ready')).status===200)return port;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Package startup timeout');
}
async function stop(){if(!child)return;const current=child;child=undefined;if(current.exitCode!==null)return;const exited=once(current,'exit');current.stdin.write('stop\n');const timer=setTimeout(()=>current.kill('SIGKILL'),5000);try{const [code,signal]=await exited;assert.equal(code,0,output);assert.equal(signal,null);}finally{clearTimeout(timer);}}
async function login(port,loginPassword=password){const result=await request(port,'/api/auth/login',{username:user.username,password:loginPassword});assert.equal(result.status,200);return result.json.token;}
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
 await stop();seedWallet();port=await start();token=await login(port);assertWallet();assert.equal((await request(port,'/api/finance',undefined,token)).json.transactions.find(row=>row.id===id).amount,40000);assert.deepEqual((await request(port,'/api/rewards',undefined,token)).json.entries,rewards);checks.push('restart-preserves-finance-reward');
 const backup=await request(port,'/api/admin/backups',{},token);assert.equal(backup.status,200);const backups=(await request(port,'/api/admin/backups',undefined,token)).json.backups;const backupId=backups.find(row=>row.filename===backup.json.filename).id;
 const snapshot=JSON.parse(fs.readFileSync(path.join(data,'backups',backup.json.filename),'utf8'));assert.equal(snapshot.manifest.schemaVersion,1);assert.ok(snapshot.tables.app_commands.length>0);assert.ok(snapshot.tables.app_jobs.length>0);assert.equal(snapshot.tables.wallet_accounts[0].opening_minor,'9223372036854775807');assert.equal(snapshot.tables.wallet_postings[0].delta_minor,'-9223372036854775808');
 assert.equal((await request(port,'/api/finance/'+id,undefined,token,'DELETE')).status,200);assert.ok(!(await request(port,'/api/finance',undefined,token)).json.transactions.some(row=>row.id===id));checks.push('finance-delete');
 await stop();walletDb(db=>db.prepare('UPDATE wallet_postings SET delta_minor=0').run());port=await start();token=await login(port);
 const restored=await request(port,'/api/admin/backups/'+backupId+'/restore',{},token);assert.equal(restored.status,200,restored.text);
 assert.equal((await request(port,'/api/auth/me',undefined,token)).status,401);
 assert.equal((await request(port,'/api/auth/login',{username:user.username,password})).status,401);
 assert.equal(snapshot.manifest.credentials,'excluded-v1');assert.ok(snapshot.legacy.users.every(row=>!Object.hasOwn(row,'passwordHash')));assert.ok(!JSON.stringify(snapshot).includes(user.passwordHash));
 checks.push('ordinary-backup-excludes-credentials','restore-requires-explicit-credential-reentry');
 await stop();
 const restoredPassword='Synthetic explicit package reentry passphrase';
 const reset=spawn(process.execPath,['--require',preload,path.join(app,'dist/operator.cjs'),'--reset-credentials'],{cwd,env:{...env,APP_CODE_ROOT:app},stdio:['pipe','pipe','pipe']});
 let resetOutput='',resetErrors='';reset.stdout.on('data',chunk=>{resetOutput+=chunk;});reset.stderr.on('data',chunk=>{resetErrors+=chunk;});
 reset.stdin.on('error',()=>{});reset.stdin.end(JSON.stringify({users:[{id:user.id,password:restoredPassword},{id:rewardChild.id,password:restoredPassword}]}));
 const timeout=setTimeout(()=>reset.kill('SIGKILL'),15000);
 try{const [exitCode,signal]=await once(reset,'close');assert.equal(exitCode,0,resetOutput+resetErrors);assert.equal(signal,null);assert.deepEqual(JSON.parse(resetOutput.trim()),{resetUserIds:[user.id,rewardChild.id],sessionsRevoked:true});assert.ok(!(resetOutput+resetErrors).includes(restoredPassword));}finally{clearTimeout(timeout);}
 port=await start();token=await login(port,restoredPassword);checks.push('compiled-offline-reentry-preserves-user-ids');
 assert.equal((await request(port,'/api/finance',undefined,token)).json.transactions.find(row=>row.id===id).amount,40000);assert.deepEqual((await request(port,'/api/rewards',undefined,token)).json.entries,rewards);assertWallet();checks.push('shared-snapshot-restore','restore-revokes-session','restore-preserves-reward-no-replay');
 await stop();const db=new Database(path.join(data,'family.db'),{readonly:true});try{assert.equal(db.pragma('integrity_check',{simple:true}),'ok');for(const name of ['app_commands','app_reward_claims','app_migrations']){const rows=db.prepare(`SELECT * FROM ${name}`).all();assert.ok(retainsSnapshotRows(rows,snapshot.tables[name]),`Snapshot ${name} row lost`);}}finally{db.close();}
 const walletPacket={file:path.join(fixture,'synthetic-wallet.fo-recovery'),key:'22'.repeat(32),includeCredentials:true};await walletOperator('--backup-recovery',walletPacket);walletDb(db=>db.prepare('UPDATE wallet_postings SET delta_minor=0').run());await walletOperator('--restore-recovery',walletPacket);assertWallet();
 walletDb(db=>{db.prepare("UPDATE app_migrations SET version=2 WHERE namespace='wallet'").run();assert.equal(db.pragma('journal_mode=DELETE',{simple:true}),'delete');});const walletFile=path.join(data,'family.db'),beforeWalletRefusal=fs.readFileSync(walletFile);output='';child=spawn(process.execPath,['--require',preload,path.join(app,'dist/server.cjs')],{cwd,env:{...env,PORT:'0'},stdio:['pipe','pipe','pipe']});child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);const refusalChild=child,refusalTimer=setTimeout(()=>refusalChild.kill('SIGKILL'),15000);try{assert.deepEqual(await once(refusalChild,'close'),[1,null],output);child=undefined;assert.match(output,/Unsupported.*Wallet/);assert.doesNotMatch(output,/Server is running/);assert.equal(Buffer.compare(fs.readFileSync(walletFile),beforeWalletRefusal),0);fs.renameSync(walletFile,walletFile+'.closed');fs.renameSync(walletFile+'.closed',walletFile);}finally{clearTimeout(refusalTimer);}walletDb(db=>db.prepare("UPDATE app_migrations SET version=1 WHERE namespace='wallet'").run());
 const compatibleWalletBytes=fs.readFileSync(walletFile);
 const malformedCases=[
  ['money-affinity',"UPDATE sqlite_master SET sql=replace(sql, 'opening_minor INTEGER NOT NULL CHECK(typeof(opening_minor)=''integer'')','opening_minor REAL NOT NULL') WHERE name='wallet_accounts'"],
  ['foreign-key',"UPDATE sqlite_master SET sql=replace(sql,'account_id TEXT NOT NULL REFERENCES wallet_accounts(id)','account_id TEXT NOT NULL') WHERE name='wallet_account_grants'"],
  ['unique-constraint',"PRAGMA foreign_keys=OFF;DROP TABLE wallet_occurrences;"+walletSeed.schemaSql.split(';').find(sql=>sql.trim().startsWith('CREATE TABLE IF NOT EXISTS wallet_occurrences(')).replace(',UNIQUE(schedule_id,due_date)','')+';'],
  ['unique-index',"DROP INDEX wallet_record_external_key"],
 ];
 for(const [name,sql]of malformedCases){
  fs.writeFileSync(walletFile,compatibleWalletBytes);walletDb(db=>{db.unsafeMode(true);try{if(name==='unique-constraint')assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_occurrences').get().n,0);if(['money-affinity','foreign-key'].includes(name))db.pragma('writable_schema=ON');db.exec(sql);if(['money-affinity','foreign-key'].includes(name)){db.pragma('writable_schema=OFF');db.pragma('schema_version='+(db.pragma('schema_version',{simple:true})+1));}}finally{db.unsafeMode(false);}});
  const before=fs.readFileSync(walletFile);output='';child=spawn(process.execPath,['--require',preload,path.join(app,'dist/server.cjs')],{cwd,env:{...env,PORT:'0'},stdio:['pipe','pipe','pipe']});child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);const current=child,timer=setTimeout(()=>current.kill('SIGKILL'),15000);
  try{assert.deepEqual(await once(current,'close'),[1,null],name+':'+output);child=undefined;assert.match(output,/Unsupported Wallet storage schema/);assert.doesNotMatch(output,/Server is running/);assert.deepEqual(fs.readFileSync(walletFile),before);assert.ok(!fs.existsSync(walletFile+'-wal'));assert.ok(!fs.existsSync(walletFile+'-journal'));fs.renameSync(walletFile,walletFile+'.closed');fs.renameSync(walletFile+'.closed',walletFile);}finally{clearTimeout(timer);}
 }
 fs.writeFileSync(walletFile,compatibleWalletBytes);
 // New pilot probes share the original functional path. Return that synthetic
 // path to Wallet0 and an authenticated legacy session before legacy recovery.
 walletDb(db=>{db.pragma('foreign_keys=OFF');db.transaction(()=>{for(const name of Object.keys(walletSeed.tables).reverse())db.exec('DROP TABLE '+name);db.prepare("DELETE FROM app_migrations WHERE namespace='wallet'").run();}).immediate();});
 port=await start();await login(port,restoredPassword);await stop();walletDb(db=>{assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'wallet_%'").get().n,0);assert.equal(db.prepare("SELECT count(*) AS n FROM app_migrations WHERE namespace='wallet'").get().n,0);assert.ok(db.prepare('SELECT count(*) AS n FROM auth_sessions').get().n>0);});
 const wallet={fixtureSha256:crypto.createHash('sha256').update(walletFixtureBytes).digest('hex'),completed:true,version:1,exactMoneyStrings:true,integerBindings:true,restartPreserved:true,ordinaryRestorePreserved:true,encryptedRestorePreserved:true,futureVersionRefused:true,malformedSchemaRefused:true,legacyFixturePreserved:true,nativeHandlesClosed:true};
 assert.equal(fs.existsSync(network)?fs.readFileSync(network,'utf8'):'','');checks.push('snapshot-core-rows-preserved','offline-providers','native-handles-closed');
 const productivity=await probeCanonicalPackage(app,fixture,cwd);checks.push('compiled-canonical-task-http-restart-snapshot-recovery','compiled-canonical-unsupported-migration-refusal');
 fs.writeFileSync(report,JSON.stringify({wallet,productivity,commitSha:process.env.TEST_COMMIT_SHA,nodeVersion:process.version,nodeExecutable:process.execPath,platform:process.platform,architecture:process.arch,checks,networkAttempts:[],snapshotChecksum:snapshot.manifest.checksum},null,2)+'\n');
}finally{await stop();fs.writeFileSync(path.join(path.dirname(report),'package-functional-server.log'),output);}
