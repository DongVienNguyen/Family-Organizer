import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {AppConfig} from './config.js';
import {readBackupConfiguration,readBackupKey,validateBackupConfig} from './recoverySchedule.js';
import {authenticateRecovery,recoveryEnvelopeLimit,recoveryEnvelopeOverhead} from './recoveryEnvelope.js';
import {assertNoLinkedAncestors} from '../scripts/lib/native-paths.mjs';
export interface RecoveryRecord {fileName:string;sha256:string;bytes:number;capturedAt:number}
export interface RecoveryRetentionPolicy {keepCount:number;keepDays:number}
export interface RecoveryMaintenanceRequest {copyRoot:string;records:RecoveryRecord[];keepCount:number;keepDays:number}
export class RecoveryRetentionError extends Error {}
function refuse(code='RECOVERY_MAINTENANCE_INPUT_INVALID'):never{throw new RecoveryRetentionError(code);}
function noLinks(file:string){try{assertNoLinkedAncestors(file);}catch{refuse('RECOVERY_MAINTENANCE_PATH_INVALID');}}
function contains(root:string,file:string){const rel=path.relative(root,file);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function validate(records:unknown,policy:RecoveryRetentionPolicy,now:number):RecoveryRecord[]{
 if(!policy||Object.keys(policy).sort().join(',')!=='keepCount,keepDays'||!Number.isSafeInteger(policy.keepCount)||policy.keepCount<2||policy.keepCount>64||!Number.isSafeInteger(policy.keepDays)||policy.keepDays<7||policy.keepDays>365||!Number.isSafeInteger(now)||now<0||!Array.isArray(records)||records.length<1||records.length>64)refuse();
 const seen=new Set<string>();
 return records.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='bytes,capturedAt,fileName,sha256'||typeof row.fileName!=='string'||!/^recovery_[a-f0-9-]{36}\.fo-recovery$/.test(row.fileName)||seen.has(row.fileName)||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<=recoveryEnvelopeOverhead||row.bytes>recoveryEnvelopeLimit+recoveryEnvelopeOverhead||!Number.isSafeInteger(row.capturedAt)||row.capturedAt<0||row.capturedAt>now)refuse();
  seen.add(row.fileName);return {...row};
 });
}
export function planRecoveryRetention(records:readonly RecoveryRecord[],policy:RecoveryRetentionPolicy,now:number):{retained:RecoveryRecord[];prunable:RecoveryRecord[]}{
 const sorted=validate(records,policy,now).sort((a,b)=>b.capturedAt-a.capturedAt||a.fileName.localeCompare(b.fileName)),retained:RecoveryRecord[]=[],prunable:RecoveryRecord[]=[];
 sorted.forEach((row,index)=>(index<policy.keepCount||now-row.capturedAt<policy.keepDays*86400000?retained:prunable).push(row));return {retained,prunable};
}
interface CheckedFile {bytes:Buffer;stat:fs.Stats}
function ordinary(file:string):fs.Stats{
 try{noLinks(file);const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)refuse('RECOVERY_MAINTENANCE_PATH_INVALID');return stat;}catch(error){if(error instanceof RecoveryRetentionError)throw error;refuse('RECOVERY_MAINTENANCE_PATH_INVALID');}
}
function readChecked(file:string,record:RecoveryRecord,key:Buffer):CheckedFile{
 const prior=ordinary(file);let fd:number|undefined,bytes:Buffer|undefined,completed=false;
 try{
  if(prior.size!==record.bytes)refuse('RECOVERY_MAINTENANCE_AUTH_INVALID');fd=fs.openSync(file,'r');const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.nlink!==1||stat.dev!==prior.dev||stat.ino!==prior.ino||stat.size!==record.bytes)refuse('RECOVERY_MAINTENANCE_PATH_INVALID');
  bytes=Buffer.alloc(record.bytes);let count=0;while(count<bytes.length){const read=fs.readSync(fd,bytes,count,bytes.length-count,null);if(!read)refuse('RECOVERY_MAINTENANCE_AUTH_INVALID');count+=read;}
  const extra=Buffer.alloc(1);try{if(fs.readSync(fd,extra,0,1,null)!==0)refuse('RECOVERY_MAINTENANCE_AUTH_INVALID');}finally{extra.fill(0);}
  if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)refuse('RECOVERY_MAINTENANCE_AUTH_INVALID');
  try{authenticateRecovery(bytes,key);}catch{refuse('RECOVERY_MAINTENANCE_AUTH_INVALID');}
  const after=fs.fstatSync(fd);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)refuse('RECOVERY_MAINTENANCE_AUTH_INVALID');completed=true;return {bytes,stat};
 }finally{if(!completed)bytes?.fill(0);if(fd!==undefined){try{fs.closeSync(fd);}catch{bytes?.fill(0);throw new RecoveryRetentionError('RECOVERY_MAINTENANCE_FAILED');}}}
}
function authenticate(file:string,record:RecoveryRecord,key:Buffer){const checked=readChecked(file,record,key);checked.bytes.fill(0);return checked.stat;}
/** Explicit operator batch, not a new scheduler or snapshot/restore engine. */
export async function maintainRecoveryBackups(value:unknown,config:AppConfig,prune=false):Promise<{copied:number;pruned:number;retained:number;receipts:RecoveryRecord[]}>{
 let key:Buffer|undefined;
 try{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='copyRoot,keepCount,keepDays,records')refuse();const input=value as RecoveryMaintenanceRequest,policy={keepCount:input.keepCount,keepDays:input.keepDays},records=validate(input.records,policy,Date.now());
  const configuration=readBackupConfiguration(config);if(!configuration.enabled)refuse('RECOVERY_MAINTENANCE_CONFIGURATION_REQUIRED');
  let target:string;try{const checked=validateBackupConfig({...configuration,backupRoot:input.copyRoot},config);if(!checked.enabled)refuse();target=checked.backupRoot;if(contains(configuration.backupRoot,target)||contains(target,configuration.backupRoot))refuse();for(const root of [configuration.backupRoot,target]){noLinks(root);if(!fs.lstatSync(root).isDirectory())refuse();}}catch{refuse('RECOVERY_MAINTENANCE_PATH_INVALID');}
  key=readBackupKey(configuration.keyFile);
  // Authenticate every declared source and existing destination before any write/delete.
  const existing=new Set<string>();
  for(const record of records){authenticate(path.join(configuration.backupRoot,record.fileName),record,key);const copy=path.join(target!,record.fileName);noLinks(copy);if(fs.lstatSync(copy,{throwIfNoEntry:false})){authenticate(copy,record,key);existing.add(record.fileName);}else if(prune)refuse('RECOVERY_MAINTENANCE_COPY_REQUIRED');}
  const plan=planRecoveryRetention(records,policy,Date.now());let copied=0,pruned=0;
  if(!prune){
   for(const record of records){if(existing.has(record.fileName))continue;const checked=readChecked(path.join(configuration.backupRoot,record.fileName),record,key),copy=path.join(target!,record.fileName);let fd:number|undefined,created=false;
    try{noLinks(copy);fd=fs.openSync(copy,'wx',0o600);created=true;let offset=0;while(offset<checked.bytes.length){const count=fs.writeSync(fd,checked.bytes,offset,checked.bytes.length-offset);if(count<=0)refuse('RECOVERY_MAINTENANCE_FAILED');offset+=count;}fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;authenticate(copy,record,key);copied++;}
    catch(error){try{if(fd!==undefined){fs.closeSync(fd);fd=undefined;}}finally{if(created)fs.unlinkSync(copy);}throw error;}
    finally{checked.bytes.fill(0);if(fd!==undefined)fs.closeSync(fd);}
   }
  }else{
   for(const record of plan.prunable){authenticate(path.join(target!,record.fileName),record,key);const file=path.join(configuration.backupRoot,record.fileName);authenticate(file,record,key);ordinary(file);fs.unlinkSync(file);pruned++;}
  }
  return {copied,pruned,retained:prune?plan.retained.length:records.length,receipts:records};
 }catch(error){if(error instanceof RecoveryRetentionError)throw error;if(error&&typeof error==='object'&&['ENOSPC','EDQUOT','SQLITE_FULL'].includes(String((error as NodeJS.ErrnoException).code)))refuse('RECOVERY_STORAGE_FULL');refuse('RECOVERY_MAINTENANCE_FAILED');}
 finally{key?.fill(0);}
}
