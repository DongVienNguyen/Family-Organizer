/** @license SPDX-License-Identifier: Apache-2.0 */
import {createHash,randomUUID} from 'node:crypto';
import {hashPassword,MAX_PASSWORD_BYTES} from './passwords.js';
import {withAppWriteTransaction} from './appStore.js';
import {revokeUserSessions} from './authStore.js';
import {isActiveAuthUser} from './auth.js';

export class CredentialResetError extends Error {}
function refuse():never{throw new CredentialResetError('CREDENTIAL_REENTRY_INVALID');}
/** Local operator only, with the application stopped. Never replaces IDs or roles. */
export function reenterCredentials(input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))refuse();
  const value=input as Record<string,unknown>;
  if(Object.keys(value).length!==1||!Array.isArray(value.users)||!value.users.length||value.users.length>32)refuse();
  const seen=new Set<string>();
  const users=value.users.map((entry:unknown)=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry))refuse();
    const row=entry as Record<string,unknown>;
    if(Object.keys(row).length!==2||typeof row.id!=='string'||!row.id||row.id.length>256||seen.has(row.id)||typeof row.password!=='string'||row.password.trim().length<16||Buffer.byteLength(row.password,'utf8')>MAX_PASSWORD_BYTES)refuse();
    seen.add(row.id);
    return {id:row.id,passwordHash:hashPassword(row.password)};
  });
  // Salted hashes avoid putting an offline plaintext-password verifier in the command cache.
  return withAppWriteTransaction({actorId:'operator:credential-reentry',command:'operator:credential-reentry',requestId:randomUUID(),payloadHash:createHash('sha256').update(JSON.stringify(users)).digest('hex')},tx=>{
    const selected=users.map(row=>{
      const matches=tx.legacy.users.filter(user=>user.id===row.id);
      if(matches.length!==1||!isActiveAuthUser({...matches[0],passwordHash:row.passwordHash})||matches[0].passwordHash)refuse();
      return {user:matches[0],hash:row.passwordHash};
    });
    for(const {user,hash} of selected){user.passwordHash=hash;revokeUserSessions(tx,user.id);}
    return {resetUserIds:users.map(row=>row.id),sessionsRevoked:true};
  });
}
