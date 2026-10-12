import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {encryptRecovery,decryptRecovery} from '../server/recoveryEnvelope.js';
import Database from 'better-sqlite3';
import {expect,it,vi} from 'vitest';
vi.setConfig({testTimeout:45_000});
const repo=fileURLToPath(new URL('..',import.meta.url)),tsx=pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href;
const password='Synthetic portable recovery passphrase';
async function fixture(work:(root:string,run:(instance:string,mode:string,input:unknown)=>Promise<any>,env:(id:string)=>NodeJS.ProcessEnv)=>Promise<void>){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo recovery synthetic '));
 const env=(id:string)=>{const value:NodeJS.ProcessEnv={};for(const name of ['PATH','SystemRoot','windir','TEMP','TMP','HOME','USERPROFILE'])if(process.env[name])value[name]=process.env[name];return {...value,NODE_ENV:'production',APP_CODE_ROOT:repo,DATA_DIR:path.join(root,id,'dữ liệu'),CONFIG_DIR:path.join(root,id,'config riêng'),LOG_DIR:path.join(root,id,'logs'),FO_NETWORK_ATTEMPTS:path.join(root,'network.jsonl')};};
 const run=async(id:string,mode:string,input:unknown)=>{
  const child=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',tsx,path.join(repo,'server/operator.ts'),...(mode?[mode]:[])],{cwd:root,env:env(id),stdio:['pipe','pipe','pipe']});let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));const timeout=setTimeout(()=>child.kill('SIGKILL'),15000);
  try{const result=await new Promise<any>((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});expect(result.signal,output+errors).toBeNull();expect(output+errors).not.toContain(password);expect(output+errors).not.toContain((input as any)?.key??'KEY-NOT-SUPPLIED');return {...result,output,errors,value:JSON.parse(output.trim())};}finally{clearTimeout(timeout);}
 };
 try{await work(root,run,env);expect(fs.existsSync(path.join(root,'network.jsonl'))?fs.readFileSync(path.join(root,'network.jsonl'),'utf8'):'').toBe('');}finally{fs.rmSync(root,{recursive:true,force:true});}
}
const initialize={username:'recovery-admin',fullName:'Synthetic Recovery Admin',password};
function rows(file:string){const db=new Database(file,{readonly:true});try{return Object.fromEntries((db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all() as {name:string}[]).map(({name})=>[name,db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all().map((row:any)=>({...row,...(typeof row.data==='string'?{data:JSON.parse(row.data)}:{})}))]));}finally{db.close();}}
it('encrypted backup restores original IDs/hash/business/media into an independent installation without restoring historical sessions',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);
 const source=path.join(env('source').DATA_DIR!,'family.db'),target=path.join(env('target').DATA_DIR!,'family.db');
 const db=new Database(source);try{db.prepare('INSERT INTO transactions VALUES(?,?,?)').run('synthetic-finance',0,JSON.stringify({id:'synthetic-finance',amount:765432,title:'Synthetic retained finance'}));}finally{db.close();}
 fs.mkdirSync(path.join(env('source').DATA_DIR!,'uploads'),{recursive:true});fs.writeFileSync(path.join(env('source').DATA_DIR!,'uploads','synthetic.bin'),'synthetic media');
 const key=randomBytes(32).toString('hex'),file=path.join(root,'portable.fo-recovery'),input={file,key,includeCredentials:true};
 const exported=await run('source','--backup-recovery',input);expect(exported.code,exported.output+exported.errors).toBe(0);expect(exported.value.encrypted).toBe(true);
 const bytes=fs.readFileSync(file);expect(exported.value.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));expect(bytes.includes(Buffer.from(key))).toBe(false);const saved=rows(source);expect(bytes.includes(Buffer.from(JSON.stringify(saved.users)))).toBe(false);
 const restored=await run('target','--restore-recovery',input);expect(restored.code,restored.output+restored.errors).toBe(0);expect(restored.value).toEqual({restoredFiles:1,sessionsRevoked:true});
 const actual=rows(target);for(const name of ['users','transactions','tasks','reward_ledger','app_reward_claims','app_migrations'])expect(isDeepStrictEqual(actual[name],saved[name]),'recovery lost identity/business rows in '+name).toBe(true);expect(actual.auth_sessions??[]).toEqual([]);expect(fs.readFileSync(path.join(env('target').DATA_DIR!,'uploads','synthetic.bin'),'utf8')).toBe('synthetic media');expect(fs.readFileSync(file)).toEqual(bytes);
}));
it.each(['wrong-key','tampered','truncated','trailing'])('refuses %s recovery before opening the target store or promoting any file',kind=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const key=randomBytes(32).toString('hex'),file=path.join(root,'safe.fo-recovery'),input={file,key,includeCredentials:true};expect((await run('source','--backup-recovery',input)).code).toBe(0);
 let bytes=fs.readFileSync(file);if(kind==='tampered')bytes[32]^=1;if(kind==='truncated')bytes=bytes.subarray(0,bytes.length-1);if(kind==='trailing')bytes=Buffer.concat([bytes,Buffer.from([0])]);fs.writeFileSync(file,bytes);
 const result=await run('absent','--restore-recovery',{...input,key:kind==='wrong-key'?randomBytes(32).toString('hex'):key});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_ENVELOPE_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);expect(fs.readFileSync(file)).toEqual(bytes);
}));
it.each([{includeCredentials:false},{key:'passphrase'},{file:'relative.fo-recovery'},{unexpected:'field'}])('requires explicit credential inclusion, exact external key and absolute target %#',change=>fixture(async(root,run,env)=>{
 const result=await run('absent','--backup-recovery',{file:path.join(root,'safe.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true,...change});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_INPUT_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);
}));
it('backup never overwrites an existing file and refuses storage/code roots',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const key=randomBytes(32).toString('hex'),file=path.join(root,'retain.fo-recovery');fs.writeFileSync(file,'synthetic original bytes');
 for(const selected of [file,path.join(env('source').DATA_DIR!,'forbidden.fo-recovery'),path.join(env('source').CONFIG_DIR!,'secret.fo-recovery'),path.join(repo,'forbidden.fo-recovery')]){
  const result=await run('source','--backup-recovery',{file:selected,key,includeCredentials:true});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_PATH_INVALID'});
 }expect(fs.readFileSync(file,'utf8')).toBe('synthetic original bytes');
}));
it('refuses a linked ancestor before creating an encrypted file',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const outside=path.join(root,'untouched'),alias=path.join(root,'alias');fs.mkdirSync(outside);fs.symlinkSync(outside,alias,process.platform==='win32'?'junction':'dir');
 try{const result=await run('source','--backup-recovery',{file:path.join(alias,'reject.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_PATH_INVALID'});expect(fs.readdirSync(outside)).toEqual([]);}finally{fs.unlinkSync(alias);}
}));
it.each(['COM¹.fo-recovery','NUL.fo-recovery','file:stream.fo-recovery','bad?.fo-recovery'])('rejects unsafe Windows backup name %s on every operator platform',name=>fixture(async(root,run)=>{
 const result=await run('absent','--backup-recovery',{file:path.join(root,name),key:randomBytes(32).toString('hex'),includeCredentials:true});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_PATH_INVALID'});expect(fs.existsSync(path.join(root,name))).toBe(false);
}));

