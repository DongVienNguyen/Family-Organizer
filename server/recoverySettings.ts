import {Buffer} from 'node:buffer';
export class RecoverySettingsError extends Error {}
export type SettingGroup='gemini'|'telegram';
export interface SavedRecoverySettings {format:1;groups:SettingGroup[];values:Record<string,string|null>}
export type ValidatedSettingPatch=Record<string,string|null>&{readonly __validated:unique symbol};
const groups={gemini:['geminiApiKey'],telegram:['telegramBotToken','telegramChatId','telegramWeeklyDigestOwnerId']} as const;
const limits:Record<string,number>={geminiApiKey:512,telegramBotToken:512,telegramChatId:128,telegramWeeklyDigestOwnerId:256};
const trusted=new WeakSet<object>();
function refuse():never{throw new RecoverySettingsError('RECOVERY_SETTINGS_INVALID');}
export function validateSettingSelection(value:unknown):SettingGroup[]{
 if(!Array.isArray(value)||value.length>2||value.some(group=>typeof group!=='string'||!Object.hasOwn(groups,group))||new Set(value).size!==value.length)refuse();
 return [...value].sort() as SettingGroup[];
}
function keys(selection:SettingGroup[]):string[]{return selection.flatMap(group=>[...groups[group]]);}
function validateValue(key:string,value:unknown):asserts value is string|null{
 if(value!==null&&(typeof value!=='string'||Buffer.byteLength(value)>limits[key]||/[\x00-\x1f\x7f]/.test(value)))refuse();
}
export function captureRecoverySettings(local:Record<string,string>,selection:SettingGroup[]):SavedRecoverySettings{
 const selected=validateSettingSelection(selection),values:Record<string,string|null>={};
 for(const key of keys(selected)){const value=Object.hasOwn(local,key)?local[key]:null;validateValue(key,value);values[key]=value;}
 return {format:1,groups:selected,values};
}
export function selectRecoverySettings(input:unknown,selection:SettingGroup[]):ValidatedSettingPatch{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='format,groups,values')refuse();
 const saved=input as SavedRecoverySettings;
 if(saved.format!==1||!saved.values||typeof saved.values!=='object'||Array.isArray(saved.values))refuse();
 const available=validateSettingSelection(saved.groups),expected=keys(available).sort();
 if(Object.keys(saved.values).sort().join(',')!==expected.join(','))refuse();
 for(const key of expected)validateValue(key,saved.values[key]);
 const selected=validateSettingSelection(selection);if(selected.some(group=>!available.includes(group)))refuse();
 const result=Object.freeze(Object.fromEntries(keys(selected).map(key=>[key,saved.values[key]]))) as ValidatedSettingPatch;trusted.add(result);return result;
}
export function applyRecoverySettings(local:Record<string,string>,patch:ValidatedSettingPatch):Record<string,string>{
 if(!patch||!trusted.has(patch))refuse();
 const result={...local};for(const [key,value] of Object.entries(patch as Record<string,string|null>)){if(value===null)delete result[key];else result[key]=value;}return result;
}
