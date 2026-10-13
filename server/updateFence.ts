import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {AppConfig} from './config.js';
import {assertNoLinkedAncestors} from '../scripts/lib/native-paths.mjs';
const nativeFailureCodes=['EBUSY','EACCES','EPERM','ENOENT','EMFILE','ENFILE','EIO'];
export class UpdateFenceError extends Error {readStage?:string;nativeCode?:string;}
export function formatUpdateStartupFailure(error:unknown):string{
 if(!(error instanceof UpdateFenceError))return '';
 const [message,readStage,nativeCode]=['message','readStage','nativeCode'].map(name=>Object.getOwnPropertyDescriptor(error,name)?.value);
 const code=['UPDATE_CONTROL_INVALID','UPDATE_BINDING_INVALID','UPDATE_SCHEMA_INCOMPATIBLE','UPDATE_STARTUP_CANCELLED','UPDATE_HEALTH_FAILED','UPDATE_STORAGE_FAILED','UPDATE_APPROVAL_TIMEOUT'].includes(message)?` [${message}]`:'';
 const stage=['ancestors','leaf-stat','descriptor-open','descriptor-read','descriptor-eof','descriptor-after','parents-after','leaf-after','metadata-after'].includes(readStage)?` [read-stage:${readStage}]`:'';
 const native=nativeFailureCodes.includes(nativeCode)?` [native-code:${nativeCode}]`:'';
 return code+stage+native;
}
function refuse(code='UPDATE_CONTROL_INVALID'):never{throw new UpdateFenceError(code);}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
interface Bounds {min:number;max:number}
export interface UpdateSchema {legacy:Bounds;jobs:Bounds;snapshot:Bounds;domains:Record<string,Bounds>}
export interface StoredUpdateSchemas {legacy:number;jobs:number;snapshot:number;domains:Record<string,number>}
interface Control {format:1;operationId:string;manifestSha256:string;phase:'held'|'approve'}
export interface UpdateAttempt {readonly controlFile:string;readonly manifestFile:string;readonly operationId:string;readonly manifestSha256:string;readonly appVersion:string;readonly schema:UpdateSchema}
function object(value:unknown):value is Record<string,any>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
// A stable parent may publish a new fixed control leaf atomically. A changed
// snapshot is never returned; callers can perform a bounded complete reread.
class ControlPublicationChanged extends UpdateFenceError {}
type AncestorIdentity={file:string;dev:bigint;ino:bigint};
function readPublic(file:string,limit:number,code:string,allowLeafPublication=false,pinnedAncestors?:AncestorIdentity[]):Buffer{
 let fd:number|undefined,bytes:Buffer|undefined,complete=false,readStage='ancestors';
 try{
  assertNoLinkedAncestors(file);const ancestors=pinnedAncestors??[];
  if(ancestors.length===0)for(let current=path.dirname(path.resolve(file));;current=path.dirname(current)){
   const ancestor=fs.lstatSync(current,{bigint:true});if(!ancestor.isDirectory()||ancestor.isSymbolicLink())refuse(code);
   ancestors.push({file:current,dev:ancestor.dev,ino:ancestor.ino});if(path.dirname(current)===current)break;
  }
  const parentsUnchanged=()=>{assertNoLinkedAncestors(file);for(const ancestor of ancestors){const current=fs.lstatSync(ancestor.file,{bigint:true});if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==ancestor.dev||current.ino!==ancestor.ino)refuse(code);}};
  const ordinary=(stat:fs.BigIntStats)=>{if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size>BigInt(limit)||stat.size<0n)refuse(code);};
  parentsUnchanged(); // A retry must retain the first read's parent identities.
  readStage='leaf-stat';const prior=fs.lstatSync(file,{bigint:true});ordinary(prior);
  readStage='descriptor-open';fd=fs.openSync(file,'r');const stat=fs.fstatSync(fd,{bigint:true});
  if(stat.dev!==prior.dev||stat.ino!==prior.ino||stat.nlink!==1n){
   parentsUnchanged();const fixed=fs.lstatSync(file,{bigint:true});ordinary(fixed);
   if(allowLeafPublication&&(fixed.dev!==prior.dev||fixed.ino!==prior.ino))throw new ControlPublicationChanged(code);
   refuse(code);
  }
  if(stat.size!==prior.size||stat.size>BigInt(limit))refuse(code);
  readStage='descriptor-read';bytes=Buffer.alloc(Number(stat.size));let offset=0;while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,null);if(!count)refuse(code);offset+=count;}
  readStage='descriptor-eof';const extra=Buffer.alloc(1);try{if(fs.readSync(fd,extra,0,1,null))refuse(code);}finally{extra.fill(0);}
  readStage='descriptor-after';const after=fs.fstatSync(fd,{bigint:true});readStage='parents-after';parentsUnchanged();readStage='leaf-after';const fixed=fs.lstatSync(file,{bigint:true});ordinary(fixed);
  if(fixed.dev!==stat.dev||fixed.ino!==stat.ino){if(allowLeafPublication)throw new ControlPublicationChanged(code);refuse(code);}
  readStage='metadata-after';if(after.dev!==stat.dev||after.ino!==stat.ino||after.nlink!==1n||after.size!==stat.size||after.mtimeNs!==stat.mtimeNs||after.ctimeNs!==stat.ctimeNs||fixed.size!==stat.size||fixed.mtimeNs!==stat.mtimeNs||fixed.ctimeNs!==stat.ctimeNs)refuse(code);
  complete=true;return bytes;
 }catch(error){if(error instanceof ControlPublicationChanged)throw error;const failure=new UpdateFenceError(code);failure.readStage=readStage;
  if(error!==null&&typeof error==='object'){const native=Object.getOwnPropertyDescriptor(error,'code')?.value;if(typeof native==='string'&&nativeFailureCodes.includes(native))failure.nativeCode=native;}
  throw failure;}
 finally{if(!complete)bytes?.fill(0);if(fd!==undefined){try{fs.closeSync(fd);}catch{bytes?.fill(0);refuse(code);}}}
}
function readControl(file:string):Control{
 const ancestors:AncestorIdentity[]=[];
 for(let attempt=0;attempt<3;attempt++){
  let bytes:Buffer|undefined;
  try{
   bytes=readPublic(file,8192,'UPDATE_CONTROL_INVALID',true,ancestors);const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!object(value)||Object.keys(value).sort().join(',')!=='format,manifestSha256,operationId,phase'||value.format!==1||!uuid(value.operationId)||typeof value.manifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.manifestSha256)||!['held','approve'].includes(value.phase))refuse();
   return value as unknown as Control;
  }catch(error){if(error instanceof ControlPublicationChanged&&attempt<2)continue;if(error instanceof UpdateFenceError)throw error;refuse();}
  finally{bytes?.fill(0);}
 }
 refuse();
}
function bounds(value:unknown):value is Bounds{return object(value)&&Object.keys(value).sort().join(',')==='max,min'&&Number.isSafeInteger(value.min)&&value.min>=1&&Number.isSafeInteger(value.max)&&value.max>=value.min;}
export function assertSchemaCompatibility(schema:unknown,versions:unknown):void{
 const code='UPDATE_SCHEMA_INCOMPATIBLE';if(!object(schema)||Object.keys(schema).sort().join(',')!=='domains,jobs,legacy,snapshot'||!object(versions)||Object.keys(versions).sort().join(',')!=='domains,jobs,legacy,snapshot')refuse(code);
 for(const key of ['legacy','jobs','snapshot'])if(!bounds(schema[key])||!Number.isSafeInteger(versions[key])||versions[key]<schema[key].min||versions[key]>schema[key].max)refuse(code);
 if(!object(schema.domains)||!object(versions.domains))refuse(code);
 for(const [name,bound]of Object.entries(schema.domains))if(!/^[a-z][a-z0-9_]{0,79}$/.test(name)||!bounds(bound))refuse(code);
 for(const [name,version]of Object.entries(versions.domains))if(!/^[a-z][a-z0-9_]{0,79}$/.test(name)||typeof version!=='number'||!Number.isSafeInteger(version)||version<0||(version>0&&(!bounds(schema.domains[name])||version<schema.domains[name].min||version>schema.domains[name].max)))refuse(code);
}
/** Presence blocks restore; only the exact record/command certifies completion. */
export function openedUpdateBindingVerified(metadata:unknown,commands:unknown,operationId:unknown,manifestSha256:unknown):boolean{
 if(!uuid(operationId)||typeof manifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(manifestSha256)||typeof metadata!=='string'||!Array.isArray(commands)||commands.length!==1)return false;
 const record={format:1,operationId,manifestSha256,writesMayOpen:true},command=commands[0];
 try{return isDeepStrictEqual(JSON.parse(metadata),record)&&object(command)&&command.command==='core:update:open-writes'&&command.request_id===operationId&&command.actor_id==='system:update-validation'&&command.payload_hash===createHash('sha256').update(JSON.stringify(record)).digest('hex')&&isDeepStrictEqual(JSON.parse(command.result),{value:{writesMayOpen:true}})&&typeof command.committed_at==='string'&&new Date(command.committed_at).toISOString()===command.committed_at;}catch{return false;}
}
/** Approval is an independent durable latch: DB restore cannot erase permission. */
export function assertSnapshotRollbackAllowed(operationId:unknown,persisted:unknown,approvalPhase:unknown):void{if(!uuid(operationId))refuse();if(persisted!==undefined||approvalPhase!=='held')refuse('UPDATE_WRITES_MAY_HAVE_OPENED');}
function manifest(file:string,hash:string):{appVersion:string;schema:UpdateSchema}{
 let bytes:Buffer|undefined;try{bytes=readPublic(file,8*1024*1024,'UPDATE_BINDING_INVALID');if(createHash('sha256').update(bytes).digest('hex')!==hash)refuse('UPDATE_BINDING_INVALID');const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!object(value)||value.format!==1||typeof value.commitSha!=='string'||!/^[a-f0-9]{40}$/.test(value.commitSha)||typeof value.appVersion!=='string'||value.appVersion.length>128||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(value.appVersion))refuse('UPDATE_BINDING_INVALID');assertSchemaCompatibility(value.schema,{legacy:1,jobs:1,snapshot:1,domains:{}});return {appVersion:value.appVersion,schema:value.schema};}catch{refuse('UPDATE_BINDING_INVALID');}finally{bytes?.fill(0);}
}
/** Native operator publishes and seals this fixed public control file; no HTTP API. */
export function loadUpdateAttempt(config:AppConfig):UpdateAttempt|undefined{
 const controlFile=path.join(config.configRoot,'update-control.json');try{assertNoLinkedAncestors(controlFile);if(!fs.lstatSync(controlFile,{throwIfNoEntry:false}))return undefined;}catch{refuse();}
 const control=readControl(controlFile);if(path.basename(config.codeRoot).toLowerCase()!=='app')refuse('UPDATE_BINDING_INVALID');const manifestFile=path.join(path.dirname(config.codeRoot),'release-manifest.json'),loaded=manifest(manifestFile,control.manifestSha256);
 return Object.freeze({controlFile,manifestFile,operationId:control.operationId,manifestSha256:control.manifestSha256,...loaded});
}
function checkControl(attempt:UpdateAttempt):Control{const control=readControl(attempt.controlFile);if(control.operationId!==attempt.operationId||control.manifestSha256!==attempt.manifestSha256)refuse('UPDATE_BINDING_INVALID');return control;}
function cancelled(signal:AbortSignal){if(signal.aborted)refuse('UPDATE_STARTUP_CANCELLED');}
async function health(server:http.Server,signal:AbortSignal,version:string):Promise<void>{
 const address=server.address();if(!address||typeof address==='string')refuse('UPDATE_HEALTH_FAILED');
 try{await new Promise<void>((resolve,reject)=>{const request=http.get({hostname:'127.0.0.1',port:address.port,path:'/api/health',agent:false,signal},response=>{let text='';response.on('data',chunk=>{text+=chunk;if(text.length>4096)request.destroy();});response.on('error',reject);response.on('end',()=>{try{const packet=JSON.parse(text);if(response.statusCode!==200||packet.ok!==true||packet.version!==version)throw new Error();resolve();}catch{reject(new Error());}});});request.setTimeout(2000,()=>request.destroy(new Error()));request.on('error',reject);});}catch{cancelled(signal);refuse('UPDATE_HEALTH_FAILED');}
}
export async function validateUpdateStartup(attempt:UpdateAttempt,server:http.Server,signal:AbortSignal,ports:{inspectStorage:()=>{integrity:string;users:number;schemas:StoredUpdateSchemas};markWritesPossible:(attempt:UpdateAttempt)=>void},options:{pollMs?:number;timeoutMs?:number}={}):Promise<void>{
 const pollMs=options.pollMs??100,timeoutMs=options.timeoutMs??30000;if(!Number.isSafeInteger(pollMs)||pollMs<1||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)refuse();const deadline=performance.now()+timeoutMs;
 while(true){cancelled(signal);if(performance.now()>=deadline)refuse('UPDATE_APPROVAL_TIMEOUT');const control=checkControl(attempt);if(performance.now()>=deadline)refuse('UPDATE_APPROVAL_TIMEOUT');if(control.phase==='approve')break;try{await delay(Math.min(pollMs,Math.max(1,deadline-performance.now())),undefined,{signal});}catch{cancelled(signal);refuse('UPDATE_STARTUP_CANCELLED');}}
 const loaded=manifest(attempt.manifestFile,attempt.manifestSha256);await health(server,signal,loaded.appVersion);cancelled(signal);
 const storage=ports.inspectStorage();if(storage.integrity!=='ok'||!Number.isSafeInteger(storage.users)||storage.users<1)refuse('UPDATE_STORAGE_FAILED');assertSchemaCompatibility(loaded.schema,storage.schemas);
 if(checkControl(attempt).phase!=='approve')refuse('UPDATE_CONTROL_INVALID');manifest(attempt.manifestFile,attempt.manifestSha256);cancelled(signal);
 // No await between this durable transaction and returning to the lifecycle.
 // If the process stops at that boundary, rollback conservatively treats writes
 // as possibly accepted even when no business write actually happened.
 ports.markWritesPossible(attempt);
}