it('rejects an authenticated unsupported snapshot before SQL/file promotion and preserves an initialized target',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);
 const key=randomBytes(32).toString('hex'),file=path.join(root,'invalid.fo-recovery'),request={file,key,includeCredentials:true};expect((await run('source','--backup-recovery',request)).code).toBe(0);
 const warm={...request,file:path.join(root,'target-warm.fo-recovery')};expect((await run('target','--backup-recovery',warm)).code).toBe(0);
 const snapshot=JSON.parse(decryptRecovery(fs.readFileSync(file),Buffer.from(key,'hex')).toString('utf8'));snapshot.manifest.schemaVersion=999;const forged=encryptRecovery(Buffer.from(JSON.stringify(snapshot)),Buffer.from(key,'hex'));fs.writeFileSync(file,forged);
 const before=rows(path.join(env('target').DATA_DIR!,'family.db'));const result=await run('target','--restore-recovery',request);expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_SNAPSHOT_INVALID'});expect(isDeepStrictEqual(rows(path.join(env('target').DATA_DIR!,'family.db')),before)).toBe(true);expect(fs.readFileSync(file)).toEqual(forged);expect(fs.existsSync(path.join(env('target').DATA_DIR!,'restore-journal.json'))).toBe(false);
}));
it('bounds an oversized recovery file before reading it or opening the target',()=>fixture(async(root,run,env)=>{
 const file=path.join(root,'oversize.fo-recovery');const fd=fs.openSync(file,'wx');try{fs.ftruncateSync(fd,256*1024*1024+49);}finally{fs.closeSync(fd);}
 const result=await run('absent','--restore-recovery',{file,key:randomBytes(32).toString('hex'),includeCredentials:true});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_PATH_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);
}));

