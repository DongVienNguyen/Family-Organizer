import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const [release,fixture,report]=process.argv.slice(2),app=path.join(release,'app'),source=path.join(fixture,'functional config'),target=path.join(fixture,'private settings target');
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(path.resolve(process.execPath).toLowerCase(),path.join(release,'bin/node.exe').toLowerCase());
const key=randomBytes(32).toString('hex'),file=path.join(fixture,'private-settings.fo-recovery');
const sourcePrivate={geminiApiKey:'synthetic-private-gemini-source',telegramBotToken:'synthetic-private-bot-source',telegramChatId:'synthetic-private-chat-source',telegramWeeklyDigestOwnerId:'package-admin'};
const targetPrivate={geminiApiKey:'synthetic-private-gemini-target',telegramBotToken:'synthetic-private-bot-target',telegramChatId:'synthetic-private-chat-target',telegramWeeklyDigestOwnerId:'synthetic-target-owner',unselectedPrivate:'synthetic-target-retained'};
const evidence={commitSha:process.env.TEST_COMMIT_SHA,platform:process.platform,architecture:process.arch,nodeVersion:process.version,nodeExecutable:process.execPath,completed:false,checks:[],nativeExitCodes:[]};
const Database=createRequire(path.join(app,'package.json'))('better-sqlite3');
const network=path.join(fixture,'private-settings-network.jsonl'),preload=fileURLToPath(new URL('./block-network.cjs',import.meta.url));
const env=destination=>{const value={};for(const name of ['PATH','SystemRoot','windir','TEMP','TMP','USERPROFILE','HOME'])if(process.env[name])value[name]=process.env[name];return {...value,NODE_ENV:'production',APP_CODE_ROOT:app,DATA_DIR:destination?path.join(target,'data'):path.join(fixture,'functional dữ liệu'),CONFIG_DIR:destination?path.join(target,'config'):source,LOG_DIR:destination?path.join(target,'logs'):path.join(fixture,'functional logs'),FO_NETWORK_ATTEMPTS:network};};
function rows(data){const db=new Database(path.join(data,'family.db'),{readonly:true});try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all().map(row=>({...row,...(typeof row.data==='string'?{data:JSON.parse(row.data)}:{})}))]));}finally{db.close();}}
async function operator(label,mode,input,destination=false){
 const child=spawn(process.execPath,['--require',preload,path.join(app,'dist/operator.cjs'),...(mode?[mode]:[])],{env:env(destination),cwd:path.dirname(fixture),stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});const closed=once(child,'close');child.stdin.end(JSON.stringify(input));const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);
 try{const [exitCode,signal]=await closed;assert.equal(signal,null);assert.ok(![key,...Object.values(sourcePrivate),...Object.values(targetPrivate)].some(value=>(stdout+stderr).includes(value)),'operator leaked private settings/key');evidence.nativeExitCodes.push({phase:label,exitCode});return {exitCode,value:JSON.parse(stdout.trim())};}finally{clearTimeout(timeout);}
}
try{
 const original=JSON.parse(fs.readFileSync(path.join(source,'app_settings.json'),'utf8'));fs.writeFileSync(path.join(source,'app_settings.json'),JSON.stringify({...original,...sourcePrivate}));
 const request={file,key,includeCredentials:true};const saved=rows(env(false).DATA_DIR);
 const backup=await operator('selected-backup','--backup-recovery',{...request,includeSettings:['gemini','telegram']});assert.equal(backup.exitCode,0);assert.deepEqual(backup.value.includedSettings,['gemini','telegram']);const encrypted=fs.readFileSync(file);for(const value of Object.values(sourcePrivate))assert.ok(!encrypted.includes(Buffer.from(value)),'plaintext setting exported');evidence.checks.push('compiled-explicit-settings-encrypted-no-plaintext');
 assert.equal((await operator('target-initialize','',{username:'private-target-admin',fullName:'Synthetic target admin',password:'Synthetic private target passphrase'},true)).exitCode,0);const settings=path.join(target,'config/app_settings.json');fs.writeFileSync(settings,JSON.stringify(targetPrivate));
 const before=rows(env(true).DATA_DIR),wrong=await operator('wrong-key','--restore-recovery',{...request,key:randomBytes(32).toString('hex'),includeSettings:['gemini']},true);assert.equal(wrong.exitCode,1);assert.equal(wrong.value.error,'RECOVERY_ENVELOPE_INVALID');assert.ok(isDeepStrictEqual(rows(env(true).DATA_DIR),before));assert.ok(isDeepStrictEqual(JSON.parse(fs.readFileSync(settings,'utf8')),targetPrivate));evidence.checks.push('compiled-selected-settings-wrong-key-no-mutation');
 const restored=await operator('selected-restore','--restore-recovery',{...request,includeSettings:['gemini']},true);assert.equal(restored.exitCode,0);assert.deepEqual(restored.value.restoredSettings,['gemini']);
 const actual=JSON.parse(fs.readFileSync(settings,'utf8'));assert.ok(isDeepStrictEqual(actual,{...targetPrivate,geminiApiKey:sourcePrivate.geminiApiKey,...Object.fromEntries(Object.entries(original).filter(([name])=>['homelabLinks','rewardsEnabled','rewardApprovalThreshold','telegramBackupEnabled','telegramWeeklyDigestEnabled','telegramBackupLastSent','telegramWeeklyDigestLastSent'].includes(name)))}),'private setting subset/retention failed');
 const recovered=rows(env(true).DATA_DIR);for(const table of ['users','tasks','transactions','reward_ledger','app_reward_claims','app_migrations'])assert.ok(isDeepStrictEqual(recovered[table],saved[table]),'private settings restore lost business rows');assert.equal((recovered.auth_sessions??[]).length,0);assert.ok(!JSON.stringify(recovered.app_commands).includes(sourcePrivate.geminiApiKey),'private settings cached');
 evidence.checks.push('compiled-selected-subset-unselected-settings-retained','compiled-private-settings-business-claims-session-preserved');
 assert.ok(fs.readFileSync(file).equals(encrypted));assert.equal(fs.existsSync(network)?fs.readFileSync(network,'utf8'):'','');for(const data of [env(false).DATA_DIR,env(true).DATA_DIR]){const db=path.join(data,'family.db');fs.renameSync(db,db+'.closed');fs.renameSync(db+'.closed',db);}evidence.checks.push('compiled-private-settings-offline-source-retained-closed-handles');evidence.encryptedSha256=createHash('sha256').update(encrypted).digest('hex');evidence.completed=true;
}finally{fs.writeFileSync(report,JSON.stringify(evidence,null,2)+'\n');}
