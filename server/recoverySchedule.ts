import fs from 'node:fs';
import path from 'node:path';
import {TextDecoder} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../scripts/lib/native-paths.mjs';
import {recoveryProtectedRoots} from './recoveryOperator.js';
import {validateSettingSelection,type SettingGroup} from './recoverySettings.js';
import {validateFileSelection,type FileGroup} from './recoveryFiles.js';
import {validateEnvSelection,type EnvGroup} from './recoveryEnv.js';
import type {AppConfig} from './config.js';
export class RecoveryScheduleError extends Error {}
export interface DisabledBackupConfig {readonly format:1;readonly enabled:false}
export interface EnabledBackupConfig {readonly format:1;readonly enabled:true;readonly backupRoot:string;readonly keyFile:string;readonly includeCredentials:true;readonly includeSettings:readonly SettingGroup[];readonly includeFiles:readonly FileGroup[];readonly includeEnv:readonly EnvGroup[]}
export type BackupConfiguration=DisabledBackupConfig|EnabledBackupConfig;
const disabled:DisabledBackupConfig=Object.freeze({format:1,enabled:false});
function refuse(code='RECOVERY_BACKUP_CONFIG_INVALID'):never{throw new RecoveryScheduleError(code);}
function within(root:string,file:string){const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function ordinaryPath(value:unknown):string{
 if(typeof value!=='string'||value.length>4096||!isFullyQualifiedPath(value)||/^[\\/]{2}/.test(value))refuse();
 const file=path.resolve(value),parts=file.slice(path.parse(file).root.length).split(path.sep);
 if(parts.some(part=>!part||part.normalize('NFC')!==part||/[<>:\x22|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(part)))refuse();
 assertNoLinkedAncestors(file);return file;
}
export function validateBackupConfig(value:unknown,config:AppConfig):BackupConfiguration{
 try{
  if(!value||typeof value!=='object'||Array.isArray(value))refuse();const row=value as Record<string,unknown>;
  if(row.format!==1)refuse();if(row.enabled===false){if(Object.keys(row).sort().join(',')!=='enabled,format')refuse();return disabled;}
  if(row.enabled!==true||row.includeCredentials!==true||Object.keys(row).sort().join(',')!=='backupRoot,enabled,format,includeCredentials,includeEnv,includeFiles,includeSettings,keyFile')refuse();
  const backupRoot=ordinaryPath(row.backupRoot),keyFile=ordinaryPath(row.keyFile),roots=recoveryProtectedRoots(config);
  if(roots.some(root=>within(root,backupRoot)||within(backupRoot,root))||within(backupRoot,keyFile)||path.relative(path.join(config.configRoot,'recovery-backup.key'),keyFile)!=='')refuse();
  return Object.freeze({format:1,enabled:true,backupRoot,keyFile,includeCredentials:true,includeSettings:Object.freeze(validateSettingSelection(row.includeSettings)),includeFiles:Object.freeze(validateFileSelection(row.includeFiles)),includeEnv:Object.freeze(validateEnvSelection(row.includeEnv))});
 }catch{refuse();}
}
/** Counted ordinary-file reads; returned buffer belongs to the caller. */
function readBounded(file:string,limit:number,code:string,exact?:number):Buffer{
 let fd:number|undefined,bytes:Buffer|undefined,complete=false;
 try{
  assertNoLinkedAncestors(file);const prior=fs.lstatSync(file);if(!prior.isFile()||prior.isSymbolicLink()||prior.nlink!==1||prior.size>limit||(exact!==undefined&&prior.size!==exact))refuse(code);
  fd=fs.openSync(file,'r');const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||stat.dev!==prior.dev||stat.ino!==prior.ino||stat.size>limit||(exact!==undefined&&stat.size!==exact))refuse(code);
  bytes=Buffer.alloc(stat.size);let count=0;while(count<bytes.length){const read=fs.readSync(fd,bytes,count,bytes.length-count,null);if(!read)refuse(code);count+=read;}
  const extra=Buffer.alloc(1);try{if(fs.readSync(fd,extra,0,1,null)!==0)refuse(code);}finally{extra.fill(0);}
  complete=true;return bytes;
 }catch{refuse(code);}finally{if(!complete)bytes?.fill(0);if(fd!==undefined){try{fs.closeSync(fd);}catch{bytes?.fill(0);refuse(code);}}}
}
export function readBackupConfiguration(config:AppConfig):BackupConfiguration{
 const file=path.join(config.configRoot,'recovery-backup.json');let bytes:Buffer|undefined;
 try{assertNoLinkedAncestors(file);if(!fs.lstatSync(file,{throwIfNoEntry:false}))return disabled;bytes=readBounded(file,16384,'RECOVERY_BACKUP_CONFIG_INVALID');return validateBackupConfig(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),config);}catch{refuse();}finally{bytes?.fill(0);}
}
export function readBackupKey(keyFile:string):Buffer{return readBounded(keyFile,32,'RECOVERY_BACKUP_KEY_INVALID',32);}
export function backupAge(lastSuccessAt:number|null,now:number):{status:'never'|'ok'|'stale'|'clock-invalid';ageMs:number|null}{
 if(!Number.isSafeInteger(now)||now<0||(lastSuccessAt!==null&&(!Number.isSafeInteger(lastSuccessAt)||lastSuccessAt<0||lastSuccessAt>now)))return {status:'clock-invalid',ageMs:null};
 if(lastSuccessAt===null)return {status:'never',ageMs:null};const ageMs=now-lastSuccessAt;return {status:ageMs>=86400000?'stale':'ok',ageMs};
}
export interface BackupReceipt {encrypted:true;bytes:number;sha256:string}
export interface PersistedBackupState {format:1;lastSuccessAt:number;sha256:string;fileName:string;bytes:number}
export interface PersistedBackupStatus {format:2;lastSuccess:PersistedBackupState|null;lastError:string|null}
export type BackupState=PersistedBackupState|PersistedBackupStatus;
const safeErrors=new Set(['RECOVERY_STORAGE_FULL','RECOVERY_PATH_INVALID','RECOVERY_RUNTIME_NOT_READY','RECOVERY_BACKUP_KEY_INVALID','RECOVERY_ENV_INVALID','RECOVERY_FILES_INVALID','RECOVERY_SETTINGS_INVALID','RECOVERY_PENDING_RESTORE','RECOVERY_OPERATION_FAILED','RECOVERY_BACKUP_RECEIPT_INVALID','RECOVERY_BACKUP_FAILED']);
function safeBackupError(error:unknown):string {if(error&&typeof error==='object'&&['SQLITE_FULL','ENOSPC','EDQUOT'].includes(String((error as NodeJS.ErrnoException).code)))return 'RECOVERY_STORAGE_FULL';const message=error instanceof Error?error.message:'';return safeErrors.has(message)?message:'RECOVERY_BACKUP_FAILED';}
export interface BackupSchedulePorts {capture:(value:unknown)=>Promise<BackupReceipt>;readState:()=>unknown;writeState:(state:BackupState)=>void;readRestoreEpoch?:()=>string}
export interface BackupHealth {enabled:boolean;status:'disabled'|'never'|'ok'|'stale'|'clock-invalid'|'failed';lastSuccessAt:number|null;ageMs:number|null;diskFull:boolean;lastError:string|null}
export function registerRecoveryBackupSchedule(jobs:import('./appJobs.js').AppJobs,configuration:BackupConfiguration,ports:BackupSchedulePorts):(now?:number)=>BackupHealth {
 if(!configuration.enabled)return ()=>({enabled:false,status:'disabled',lastSuccessAt:null,ageMs:null,diskFull:false,lastError:null});
 let lastSuccessAt:number|null=null,lastError:string|null=null,lastRecord:PersistedBackupState|null=null;
 let saved=ports.readState();
 if(saved&&typeof saved==='object'&&!Array.isArray(saved)&&(saved as PersistedBackupStatus).format===2){const status=saved as PersistedBackupStatus;if(Object.keys(status).sort().join(',')!=='format,lastError,lastSuccess'||(status.lastError!==null&&(typeof status.lastError!=='string'||!safeErrors.has(status.lastError))))refuse('RECOVERY_BACKUP_STATE_INVALID');lastError=status.lastError;saved=status.lastSuccess;}

 if(saved!==null&&saved!==undefined){
  if(!saved||typeof saved!=='object'||Array.isArray(saved))refuse('RECOVERY_BACKUP_STATE_INVALID');const row=saved as PersistedBackupState;
  if(Object.keys(row).sort().join(',')!=='bytes,fileName,format,lastSuccessAt,sha256'||row.format!==1||!Number.isSafeInteger(row.lastSuccessAt)||row.lastSuccessAt<0||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||typeof row.fileName!=='string'||!/^recovery_[a-f0-9-]{36}\.fo-recovery$/.test(row.fileName)||!Number.isSafeInteger(row.bytes)||row.bytes<=48||row.bytes>256*1024*1024+48)refuse('RECOVERY_BACKUP_STATE_INVALID');lastSuccessAt=row.lastSuccessAt;lastRecord={...row};
 }
 const configurationHash=createHash('sha256').update(JSON.stringify(configuration)).digest('hex');
 jobs.registerAppJob('core-recovery','encrypted-backup',async()=>{
  let key:Buffer|undefined;
  try{
   key=readBackupKey(configuration.keyFile);const fileName='recovery_'+randomUUID()+'.fo-recovery';
   const result=await ports.capture({file:path.join(configuration.backupRoot,fileName),key:key.toString('hex'),includeCredentials:true,includeSettings:[...configuration.includeSettings],includeFiles:[...configuration.includeFiles],includeEnv:[...configuration.includeEnv]});
   if(!result||result.encrypted!==true||!Number.isSafeInteger(result.bytes)||result.bytes<=48||result.bytes>256*1024*1024+48||typeof result.sha256!=='string'||!/^[a-f0-9]{64}$/.test(result.sha256))refuse('RECOVERY_BACKUP_RECEIPT_INVALID');
   const completedAt=Date.now();if(!Number.isSafeInteger(completedAt)||completedAt<0)refuse('RECOVERY_BACKUP_RECEIPT_INVALID');
   ports.writeState({format:2,lastSuccess:{format:1,lastSuccessAt:completedAt,sha256:result.sha256,fileName,bytes:result.bytes},lastError:null});lastSuccessAt=completedAt;lastRecord={format:1,lastSuccessAt:completedAt,sha256:result.sha256,fileName,bytes:result.bytes};lastError=null;
  }catch(error){lastError=safeBackupError(error);try{ports.writeState({format:2,lastSuccess:lastRecord,lastError});}catch(persistenceError){if(safeBackupError(persistenceError)==='RECOVERY_STORAGE_FULL')lastError='RECOVERY_STORAGE_FULL';}throw new RecoveryScheduleError(lastError);}
  finally{key?.fill(0);}
 },{everyMs:12*3600000,initialMs:0,kind:'command',occurrenceKey:now=>{const epoch=ports.readRestoreEpoch?.()??'initial';if(typeof epoch!=='string'||epoch.length>256)refuse('RECOVERY_BACKUP_STATE_INVALID');return 'interval:'+Math.floor((now.getTime()+7*3600000)/(12*3600000))+':'+configurationHash+':'+createHash('sha256').update(epoch).digest('hex');}});
 return (now=Date.now())=>{const age=backupAge(lastSuccessAt,now);let error=lastError;
  if(!error&&lastRecord&&age.status!=='clock-invalid'){try{const file=path.join(configuration.backupRoot,lastRecord.fileName);assertNoLinkedAncestors(file);const stat=fs.lstatSync(file,{throwIfNoEntry:false});if(!stat)error='RECOVERY_BACKUP_MISSING';else if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size!==lastRecord.bytes)error='RECOVERY_BACKUP_FILE_INVALID';}catch{error='RECOVERY_BACKUP_FILE_INVALID';}}
  return {enabled:true,status:error?'failed':age.status,lastSuccessAt,ageMs:age.ageMs,diskFull:error==='RECOVERY_STORAGE_FULL',lastError:error};};
}
