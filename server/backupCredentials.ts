/** @license SPDX-License-Identifier: Apache-2.0 */
// Ordinary backups preserve business data; structured authentication material is
// deliberately re-entered locally. Free-text business content is not rewritten.
const sensitive=new Set(['password','passwordhash','passwordplain','apikey','token','accesstoken','refreshtoken','sessiontoken','secret','clientsecret','privatekey','authorization','auth','p256dh','vapidprivatekey','telegrambottoken']);
const normalized=(key:string)=>key.toLowerCase().replace(/[^a-z0-9]/g,'');
function credentialField(key:string){const name=normalized(key);return sensitive.has(name)||name.endsWith('apikey')||name.endsWith('privatekey')||name.endsWith('bottoken');}
function ordinaryUrl(value:string){
  if(!/^https?:\/\//i.test(value))return value;
  let url:URL;try{url=new URL(value);}catch{return value;}
  let changed=!!(url.username||url.password);url.username='';url.password='';
  for(const key of [...url.searchParams.keys()])if(credentialField(key)){url.searchParams.delete(key);changed=true;}
  return changed?url.toString():value;
}
export function ordinaryBackupValue(value:any):any {
  if(typeof value==='string')return ordinaryUrl(value);
  if(Array.isArray(value))return value.map(ordinaryBackupValue);
  if(!value||typeof value!=='object')return value;
  const push=typeof value.endpoint==='string'&&(value.keys?.p256dh!==undefined||value.subscription?.keys?.p256dh!==undefined);
  return Object.fromEntries(Object.entries(value).filter(([key])=>!credentialField(key)&&!(push&&['endpoint','keys','subscription'].includes(key))).map(([key,item])=>[key,ordinaryBackupValue(item)]));
}
export function ordinaryBackupSettings(settings:Record<string,string>):Record<string,string>{
  const result={...settings};
  if(Object.hasOwn(result,'homelabLinks')){
    try{const value=JSON.parse(result.homelabLinks);if(!value||typeof value!=='object')throw new Error('Structured links required');result.homelabLinks=JSON.stringify(ordinaryBackupValue(value));}
    catch{delete result.homelabLinks;}
  }
  return result;
}