it('explicit encrypted settings selection restores only Gemini and retains target Telegram/config fields',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);
 const sourceSettings={geminiApiKey:'synthetic-private-gemini-source',telegramBotToken:'synthetic-private-bot-source',telegramChatId:'synthetic-private-chat-source',telegramWeeklyDigestOwnerId:'user_admin',rewardsEnabled:'1',unselectedPrivate:'synthetic-retained-elsewhere'};
 const targetSettings={geminiApiKey:'synthetic-private-gemini-target',telegramBotToken:'synthetic-private-bot-target',telegramChatId:'synthetic-private-chat-target',telegramWeeklyDigestOwnerId:'synthetic-target-owner',unselectedPrivate:'synthetic-target-retained'};
 for(const [id,settings] of [['source',sourceSettings],['target',targetSettings]] as const)fs.writeFileSync(path.join(env(id).CONFIG_DIR!,'app_settings.json'),JSON.stringify(settings));
 const key=randomBytes(32).toString('hex'),file=path.join(root,'selected.fo-recovery'),request={file,key,includeCredentials:true};
 const backup=await run('source','--backup-recovery',{...request,includeSettings:['gemini','telegram']});expect(backup.code,backup.output+backup.errors).toBe(0);expect(backup.value.includedSettings).toEqual(['gemini','telegram']);
 const bytes=fs.readFileSync(file);for(const value of Object.values(sourceSettings))if(value.startsWith('synthetic-private'))expect(bytes.includes(Buffer.from(value))).toBe(false);
 const restore=await run('target','--restore-recovery',{...request,includeSettings:['gemini']});expect(restore.code,restore.output+restore.errors).toBe(0);expect(restore.value.restoredSettings).toEqual(['gemini']);
 const actual=JSON.parse(fs.readFileSync(path.join(env('target').CONFIG_DIR!,'app_settings.json'),'utf8'));expect(isDeepStrictEqual(actual,{...targetSettings,geminiApiKey:sourceSettings.geminiApiKey,rewardsEnabled:'1'})).toBe(true);expect(fs.readFileSync(file)).toEqual(bytes);
}));
it('private groups omitted on restore remain local, while explicitly selected absent keys are removed',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);const target={geminiApiKey:'synthetic-keep-then-remove',telegramBotToken:'synthetic-retain-unselected'};const settings=path.join(env('target').CONFIG_DIR!,'app_settings.json');fs.writeFileSync(settings,JSON.stringify(target));
 const request={file:path.join(root,'absent-selected.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true};expect((await run('source','--backup-recovery',{...request,includeSettings:['gemini']})).code).toBe(0);
 expect((await run('target','--restore-recovery',request)).code).toBe(0);expect(isDeepStrictEqual(JSON.parse(fs.readFileSync(settings,'utf8')),target)).toBe(true);
 expect((await run('target','--restore-recovery',{...request,includeSettings:['gemini']})).code).toBe(0);const actual=JSON.parse(fs.readFileSync(settings,'utf8'));expect(Object.hasOwn(actual,'geminiApiKey')).toBe(false);expect(actual.telegramBotToken===target.telegramBotToken).toBe(true);
}));
it('refuses a settings group absent from the authenticated backup before opening the target',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const request={file:path.join(root,'missing-group.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true};expect((await run('source','--backup-recovery',{...request,includeSettings:['gemini']})).code).toBe(0);
 const result=await run('absent','--restore-recovery',{...request,includeSettings:['telegram']});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_SETTINGS_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);
}));
it('rejects authenticated malformed private settings before storage or promotion',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const request={file:path.join(root,'malformed-settings.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true};expect((await run('source','--backup-recovery',{...request,includeSettings:['gemini']})).code).toBe(0);
 const payload=JSON.parse(decryptRecovery(fs.readFileSync(request.file),Buffer.from(request.key,'hex')).toString());payload.privateSettings.values.forbiddenSetting='synthetic-forbidden';fs.writeFileSync(request.file,encryptRecovery(Buffer.from(JSON.stringify(payload)),Buffer.from(request.key,'hex')));
 const result=await run('absent','--restore-recovery',{...request,includeSettings:['gemini']});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_SETTINGS_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);
}));
it('binds private recovery restore metadata to opaque ciphertext, never a plaintext settings verifier',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);fs.writeFileSync(path.join(env('source').CONFIG_DIR!,'app_settings.json'),JSON.stringify({geminiApiKey:'synthetic-private-digest-canary'}));
 const request={file:path.join(root,'metadata.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true,includeSettings:['gemini']};expect((await run('source','--backup-recovery',request)).code).toBe(0);const encrypted=fs.readFileSync(request.file);expect((await run('target','--restore-recovery',request)).code).toBe(0);
 const target=rows(path.join(env('target').DATA_DIR!,'family.db'));const command=(target.app_commands as any[]).find(row=>row.command==='core:snapshot:restore');const identity=createHash('sha256').update(encrypted).update(JSON.stringify(['gemini'])).digest('hex');expect(command.payload_hash===identity).toBe(true);expect(JSON.stringify(target.app_commands).includes('synthetic-private-digest-canary')).toBe(false);
 const source=rows(path.join(env('source').DATA_DIR!,'family.db'));const reads=(source.app_commands as any[]).filter(row=>row.command==='operator:recovery:read');expect(reads.length>0).toBe(true);expect(reads.every(row=>JSON.parse(row.result).snapshotRead===true)).toBe(true);expect(JSON.stringify(reads).includes('synthetic-private-digest-canary')).toBe(false);
}));

