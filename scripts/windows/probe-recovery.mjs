import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {isDeepStrictEqual} from 'node:util';
const [release,fixture,report]=process.argv.slice(2),app=path.join(release,'app');
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.version,'v24.21.0');
assert.equal(path.resolve(process.execPath).toLowerCase(),path.join(release,'bin/node.exe').toLowerCase());
const data=path.join(fixture,'functional dữ liệu'),config=path.join(fixture,'functional config'),logs=path.join(fixture,'functional logs');
const target=path.join(fixture,'recovery target riêng'),file=path.join(fixture,'portable.fo-recovery'),key=randomBytes(32).toString('hex');
const evidence={commitSha:process.env.TEST_COMMIT_SHA,platform:process.platform,architecture:process.arch,nodeVersion:process.version,nodeExecutable:process.execPath,completed:false,checks:[],nativeExitCodes:[]};
const Database=createRequire(path.join(app,'package.json'))('better-sqlite3');
const env=(restoring=false)=>({...process.env,NODE_OPTIONS:'',NODE_PATH:'',NODE_ENV:'production',APP_CODE_ROOT:app,DATA_DIR:restoring?path.join(target,'data'):data,CONFIG_DIR:restoring?path.join(target,'config'):config,LOG_DIR:restoring?path.join(target,'logs'):logs});
function rows(root){const db=new Database(path.join(root,'family.db'),{readonly:true});try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all().map(row=>({...row,...(typeof row.data==='string'?{data:JSON.parse(row.data)}:{})}))]));}finally{db.close();}}
async function operator(label,mode,value,restoring=false){
 const child=spawn(process.execPath,[path.join(app,'dist/operator.cjs'),...(mode?[mode]:[])],{cwd:path.dirname(fixture),env:env(restoring),stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});const closed=once(child,'close');child.stdin.end(JSON.stringify(value));const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);
 try{const [exitCode,signal]=await closed;assert.equal(signal,null);assert.ok(!(stdout+stderr).includes(key),'operator leaked key');evidence.nativeExitCodes.push({phase:label,exitCode});return {exitCode,value:JSON.parse(stdout.trim())};}finally{clearTimeout(timeout);}
}
try{
 const seeded=new Database(path.join(data,'family.db'));try{const grant=seeded.prepare('SELECT id,data FROM reward_ledger ORDER BY rowid LIMIT 1').get();assert.ok(grant,'canonical reward fixture missing');seeded.prepare('INSERT OR IGNORE INTO app_reward_claims(claim_id,payload_hash,grant_entry_id,reverse_entry_id) VALUES(?,?,?,?)').run('synthetic-recovery-claim',createHash('sha256').update(grant.data).digest('hex'),grant.id,null);seeded.prepare('INSERT OR IGNORE INTO app_jobs(id,namespace,type,unique_key,payload,payload_hash,kind,status,available_at,lease_token,lease_until,attempts,max_attempts,error_code,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-recovery-effect','legacy','push-delivery','synthetic-recovery-effect','{}','synthetic-hash','effect','pending',1,null,null,0,3,null,1,null);}finally{seeded.close();}
 const saved=rows(data);assert.ok(saved.auth_sessions.length>0,'historical session fixture missing');assert.ok(saved.users.length>=2);assert.ok(saved.transactions.length>=1);assert.ok(saved.app_reward_claims.length>=1);
 for(const [label,selected] of [['release-root-refusal',path.join(release,'refuse.fo-recovery')],['release-bin-refusal',path.join(release,'bin/refuse.fo-recovery')],['release-ops-refusal',path.join(release,'ops/refuse.fo-recovery')]]){const result=await operator(label,'--backup-recovery',{file:selected,key,includeCredentials:true});assert.equal(result.exitCode,1,'whole release boundary accepted recovery output');assert.equal(result.value.error,'RECOVERY_PATH_INVALID');assert.equal(fs.existsSync(selected),false);}
 evidence.checks.push('compiled-recovery-whole-release-excluded');
 const request={file,key,includeCredentials:true};const backup=await operator('encrypted-backup','--backup-recovery',request);assert.equal(backup.exitCode,0);const encrypted=fs.readFileSync(file);assert.equal(backup.value.sha256,createHash('sha256').update(encrypted).digest('hex'));assert.equal(backup.value.bytes,encrypted.length);assert.equal(backup.value.encrypted,true);
 for(const user of saved.users)assert.ok(!encrypted.includes(Buffer.from(user.data.passwordHash)),'plaintext hash exported');assert.ok(!encrypted.includes(Buffer.from(key)),'key exported');evidence.checks.push('compiled-recovery-encrypted-no-key-plaintext');
 const initialized=await operator('target-initialize','',{username:'synthetic-other-admin',fullName:'Synthetic other installation',password:'Synthetic other initialization passphrase'},true);assert.equal(initialized.exitCode,0);
 const targetData=env(true).DATA_DIR,original=rows(targetData);
 const wrong=await operator('wrong-key','--restore-recovery',{...request,key:randomBytes(32).toString('hex')},true);assert.equal(wrong.exitCode,1);assert.equal(wrong.value.error,'RECOVERY_ENVELOPE_INVALID');assert.ok(isDeepStrictEqual(rows(targetData),original),'wrong key changed target');
 const changed=Buffer.from(encrypted);changed[32]^=1;fs.writeFileSync(file,changed);const tampered=await operator('tampered-ciphertext','--restore-recovery',request,true);assert.equal(tampered.exitCode,1);assert.equal(tampered.value.error,'RECOVERY_ENVELOPE_INVALID');assert.ok(isDeepStrictEqual(rows(targetData),original),'tampering changed target');fs.writeFileSync(file,encrypted);evidence.checks.push('compiled-recovery-authentication-before-mutation');
 const restore=await operator('portable-restore','--restore-recovery',request,true);assert.equal(restore.exitCode,0);assert.equal(restore.value.sessionsRevoked,true);
 const restored=rows(targetData);
 for(const table of ['users','tasks','transactions','reward_ledger','app_reward_claims','app_migrations'])assert.ok(isDeepStrictEqual(restored[table],saved[table]),'recovery business/identity row lost');
 for(const row of saved.app_commands)assert.ok(restored.app_commands.some(candidate=>isDeepStrictEqual(row,candidate)),'recovery command metadata lost');
 assert.equal((restored.auth_sessions??[]).length,0);assert.equal(restored.app_jobs.find(row=>row.id==='synthetic-recovery-effect').status,'dropped','historical external effect was replayable');assert.ok(restored.app_jobs.every(row=>!['leased'].includes(row.status)&&row.lease_token===null),'historical job lease restored');
 const hashes=root=>{if(!fs.existsSync(root))return {};const result={};function walk(dir,prefix=''){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),key=prefix+name;const stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink());if(stat.isDirectory())walk(file,key+'/');else result[key]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}walk(root);return result;};
 assert.ok(isDeepStrictEqual(hashes(path.join(data,'uploads')),hashes(path.join(targetData,'uploads'))),'recovery media changed');assert.ok(fs.readFileSync(file).equals(encrypted),'restore changed recovery source');evidence.checks.push('compiled-portable-restore-ids-finance-reward-media','compiled-recovery-no-claim-command-replay');
 for(const root of [data,targetData]){const name=path.join(root,'family.db');fs.renameSync(name,name+'.closed');fs.renameSync(name+'.closed',name);}
 evidence.checks.push('compiled-recovery-native-handles-closed');evidence.encryptedSha256=backup.value.sha256;evidence.encryptedBytes=encrypted.length;evidence.completed=true;
}finally{fs.writeFileSync(report,JSON.stringify(evidence,null,2)+'\n');}
