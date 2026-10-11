import { createHmac } from 'node:crypto';
import { beforeEach,expect,it } from 'vitest';
import { createAuth,SESSION_TTL_MS,type SessionRecord,type SessionStore,type AuthUser } from './auth.js';
import { UserRole } from '../src/types.js';
let now:number,key:string,user:AuthUser,records:Map<string,SessionRecord>,store:SessionStore;
beforeEach(()=>{now=1_800_000_000_000;key='synthetic-auth-signing-key';user={id:'synthetic-user',username:'synthetic',fullName:'Synthetic',role:UserRole.ADMIN,passwordHash:'synthetic-password-hash',avatarColor:'synthetic',createdAt:'2026-01-01'};records=new Map();let fingerprint='',generation=0;store={get:hash=>records.get(hash),insert:record=>{records.set(record.tokenHash,{...record});},version:()=>0,keyVersion:next=>{if(next!==fingerprint){fingerprint=next;generation++;}return String(generation);},revoke:(hash,time)=>{const r=records.get(hash);if(r)r.revokedAt=time;}};});
const auth=()=>createAuth({store,getUsers:()=>[user],getSecret:()=>key,now:()=>now});
it('issues opaque internal sessions with hashed persistence and bounded absolute expiry',()=>{
  const service=auth(),token=service.issue(user);expect(token).not.toContain(user.id);expect(token).not.toContain(user.passwordHash);expect(service.verify(token)?.id).toBe(user.id);
  const record=[...records.values()][0];expect(record.expiresAt-record.createdAt).toBe(SESSION_TTL_MS);expect(JSON.stringify(record)).not.toContain(token);expect(JSON.stringify(record)).not.toContain(user.passwordHash);
  now+=SESSION_TTL_MS-1;expect(service.verify(token)?.id).toBe(user.id);now++;expect(service.verify(token)).toBeNull();
});
it('requires one-time re-login for the old stateless Bearer format',()=>{const service=auth();const old=`${user.id}.${createHmac('sha256',key).update(user.id).digest('hex')}`;expect(service.verify(old)).toBeNull();});
it.each(['signature','identifier','encoding','oversize','missing'])('rejects malformed or tampered %s tokens without creating sessions',mode=>{
  const service=auth(),token=service.issue(user);const parts=token.split('.');
  const invalid=mode==='signature'?parts.slice(0,2).join('.')+'.'+'0'.repeat(64):mode==='identifier'?parts[0]+'.'+ 'x'.repeat(43)+'.'+parts[2]:mode==='encoding'?'fo1.invalid!.bad':mode==='oversize'?'x'.repeat(10000):'';
  expect(service.verify(invalid)).toBeNull();expect(records.size).toBe(1);
});
it('persists logout across a new auth service and leaves other sessions usable',()=>{const first=auth(),token=first.issue(user),other=first.issue(user);first.logout(token);expect(auth().verify(token)).toBeNull();expect(auth().verify(other)?.id).toBe(user.id);});
it.each(['password','role','deleted','version'])('invalidates stale sessions when user %s changes',mode=>{
  const service=auth(),token=service.issue(user);if(mode==='password')user.passwordHash='synthetic-new-hash';if(mode==='role')user.role='child' as any;if(mode==='deleted')user.isDeleted=true;if(mode==='version')store.version=()=>1;
  expect(service.verify(token)).toBeNull();
});
it('invalidates previous key sessions even when the installation key rotates back',()=>{const service=auth(),token=service.issue(user);key='synthetic-rotated-signing-key';expect(service.verify(token)).toBeNull();expect(service.verify(service.issue(user))?.id).toBe(user.id);key='synthetic-auth-signing-key';expect(auth().verify(token)).toBeNull();});
it('fails closed when the configured key cannot be read',()=>{const service=createAuth({store,getUsers:()=>[user],getSecret:()=>{throw new Error('Synthetic inaccessible key');},now:()=>now});expect(()=>service.issue(user)).toThrow('Synthetic inaccessible key');expect(()=>service.verify('fo1.'+'A'.repeat(43)+'.'+'0'.repeat(64))).toThrow('Synthetic inaccessible key');});

it.each(['synthetic-unknown',null,42])('refuses issuing a session for unknown current role %#',role=>{
  user.role=role as any;expect(()=>auth().issue(user)).toThrow();expect(records.size).toBe(0);
});
it.each([{},['synthetic'],'x'.repeat(4097)])('refuses issuing a session for a malformed current credential hash %#',value=>{
  user.passwordHash=value as any;expect(()=>auth().issue(user)).toThrow();expect(records.size).toBe(0);
});
