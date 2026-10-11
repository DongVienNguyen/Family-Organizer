import {AppStoreError} from './appErrors.js';
/** Existing Admin-only settings payload; actor identity never comes from the body. */
export function telegramSettingsPatch(body:unknown,actorId:string,current:Record<string,string>):Record<string,string|null>{
 if(!body||typeof body!=='object'||Array.isArray(body))throw new AppStoreError('Cấu hình Telegram không hợp lệ.',400);
 const input=body as Record<string,unknown>,keys=Object.keys(input);
 if(!keys.length||keys.some(key=>!['botToken','chatId','enabled','weeklyDigestEnabled'].includes(key)))throw new AppStoreError('Cấu hình Telegram không hợp lệ.',400);
 const patch:Record<string,string|null>={};
 for(const [field,key,limit] of [['botToken','telegramBotToken',512],['chatId','telegramChatId',128]] as const){
  if(!Object.hasOwn(input,field))continue;
  const value=input[field];if(typeof value!=='string'||value.length>limit||/[\x00-\x1f\x7f]/.test(value))throw new AppStoreError('Cấu hình Telegram không hợp lệ.',400);
  patch[key]=value.trim()||null;
 }
 for(const [field,key] of [['enabled','telegramBackupEnabled'],['weeklyDigestEnabled','telegramWeeklyDigestEnabled']] as const){
  if(!Object.hasOwn(input,field))continue;
  if(typeof input[field]!=='boolean')throw new AppStoreError('Cấu hình Telegram không hợp lệ.',400);
  patch[key]=input[field]?'1':null;
 }
 if(keys.some(key=>['botToken','chatId','weeklyDigestEnabled'].includes(key))){
  const token=Object.hasOwn(patch,'telegramBotToken')?patch.telegramBotToken:current.telegramBotToken;
  const chat=Object.hasOwn(patch,'telegramChatId')?patch.telegramChatId:current.telegramChatId;
  patch.telegramWeeklyDigestOwnerId=token&&chat?actorId:null;
 }
 return patch;
}
