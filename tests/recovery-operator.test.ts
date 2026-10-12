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
