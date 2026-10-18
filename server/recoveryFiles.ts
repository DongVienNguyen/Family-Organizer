import {TextDecoder} from 'node:util';
export class RecoveryFilesError extends Error {}
export const signingKeyByteLimit=4096;
export type FileGroup='sessionSigningKey';
export interface SavedRecoveryFiles {format:1;groups:FileGroup[];values:Record<string,string|null>}
export type ValidatedFilePatch=Record<string,string|null>&{readonly __validated:unique symbol};
const trusted=new WeakSet<object>();
function refuse():never{throw new RecoveryFilesError('RECOVERY_FILES_INVALID');}
export function validateFileSelection(value:unknown):FileGroup[]{
 if(!Array.isArray(value)||value.length>1||value.some(group=>group!=='sessionSigningKey'))refuse();return [...value] as FileGroup[];
}
function encoded(value:unknown):asserts value is string|null{
 if(value===null)return;
 if(typeof value!=='string'||value.length>Math.ceil(signingKeyByteLimit/3)*4)refuse();
 const bytes=Buffer.from(value,'base64');try{if(!bytes.length||bytes.length>signingKeyByteLimit||bytes.toString('base64')!==value||!new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim())refuse();}catch{refuse();}finally{bytes.fill(0);}
}
export function captureRecoveryFiles(local:Record<string,Buffer|undefined>,selection:FileGroup[]):SavedRecoveryFiles{
 const groups=validateFileSelection(selection),values:Record<string,string|null>={};
 for(const group of groups){const value=local[group];if(value!==undefined&&!Buffer.isBuffer(value))refuse();const saved=value===undefined?null:value.toString('base64');encoded(saved);values[group]=saved;}return {format:1,groups,values};
}
export function selectRecoveryFiles(input:unknown,selection:FileGroup[]):ValidatedFilePatch{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='format,groups,values')refuse();
 const saved=input as SavedRecoveryFiles;if(saved.format!==1||!saved.values||typeof saved.values!=='object'||Array.isArray(saved.values))refuse();
 const groups=validateFileSelection(saved.groups);if(Object.keys(saved.values).sort().join(',')!==groups.join(','))refuse();for(const group of groups)encoded(saved.values[group]);
 const selected=validateFileSelection(selection);if(selected.some(group=>!groups.includes(group)))refuse();
 const result=Object.freeze(Object.fromEntries(selected.map(group=>[group,saved.values[group]]))) as ValidatedFilePatch;trusted.add(result);return result;
}
export function recoveryFileBytes(patch:ValidatedFilePatch):Record<string,Buffer|null>{
 if(!patch||!trusted.has(patch))refuse();const result:Record<string,Buffer|null>={};if(Object.hasOwn(patch,'sessionSigningKey'))result['session_secret.key']=patch.sessionSigningKey===null?null:Buffer.from(patch.sessionSigningKey,'base64');return result;
}