// An un-warmed first-account database must not acquire runtime/snapshot bootstrap
// tables, WAL mode or command records merely because an authenticated payload is bad.
it.each(['raw','private'].flatMap(format=>['manifest','checksum','primary-key','migrations','credentials'].map(invalid=>({format,invalid}))))('rejects $format authenticated $invalid snapshot without initializing the target',({format,invalid})=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);
 const request={file:path.join(root,'unwarmed.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true,...(format==='private'?{includeSettings:['gemini']}: {})};
 expect((await run('source','--backup-recovery',request)).code).toBe(0);
 const payload=JSON.parse(decryptRecovery(fs.readFileSync(request.file),Buffer.from(request.key,'hex')).toString());const snapshot=format==='private'?payload.snapshot:payload;
 if(invalid==='manifest')snapshot.manifest.schemaVersion=999;
 if(invalid==='checksum')snapshot.manifest.checksum='0'.repeat(64);
 if(invalid==='primary-key')snapshot.tables.app_meta.push({...snapshot.tables.app_meta[0]});
 if(invalid==='migrations')snapshot.tables.app_migrations.push({namespace:'wallet',version:1,checksum:'synthetic-unrecognized',applied_at:'2026-10-12T00:00:00Z'});
 if(invalid==='credentials')snapshot.manifest.credentials='excluded-v1';
 const forged=encryptRecovery(Buffer.from(JSON.stringify(payload)),Buffer.from(request.key,'hex'));fs.writeFileSync(request.file,forged);
 const data=env('target').DATA_DIR!,dbfile=path.join(data,'family.db');
 const inspect=()=>{const db=new Database(dbfile,{readonly:true});try{return {schema:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all(),journal:db.pragma('journal_mode',{simple:true}),rows:rows(dbfile)};}finally{db.close();}};
 const files=()=>{const result:Record<string,string>={};const walk=(directory:string)=>{for(const name of fs.readdirSync(directory).sort()){const file=path.join(directory,name);if(fs.lstatSync(file).isDirectory())walk(file);else result[path.relative(path.join(root,'target'),file)]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');}};walk(path.join(root,'target'));return result;};
 const before=inspect(),beforeFiles=files();expect(Object.hasOwn(before.rows,'app_restore_commits')).toBe(false);expect(before.journal).toBe('delete');
 const result=await run('target','--restore-recovery',request);expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_SNAPSHOT_INVALID'});
 expect(inspect()).toEqual(before);expect(files()).toEqual(beforeFiles);expect(fs.readFileSync(request.file)).toEqual(forged);
}));

it('explicit encrypted signing key recovery preserves omitted target key then restores selected bytes',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);
 const keyFile=(id:string)=>path.join(env(id).CONFIG_DIR!,'session_secret.key');const source=Buffer.from('synthetic-source-signing-key\n'),local=Buffer.from('synthetic-target-signing-key');fs.writeFileSync(keyFile('source'),source);fs.writeFileSync(keyFile('target'),local);
 const request={file:path.join(root,'selected-key.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true};
 const backup=await run('source','--backup-recovery',{...request,includeFiles:['sessionSigningKey']});expect(backup.code,backup.output+backup.errors).toBe(0);expect(backup.value.includedFiles).toEqual(['sessionSigningKey']);const encrypted=fs.readFileSync(request.file);expect(encrypted.includes(source)).toBe(false);
 expect((await run('target','--restore-recovery',request)).code).toBe(0);expect(fs.readFileSync(keyFile('target'))).toEqual(local);
 const result=await run('target','--restore-recovery',{...request,includeFiles:['sessionSigningKey']});expect(result.code,result.output+result.errors).toBe(0);expect(result.value.restoredFilesSelection).toEqual(['sessionSigningKey']);expect(fs.readFileSync(keyFile('target'))).toEqual(source);expect(fs.readFileSync(keyFile('source'))).toEqual(source);expect(fs.readFileSync(request.file)).toEqual(encrypted);
 const commands=rows(path.join(env('target').DATA_DIR!,'family.db')).app_commands as any[];expect(JSON.stringify(commands)).not.toContain(source.toString('base64'));expect(JSON.stringify(commands)).not.toContain(source.toString().trim());const identity=createHash('sha256').update(encrypted).update(JSON.stringify([])).update('files:'+JSON.stringify(['sessionSigningKey'])).digest('hex');expect(commands.some(row=>row.command==='core:snapshot:restore'&&row.payload_hash===identity)).toBe(true);
}));
it('explicit absent signing key removes only that target file and leaves local provider config',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);const config=env('target').CONFIG_DIR!,secret=path.join(config,'session_secret.key');fs.writeFileSync(secret,'synthetic-target-removed');fs.writeFileSync(path.join(config,'.env'),'GEMINI_API_KEY=synthetic-retained-env\n');
 const request={file:path.join(root,'missing-key.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true,includeFiles:['sessionSigningKey']};expect((await run('source','--backup-recovery',request)).code).toBe(0);expect((await run('target','--restore-recovery',request)).code).toBe(0);expect(fs.existsSync(secret)).toBe(false);expect(fs.readFileSync(path.join(config,'.env'),'utf8')).toBe('GEMINI_API_KEY=synthetic-retained-env\n');
}));
it('refuses selecting a signing key absent from an old raw envelope before opening target',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const request={file:path.join(root,'old-key.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true};expect((await run('source','--backup-recovery',request)).code).toBe(0);const result=await run('absent','--restore-recovery',{...request,includeFiles:['sessionSigningKey']});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_FILES_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);
}));
it('malformed authenticated signing key is rejected before creating target directories',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const request={file:path.join(root,'invalid-key.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true,includeFiles:['sessionSigningKey']};expect((await run('source','--backup-recovery',request)).code).toBe(0);
 const payload=JSON.parse(decryptRecovery(fs.readFileSync(request.file),Buffer.from(request.key,'hex')).toString());payload.privateFiles.values.sessionSigningKey='malformed base64';fs.writeFileSync(request.file,encryptRecovery(Buffer.from(JSON.stringify(payload)),Buffer.from(request.key,'hex')));
 const result=await run('absent','--restore-recovery',request);expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_FILES_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);
}));

