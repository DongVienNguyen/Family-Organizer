import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {encryptRecovery,decryptRecovery,recoveryEnvelopeLimit,recoveryEnvelopeOverhead,RecoveryEnvelopeError} from './recoveryEnvelope.js';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../scripts/lib/native-paths.mjs';
import type {AppConfig} from './config.js';
export class RecoveryOperatorError extends Error {}
function refuse(code:string):never{throw new RecoveryOperatorError(code);}
function input(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))refuse('RECOVERY_INPUT_INVALID');
 const row=value as Record<string,unknown>;
 if(Object.keys(row).length!==3||row.includeCredentials!==true||typeof row.key!=='string'||!/^[a-f0-9]{64}$/.test(row.key)||typeof row.file!=='string'||row.file.length>4096||!isFullyQualifiedPath(row.file)||/^[\\/]{2}/.test(row.file)||row.file.includes('\0')||!row.file.endsWith('.fo-recovery'))refuse('RECOVERY_INPUT_INVALID');
 return {file:path.resolve(row.file),key:Buffer.from(row.key,'hex')};
}
function contained(root:string,file:string){const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function checkPath(file:string,config:AppConfig|undefined,restore:boolean){
 try{
  const components=file.slice(path.parse(file).root.length).split(path.sep);
  if(components.some(part=>!part||part.normalize('NFC')!==part||/[<>:\x22|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(part)))refuse('RECOVERY_PATH_INVALID');
  assertNoLinkedAncestors(file);
  if(!fs.statSync(path.dirname(file)).isDirectory())refuse('RECOVERY_PATH_INVALID');
  if(config&&[config.codeRoot,config.dataRoot,config.configRoot,config.logRoot].some(root=>contained(root,file)))refuse('RECOVERY_PATH_INVALID');
  const stat=fs.lstatSync(file,{throwIfNoEntry:false});
  if(restore?(!stat?.isFile()||stat.size>recoveryEnvelopeLimit+recoveryEnvelopeOverhead):!!stat)refuse('RECOVERY_PATH_INVALID');
 }catch{refuse('RECOVERY_PATH_INVALID');}
}
function readEncrypted(file:string){
 const fd=fs.openSync(file,'r');try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>recoveryEnvelopeLimit+recoveryEnvelopeOverhead)refuse('RECOVERY_PATH_INVALID');const bytes=Buffer.alloc(stat.size);let count=0;while(count<bytes.length){const read=fs.readSync(fd,bytes,count,bytes.length-count,null);if(!read)refuse('RECOVERY_ENVELOPE_INVALID');count+=read;}if(fs.readSync(fd,Buffer.alloc(1),0,1,null)!==0)refuse('RECOVERY_ENVELOPE_INVALID');return bytes;}finally{fs.closeSync(fd);}
}
/** Offline local operator; the owned Windows wrapper confirms Stopped/closed handles. */
export async function runRecoveryOperator(value:unknown,restore:boolean){
 const selected=input(value);let plaintext:Buffer|undefined;
 try{
  // Authenticate before configuration/storage imports; wrong keys never open the target DB.
  checkPath(selected.file,undefined,restore);
  let snapshot:unknown;
  if(restore){
   plaintext=decryptRecovery(readEncrypted(selected.file),selected.key);
   try{snapshot=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));}catch{refuse('RECOVERY_SNAPSHOT_INVALID');}
  }
  const {appConfig}=await import('./config.js');checkPath(selected.file,appConfig,restore);
  if(!fs.existsSync(path.join(appConfig.dataRoot,'family.db')))refuse('RECOVERY_STORE_REQUIRED');
  const sqlite=await import('./sqlite.js');
  try{
   const engine=await import('./appSnapshot.js');
   if(restore){
    let checked;
    try{checked=engine.validateAppSnapshot(snapshot);if(checked.manifest.credentials!==undefined)refuse('RECOVERY_SNAPSHOT_INVALID');}catch{refuse('RECOVERY_SNAPSHOT_INVALID');}
    const result=await engine.restoreAppSnapshot(checked,{maintenance:async work=>work()});sqlite.sqliteCheckpoint();
    return {...result,sessionsRevoked:true};
   }
   const {withAppWriteTransaction}=await import('./appStore.js');
   const collected=withAppWriteTransaction({actorId:'operator:recovery',command:'operator:recovery:read',requestId:randomUUID(),payloadHash:'encrypted-recovery-v1'},tx=>engine.collectAppSnapshot(tx));
   plaintext=Buffer.from(JSON.stringify(collected));const bytes=encryptRecovery(plaintext,selected.key);
   // Exclusive creation; never replace a previous recovery file or expose plaintext staging.
   checkPath(selected.file,appConfig,false);let created=false;
   try{const fd=fs.openSync(selected.file,'wx',0o600);created=true;try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}catch(error){if(created)fs.unlinkSync(selected.file);throw error;}
   return {encrypted:true,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }finally{sqlite.sqliteClose();}
 }catch(error){if(error instanceof RecoveryEnvelopeError||error instanceof RecoveryOperatorError)throw error;refuse('RECOVERY_OPERATION_FAILED');}
 finally{selected.key.fill(0);plaintext?.fill(0);}
}
