import {parse} from 'dotenv';
import {isDeepStrictEqual} from 'node:util';
export class RecoveryEnvError extends Error {}
export const envByteLimit=1024*1024;
export type EnvGroup='gemini'|'vapid';
export interface SavedRecoveryEnv {format:1;groups:EnvGroup[];values:Record<string,string|null>}
export type ValidatedEnvPatch=Record<string,string|null>&{readonly __validated:unique symbol};
const groups={gemini:['GEMINI_API_KEY','API_KEY'],vapid:['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT']} as const;
const limits:Record<string,number>={GEMINI_API_KEY:512,API_KEY:512,VAPID_PUBLIC_KEY:128,VAPID_PRIVATE_KEY:128,VAPID_SUBJECT:512};
export const providerEnvKeys=Object.values(groups).flat();
const trusted=new WeakSet<object>();
function refuse():never{throw new RecoveryEnvError('RECOVERY_ENV_INVALID');}
export function validateEnvSelection(value:unknown):EnvGroup[]{if(!Array.isArray(value)||value.length>2||value.some(group=>typeof group!=='string'||!Object.hasOwn(groups,group))||new Set(value).size!==value.length)refuse();return [...value].sort() as EnvGroup[];}
function keys(selected:EnvGroup[]):string[]{return selected.flatMap(group=>[...groups[group]]);}
function validValue(key:string,value:unknown):asserts value is string|null{if(value!==null&&(typeof value!=='string'||Buffer.byteLength(value)>limits[key]||/[\x00-\x1f\x7f]/.test(value)))refuse();if(value!==null)assignment(key,value as string);}
export function captureRecoveryEnv(text:string,selection:EnvGroup[]):SavedRecoveryEnv{if(typeof text!=='string'||Buffer.byteLength(text)>envByteLimit)refuse();const selected=validateEnvSelection(selection),local=parse(text),values:Record<string,string|null>={};for(const key of keys(selected)){const alias=Object.keys(local).find(name=>name.toUpperCase()===key);const value=alias===undefined?null:local[alias];validValue(key,value);values[key]=value;}return {format:1,groups:selected,values};}
export function selectRecoveryEnv(input:unknown,selection:EnvGroup[]):ValidatedEnvPatch{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='format,groups,values')refuse();const saved=input as SavedRecoveryEnv;
 if(saved.format!==1||!saved.values||typeof saved.values!=='object'||Array.isArray(saved.values))refuse();const available=validateEnvSelection(saved.groups),expected=keys(available).sort();if(Object.keys(saved.values).sort().join(',')!==expected.join(','))refuse();for(const key of expected)validValue(key,saved.values[key]);
 const selected=validateEnvSelection(selection);if(selected.some(group=>!available.includes(group)))refuse();const patch=Object.freeze(Object.fromEntries(keys(selected).map(key=>[key,saved.values[key]]))) as ValidatedEnvPatch;trusted.add(patch);return patch;
}
function assignment(key:string,value:string):string{
 for(const rendered of [value,"'"+value+"'",'"'+value+'"','`'+value+'`']){const line=key+'='+rendered;if(isDeepStrictEqual(parse(line),{[key]:value}))return line;}refuse();
}
/** Keep unselected logical entries byte-for-byte, including quoted multiline values.
 * A final dotenv roundtrip guards ambiguous syntax rather than changing its meaning. */
export function mergeRecoveryEnv(local:string,patch:ValidatedEnvPatch):string{
 if(!patch||!trusted.has(patch)||typeof local!=='string'||Buffer.byteLength(local)>envByteLimit)refuse();const selected=Object.keys(patch);if(!selected.length)return local;
 const expected={...parse(local)};for(const name of Object.keys(expected))if(selected.includes(name.toUpperCase()))delete expected[name];for(const key of selected)if(patch[key]!==null)expected[key]=patch[key];
 const bom=local.startsWith('\uFEFF')?'\uFEFF':'';const lines=local.slice(bom.length).match(/[^\n]*\n|[^\n]+$/g)??[],kept:string[]=[];
 for(let index=0;index<lines.length;index++){
  let block=lines[index];const match=/^[ \t]*(?:export[ \t]+)?([\w.-]+)[ \t]*(?:=[ \t]*|:[ \t]+)([\s\S]*)$/.exec(block);
  if(match){let body=match[2].trimStart();const quote=body[0];if(["'",'"','`'].includes(quote)){
   body=body.slice(1);const closed=()=>{for(let offset=0;offset<body.length;offset++)if(body[offset]===quote&&body[offset-1]!=='\\')return true;return false;};
   while(!closed()){if(++index>=lines.length)refuse();block+=lines[index];body+=lines[index];}
  }}
  if(!match||!selected.includes(match[1].toUpperCase()))kept.push(block);
 }
 const ending=local.includes('\r\n')?'\r\n':'\n';let result=bom+kept.join('');if(result&&!result.endsWith('\n'))result+=ending;
 for(const key of selected)if(patch[key]!==null)result+=assignment(key,patch[key])+ending;
 if(Buffer.byteLength(result)>envByteLimit||!isDeepStrictEqual(parse(result),expected))refuse();return result;
}
