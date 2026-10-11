/** @license SPDX-License-Identifier: Apache-2.0 */
import { pbkdf2Sync,randomBytes,timingSafeEqual } from 'node:crypto';
import { AppStoreError } from './appErrors.js';
const LEGACY_SALT='family_organizer_salt_2026';
const ITERATIONS=120000;
export const MAX_PASSWORD_BYTES=4096;
const validPassword=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=MAX_PASSWORD_BYTES&&Buffer.byteLength(value,'utf8')<=MAX_PASSWORD_BYTES;
export function hashPassword(password:string,salt?:string):string {
  if(!validPassword(password)||salt!==undefined&&(typeof salt!=='string'||salt.length>MAX_PASSWORD_BYTES))throw new AppStoreError('Mật khẩu không hợp lệ.',400);
  const useSalt=salt||randomBytes(16).toString('hex');
  return useSalt+'$'+pbkdf2Sync(password,useSalt,ITERATIONS,64,'sha512').toString('hex');
}
export function verifyPassword(password:string,stored:string):boolean {
  if(!validPassword(password)||typeof stored!=='string'||!stored||stored.length>MAX_PASSWORD_BYTES)return false;
  if(stored.includes('$')){
    const separator=stored.indexOf('$'),salt=stored.slice(0,separator),digest=stored.slice(separator+1);
    if(!salt||!/^[a-f0-9]{128}$/i.test(digest))return false;
    const computed=pbkdf2Sync(password,salt,ITERATIONS,64,'sha512');
    return timingSafeEqual(computed,Buffer.from(digest,'hex'));
  }
  if(!/^[a-f0-9]{128}$/i.test(stored))return false;
  return timingSafeEqual(pbkdf2Sync(password,LEGACY_SALT,1000,64,'sha512'),Buffer.from(stored,'hex'));
}
