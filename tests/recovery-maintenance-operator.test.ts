import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {encryptRecovery} from '../server/recoveryEnvelope.js';
const repo=fileURLToPath(new URL('..',import.meta.url)),tsx=pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href;
async function scenario(mode:string){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo encrypted copies synthetic ')),config=path.join(root,'private config'),source=path.join(root,'owned backups'),target=path.join(root,'encrypted copies'),data=path.join(root,'data'),key=Buffer.alloc(32,17),keyFile=path.join(config,'recovery-backup.key');for(const dir of [config,source,target])fs.mkdirSync(dir);
 const records=[0,1,20].map(age=>{const fileName='recovery_'+randomUUID()+'.fo-recovery',bytes=encryptRecovery(Buffer.from('Synthetic transport inspection payload'),key);fs.writeFileSync(path.join(source,fileName),bytes);return {fileName,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),capturedAt:Date.now()-age*86400000};});
 fs.writeFileSync(keyFile,key);if(mode!=='missing-config')fs.writeFileSync(path.join(config,'recovery-backup.json'),JSON.stringify({format:1,enabled:true,backupRoot:source,keyFile,includeCredentials:true,includeSettings:[],includeFiles:[],includeEnv:[]}));
 const packet:any={copyRoot:target,records,keepCount:2,keepDays:7};if(mode==='extra-key')packet.key=key.toString('hex');if(mode==='missing-target')packet.copyRoot=path.join(root,'not created');if(mode==='wrong-key')fs.writeFileSync(keyFile,Buffer.alloc(32,18));
 const env:NodeJS.ProcessEnv={};for(const name of ['PATH','SystemRoot','windir','TEMP','TMP','HOME','USERPROFILE'])if(process.env[name])env[name]=process.env[name];Object.assign(env,{NODE_ENV:'production',APP_CODE_ROOT:repo,DATA_DIR:data,CONFIG_DIR:config,LOG_DIR:path.join(root,'logs'),FO_NETWORK_ATTEMPTS:path.join(root,'network.jsonl')});
 async function run(flag:string){const child=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',tsx,path.join(repo,'server/operator.ts'),flag],{cwd:root,env,stdio:['pipe','pipe','pipe']});let output='',errors='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>errors+=v);child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(packet));const timeout=setTimeout(()=>child.kill('SIGKILL'),15000);try{const result=await new Promise<any>((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});expect(result.signal,output+errors).toBeNull();expect(output+errors).not.toContain(key.toString('hex'));expect(output+errors).not.toContain('Synthetic transport inspection payload');return {...result,value:JSON.parse(output.trim()),output,errors};}finally{clearTimeout(timeout);}}
 try{
  const copy=await run('--copy-recovery');if(mode==='copy-prune'){expect(copy.code,copy.output+copy.errors).toBe(0);expect(copy.value).toEqual({copied:3,pruned:0,retained:3,receipts:records});for(const rec of records)expect(fs.readFileSync(path.join(target,rec.fileName))).toEqual(fs.readFileSync(path.join(source,rec.fileName)));const repeated=await run('--copy-recovery');expect(repeated.code).toBe(0);expect(repeated.value.copied).toBe(0);const prune=await run('--prune-recovery');expect(prune.code,prune.output+prune.errors).toBe(0);expect(prune.value).toMatchObject({copied:0,pruned:1,retained:2});expect(fs.readdirSync(source).sort()).toEqual(records.slice(0,2).map(x=>x.fileName).sort());expect(fs.readdirSync(target).length).toBe(3);expect(fs.readFileSync(keyFile)).toEqual(key);}
  else{expect(copy.code).toBe(1);expect(copy.value).toEqual({error:mode==='missing-config'?'RECOVERY_MAINTENANCE_CONFIGURATION_REQUIRED':mode==='extra-key'?'RECOVERY_MAINTENANCE_INPUT_INVALID':mode==='missing-target'?'RECOVERY_MAINTENANCE_PATH_INVALID':'RECOVERY_MAINTENANCE_AUTH_INVALID'});expect(fs.readdirSync(source).sort()).toEqual(records.map(x=>x.fileName).sort());expect(fs.readdirSync(target)).toEqual([]);}
  expect(fs.existsSync(data)).toBe(false);expect(fs.existsSync(path.join(root,'network.jsonl'))?fs.readFileSync(path.join(root,'network.jsonl'),'utf8'):'').toBe('');
 }finally{key.fill(0);fs.rmSync(root,{recursive:true,force:true});}
}
it.each(['copy-prune','missing-config','extra-key','missing-target','wrong-key'])('trusted offline maintenance %s copies only ciphertext and never opens source storage',mode=>scenario(mode),20000);
