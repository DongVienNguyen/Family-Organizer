import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {encryptRecovery,decryptRecovery,recoveryEnvelopeLimit,recoveryEnvelopeOverhead,RecoveryEnvelopeError} from './recoveryEnvelope.js';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../scripts/lib/native-paths.mjs';
import {captureRecoverySettings,selectRecoverySettings,validateSettingSelection,RecoverySettingsError,type ValidatedSettingPatch} from './recoverySettings.js';
import {captureRecoveryEnv,selectRecoveryEnv,validateEnvSelection,RecoveryEnvError,type ValidatedEnvPatch} from './recoveryEnv.js';
import {captureRecoveryFiles,selectRecoveryFiles,validateFileSelection,RecoveryFilesError,type ValidatedFilePatch} from './recoveryFiles.js';
import type {AppConfig} from './config.js';
export class RecoveryOperatorError extends Error {}
function refuse(code:string):never{throw new RecoveryOperatorError(code);}
function input(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))refuse('RECOVERY_INPUT_INVALID');
 const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!['file','key','includeCredentials','includeSettings','includeFiles','includeEnv'].includes(key))||row.includeCredentials!==true||typeof row.key!=='string'||!/^[a-f0-9]{64}$/.test(row.key)||typeof row.file!=='string'||row.file.length>4096||!isFullyQualifiedPath(row.file)||/^[\\/]{2}/.test(row.file)||row.file.includes('\0')||!row.file.endsWith('.fo-recovery'))refuse('RECOVERY_INPUT_INVALID');
 let settingGroups,fileGroups,envGroups;try{envGroups=validateEnvSelection(row.includeEnv===undefined?[]:row.includeEnv);fileGroups=validateFileSelection(row.includeFiles===undefined?[]:row.includeFiles);settingGroups=validateSettingSelection(row.includeSettings===undefined?[]:row.includeSettings);}catch{refuse('RECOVERY_INPUT_INVALID');}
 return {file:path.resolve(row.file),key:Buffer.from(row.key,'hex'),settingGroups,fileGroups,envGroups};
}
function contained(root:string,file:string){const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
export function recoveryProtectedRoots(config:AppConfig):string[]{
 const roots=[config.codeRoot,config.dataRoot,config.configRoot,config.logRoot];
 const entry=path.resolve(process.argv[1]??''),dist=path.dirname(entry),app=path.dirname(dist);
 if(path.basename(entry).toLowerCase()==='operator.cjs'&&path.basename(dist).toLowerCase()==='dist'&&path.basename(app).toLowerCase()==='app')roots.push(path.dirname(app));
 const loadedDist=path.resolve(import.meta.dirname),loadedApp=path.dirname(loadedDist);
 if(path.basename(loadedDist).toLowerCase()==='dist'&&path.basename(loadedApp).toLowerCase()==='app')roots.push(path.dirname(loadedApp));
 return roots;
}
function checkPath(file:string,config:AppConfig|undefined,restore:boolean){
 try{
  const components=file.slice(path.parse(file).root.length).split(path.sep);
  if(components.some(part=>!part||part.normalize('NFC')!==part||/[<>:\x22|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(part)))refuse('RECOVERY_PATH_INVALID');
  assertNoLinkedAncestors(file);
  if(!fs.statSync(path.dirname(file)).isDirectory())refuse('RECOVERY_PATH_INVALID');
  if(config){
   const roots=recoveryProtectedRoots(config);
   if(roots.some(root=>contained(root,file)))refuse('RECOVERY_PATH_INVALID');
  }
  const stat=fs.lstatSync(file,{throwIfNoEntry:false});
  if(restore?(!stat?.isFile()||stat.size>recoveryEnvelopeLimit+recoveryEnvelopeOverhead):!!stat)refuse('RECOVERY_PATH_INVALID');
 }catch{refuse('RECOVERY_PATH_INVALID');}
}
function readEncrypted(file:string){
 const fd=fs.openSync(file,'r');try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>recoveryEnvelopeLimit+recoveryEnvelopeOverhead)refuse('RECOVERY_PATH_INVALID');const bytes=Buffer.alloc(stat.size);let count=0;while(count<bytes.length){const read=fs.readSync(fd,bytes,count,bytes.length-count,null);if(!read)refuse('RECOVERY_ENVELOPE_INVALID');count+=read;}if(fs.readSync(fd,Buffer.alloc(1),0,1,null)!==0)refuse('RECOVERY_ENVELOPE_INVALID');return bytes;}finally{fs.closeSync(fd);}
}
/** Offline local operator; the owned Windows wrapper confirms Stopped/closed handles. */
export async function runRecoveryOperator(value:unknown,restore:boolean){
 return runRecovery(value,restore,true);
}
/** Internal runtime port borrows its live SQLite owner; it never closes that owner. */
export async function runOnlineRecoveryBackup(value:unknown,assertReady:()=>void){
 return runRecovery(value,false,false,assertReady);
}
async function runRecovery(value:unknown,restore:boolean,ownsStorage:boolean,assertReady?:()=>void){
 const selected=input(value);let plaintext:Buffer|undefined;
 try{
  // Authenticate before configuration/storage imports; wrong keys never open the target DB.
  checkPath(selected.file,undefined,restore);
  let encrypted:Buffer|undefined;let snapshot:unknown,privateSettings:ValidatedSettingPatch|undefined,privateFiles:ValidatedFilePatch|undefined,privateEnv:ValidatedEnvPatch|undefined;
  if(restore){
   encrypted=readEncrypted(selected.file);plaintext=decryptRecovery(encrypted,selected.key);
   let payload:any;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));}catch{refuse('RECOVERY_SNAPSHOT_INVALID');}
   if(payload&&typeof payload==='object'&&Object.hasOwn(payload,'format')){
    const withEnv=payload.format==='family-organizer-private-env-v1',withFiles=withEnv||payload.format==='family-organizer-private-files-v1';
    if(withEnv)privateEnv=selectRecoveryEnv(payload.privateEnv,selected.envGroups);else if(selected.envGroups.length)refuse('RECOVERY_ENV_INVALID');
    if((!withFiles&&payload.format!=='family-organizer-private-settings-v1')||Object.keys(payload).sort().join(',')!==(withEnv?'format,privateEnv,privateFiles,privateSettings,snapshot':withFiles?'format,privateFiles,privateSettings,snapshot':'format,privateSettings,snapshot'))refuse('RECOVERY_SNAPSHOT_INVALID');
    if(withFiles)privateFiles=selectRecoveryFiles(payload.privateFiles,selected.fileGroups);else if(selected.fileGroups.length)refuse('RECOVERY_FILES_INVALID');
    privateSettings=selectRecoverySettings(payload.privateSettings,selected.settingGroups);snapshot=payload.snapshot;
   }else{if(selected.envGroups.length)refuse('RECOVERY_ENV_INVALID');if(selected.fileGroups.length)refuse('RECOVERY_FILES_INVALID');if(selected.settingGroups.length)refuse('RECOVERY_SETTINGS_INVALID');snapshot=payload;}
  }
  const {appConfig}=await import('./config.js');checkPath(selected.file,appConfig,restore);
  if(fs.lstatSync(path.join(appConfig.dataRoot,'restore-journal.json'),{throwIfNoEntry:false}))refuse('RECOVERY_PENDING_RESTORE');
  if(!fs.existsSync(path.join(appConfig.dataRoot,'family.db')))refuse('RECOVERY_STORE_REQUIRED');
  if(restore){
   try{const {inspectRecoverySnapshot}=await import('./recoverySnapshotInspection.js');inspectRecoverySnapshot(snapshot,path.join(appConfig.dataRoot,'family.db'));}catch{refuse('RECOVERY_SNAPSHOT_INVALID');}
  }
  const sqlite=await import('./sqlite.js');
  try{
   const engine=await import('./appSnapshot.js');
   if(restore){
    let checked;
    try{checked=engine.validateAppSnapshot(snapshot);if(checked.manifest.credentials!==undefined)refuse('RECOVERY_SNAPSHOT_INVALID');}catch{refuse('RECOVERY_SNAPSHOT_INVALID');}
    const result=await engine.restoreAppSnapshot(checked,{maintenance:async work=>work(),...(privateSettings!==undefined?{privateSettings}:{}),...(privateFiles!==undefined?{privateFiles}:{}),...(privateEnv!==undefined?{privateEnv}:{}),identity:createHash('sha256').update(encrypted!).update(JSON.stringify(selected.settingGroups)).update(selected.fileGroups.length?'files:'+JSON.stringify(selected.fileGroups):'').update(selected.envGroups.length?'env:'+JSON.stringify(selected.envGroups):'').digest('hex')});sqlite.sqliteCheckpoint();
    return {...result,sessionsRevoked:true,...(selected.settingGroups.length?{restoredSettings:selected.settingGroups}:{}),...(selected.fileGroups.length?{restoredFilesSelection:selected.fileGroups}:{}),...(selected.envGroups.length?{restoredEnv:selected.envGroups}:{})};
   }
   const {withAppWriteTransaction,markSnapshotReadResult}=await import('./appStore.js');
   const {readSettings,readSigningKeyFile,readEnvFile}=await import('./snapshotFiles.js');
   assertReady?.();
   const collected=withAppWriteTransaction({actorId:'operator:recovery',command:'operator:recovery:read',requestId:randomUUID(),payloadHash:'encrypted-recovery-v1'},tx=>{
    const snapshot=engine.collectAppSnapshot(tx);
    if(selected.envGroups.length){const bytes=selected.fileGroups.length?readSigningKeyFile():undefined;try{return markSnapshotReadResult({format:'family-organizer-private-env-v1',snapshot,privateSettings:captureRecoverySettings(selected.settingGroups.length?readSettings():{},selected.settingGroups),privateFiles:captureRecoveryFiles({sessionSigningKey:bytes},selected.fileGroups),privateEnv:captureRecoveryEnv(readEnvFile()??'',selected.envGroups)});}finally{bytes?.fill(0);}}
    if(selected.fileGroups.length){const bytes=readSigningKeyFile();try{return markSnapshotReadResult({format:'family-organizer-private-files-v1',snapshot,privateSettings:captureRecoverySettings(selected.settingGroups.length?readSettings():{},selected.settingGroups),privateFiles:captureRecoveryFiles({sessionSigningKey:bytes},selected.fileGroups)});}finally{bytes?.fill(0);}}
    return selected.settingGroups.length?markSnapshotReadResult({format:'family-organizer-private-settings-v1',snapshot,privateSettings:captureRecoverySettings(readSettings(),selected.settingGroups)}):snapshot;
   });
   plaintext=Buffer.from(JSON.stringify(collected));const bytes=encryptRecovery(plaintext,selected.key);
   // Exclusive creation; never replace a previous recovery file or expose plaintext staging.
   checkPath(selected.file,appConfig,false);let created=false;
   try{const fd=fs.openSync(selected.file,'wx',0o600);created=true;try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}catch(error){if(created)fs.unlinkSync(selected.file);throw error;}
   return {encrypted:true,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...(selected.settingGroups.length?{includedSettings:selected.settingGroups}:{}),...(selected.fileGroups.length?{includedFiles:selected.fileGroups}:{}),...(selected.envGroups.length?{includedEnv:selected.envGroups}:{})};
  }finally{if(ownsStorage)sqlite.sqliteClose();}
 }catch(error){if(error instanceof RecoverySettingsError||error instanceof RecoveryFilesError||error instanceof RecoveryEnvError)refuse(error.message);if(error instanceof RecoveryEnvelopeError||error instanceof RecoveryOperatorError)throw error;if(error&&typeof error==='object'&&['ENOSPC','EDQUOT'].includes(String((error as NodeJS.ErrnoException).code)))refuse('RECOVERY_STORAGE_FULL');refuse('RECOVERY_OPERATION_FAILED');}
 finally{selected.key.fill(0);plaintext?.fill(0);}
}