it('explicit encrypted provider env recovery selects Gemini and retains target VAPID/host text',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);const source='GEMINI_API_KEY=synthetic-source-env-gemini\nAPI_KEY=synthetic-source-env-fallback\nVAPID_PUBLIC_KEY=synthetic-source-public\nVAPID_PRIVATE_KEY=synthetic-source-private\nVAPID_SUBJECT=mailto:source@example.invalid\nAPP_URL=https://source.invalid\nNODE_OPTIONS=unsafe-source-not-selected\n',target='# retained\r\nAPP_URL=https://target.invalid\r\nGEMINI_API_KEY=synthetic-target-env-gemini\r\nVAPID_PUBLIC_KEY=synthetic-target-public\r\nVAPID_PRIVATE_KEY=synthetic-target-private\r\n';const sourceFile=path.join(env('source').CONFIG_DIR!,'.env'),targetFile=path.join(env('target').CONFIG_DIR!,'.env');fs.writeFileSync(sourceFile,source);fs.writeFileSync(targetFile,target);
 const request={file:path.join(root,'selected-env.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true};const backup=await run('source','--backup-recovery',{...request,includeEnv:['gemini','vapid']});expect(backup.code,backup.output+backup.errors).toBe(0);expect(backup.value.includedEnv).toEqual(['gemini','vapid']);const encrypted=fs.readFileSync(request.file);expect(encrypted.includes(Buffer.from('synthetic-source-env-gemini'))).toBe(false);
 expect((await run('target','--restore-recovery',request)).code).toBe(0);expect(fs.readFileSync(targetFile,'utf8')).toBe(target);
 const selected=await run('target','--restore-recovery',{...request,includeEnv:['gemini']});expect(selected.code,selected.output+selected.errors).toBe(0);expect(selected.value.restoredEnv).toEqual(['gemini']);const {parse}=await import('dotenv');expect(parse(fs.readFileSync(targetFile))).toEqual({APP_URL:'https://target.invalid',GEMINI_API_KEY:'synthetic-source-env-gemini',API_KEY:'synthetic-source-env-fallback',VAPID_PUBLIC_KEY:'synthetic-target-public',VAPID_PRIVATE_KEY:'synthetic-target-private'});expect(fs.readFileSync(targetFile,'utf8')).toContain('# retained\r\n');expect(fs.readFileSync(targetFile,'utf8')).not.toContain('unsafe-source-not-selected');expect(fs.readFileSync(sourceFile,'utf8')).toBe(source);expect(fs.readFileSync(request.file)).toEqual(encrypted);
}));
it('selected missing provider env values remove target bindings without touching unselected host configuration',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);expect((await run('target','',initialize)).code).toBe(0);const file=path.join(env('target').CONFIG_DIR!,'.env');fs.writeFileSync(file,'GEMINI_API_KEY=synthetic-old\nAPI_KEY=synthetic-old-fallback\nAPP_URL=https://retained.invalid\n');const request={file:path.join(root,'missing-env.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true,includeEnv:['gemini']};expect((await run('source','--backup-recovery',request)).code).toBe(0);expect((await run('target','--restore-recovery',request)).code).toBe(0);expect(fs.readFileSync(file,'utf8')).toBe('APP_URL=https://retained.invalid\n');
}));
it('refuses an env group absent from an old envelope before opening the target',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const request={file:path.join(root,'old-env.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true};expect((await run('source','--backup-recovery',request)).code).toBe(0);const result=await run('absent','--restore-recovery',{...request,includeEnv:['gemini']});expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_ENV_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);
}));
it('malformed authenticated provider env is rejected before creating target directories',()=>fixture(async(root,run,env)=>{
 expect((await run('source','',initialize)).code).toBe(0);const request={file:path.join(root,'bad-env.fo-recovery'),key:randomBytes(32).toString('hex'),includeCredentials:true,includeEnv:['gemini']};expect((await run('source','--backup-recovery',request)).code).toBe(0);const payload=JSON.parse(decryptRecovery(fs.readFileSync(request.file),Buffer.from(request.key,'hex')).toString());payload.privateEnv.values.NODE_OPTIONS='unsafe';fs.writeFileSync(request.file,encryptRecovery(Buffer.from(JSON.stringify(payload)),Buffer.from(request.key,'hex')));const result=await run('absent','--restore-recovery',request);expect(result.code).toBe(1);expect(result.value).toEqual({error:'RECOVERY_ENV_INVALID'});expect(fs.existsSync(env('absent').DATA_DIR!)).toBe(false);
}));
