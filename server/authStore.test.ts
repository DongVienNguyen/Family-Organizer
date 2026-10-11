import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { NativeSessionStore } from './authStore.js';
import { createAuth } from './auth.js';
import { FamilyDB,getSessionSecret } from './db.js';
import { withAppWriteTransaction } from './appStore.js';
import { collectAppSnapshot,validateAppSnapshot,restoreAppSnapshot } from './appSnapshot.js';
import { sqliteConnection } from './sqlite.js';
import { UserRole } from '../src/types.js';
import fs from 'node:fs';
import path from 'node:path';
const meta=()=>({actorId:'synthetic-auth',command:'synthetic:auth-fixture',requestId:randomUUID(),payloadHash:'synthetic'});
const service=(store=new NativeSessionStore())=>createAuth({store,getUsers:()=>FamilyDB.getUsers(),getSecret:getSessionSecret});
it('persists logout on the existing native connection across new service instances',()=>{
  const auth=service(),user=FamilyDB.getUsers()[0],token=auth.issue(user);expect(service().verify(token)?.id).toBe(user.id);auth.logout(token);expect(service().verify(token)).toBeNull();
});
it.each(['reset-password','role','delete'])('commits %s invalidation and version changes with the legacy user writer',action=>{
  const store=new NativeSessionStore(),auth=service(store),admin=FamilyDB.getUsers()[0];
  const id=randomUUID();withAppWriteTransaction(meta(),tx=>{tx.legacy.users.push({...tx.legacy.users[0],id,username:'synthetic-'+id,role:UserRole.MEMBER});});
  const user=FamilyDB.getUsers().find(u=>u.id===id)!,token=auth.issue(user),version=store.version(id);
  if(action==='reset-password')FamilyDB.adminResetPassword(id,'synthetic-new-password',admin.id,'Synthetic');
  if(action==='role')FamilyDB.adminUpdateUser(id,{role:UserRole.CHILD},admin.id,'Synthetic');
  if(action==='delete')FamilyDB.deleteUser(id,admin.id,'Synthetic');
  expect(store.version(id)).toBe(version+1);expect(auth.verify(token)).toBeNull();
  // Reverting visible user state cannot resurrect the previously invalidated session.
  withAppWriteTransaction(meta(),tx=>{const index=tx.legacy.users.findIndex(u=>u.id===id);tx.legacy.users[index]=user;});expect(service().verify(token)).toBeNull();
});
it('rolls back password and native revocation together when the owning command fails',()=>{
  const store=new NativeSessionStore(),auth=service(store),user=FamilyDB.getUsers()[0],token=auth.issue(user),version=store.version(user.id);
  expect(()=>withAppWriteTransaction(meta(),()=>{FamilyDB.changePassword(user.id,'admin123','synthetic-new-password');throw new Error('Synthetic outer rollback');})).toThrow('Synthetic outer rollback');
  expect(store.version(user.id)).toBe(version);expect(service().verify(token)?.id).toBe(user.id);
});
it('excludes local session rows from ordinary snapshots and revokes current sessions on committed restore',async()=>{
  const auth=service(),user=FamilyDB.getUsers()[0],token=auth.issue(user);const snapshot=withAppWriteTransaction(meta(),collectAppSnapshot);
  expect(Object.keys(snapshot.tables).some(name=>name.startsWith('auth_'))).toBe(false);expect(JSON.stringify(snapshot)).not.toContain(token);
  await restoreAppSnapshot(validateAppSnapshot(snapshot),{maintenance:async work=>work()});expect(service().verify(token)).toBeNull();
});
it.each(['version','columns'])('validates native session %s even when bootstrap result is cached',mode=>{
  new NativeSessionStore();const sql=sqliteConnection();
  if(mode==='version')sql.prepare('UPDATE auth_store_meta SET value=? WHERE key=?').run('900','version');else sql.exec('ALTER TABLE auth_sessions ADD COLUMN unsupported TEXT');
  try{expect(()=>new NativeSessionStore()).toThrow(/Unsupported.*session/i);}finally{if(mode==='version')sql.prepare('UPDATE auth_store_meta SET value=? WHERE key=?').run('1','version');else sql.exec('ALTER TABLE auth_sessions DROP COLUMN unsupported');}
});
it('persists signing key generations so reverting a prior key cannot resurrect sessions',()=>{
  let key='synthetic-first-key';const make=()=>createAuth({store:new NativeSessionStore(),getUsers:()=>FamilyDB.getUsers(),getSecret:()=>key});
  const user=FamilyDB.getUsers()[0],token=make().issue(user);key='synthetic-second-key';expect(make().verify(token)).toBeNull();key='synthetic-first-key';expect(make().verify(token)).toBeNull();expect(make().verify(make().issue(user))?.id).toBe(user.id);
});
it.each(['empty','directory','oversize'])('fails closed on an existing %s installation key rather than replacing it silently',mode=>{
  const file=path.join(process.env.DATA_DIR!,'session_secret.key'),before=fs.existsSync(file)?fs.readFileSync(file):undefined;
  fs.rmSync(file,{force:true});if(mode==='directory')fs.mkdirSync(file);else fs.writeFileSync(file,mode==='empty'?'':'x'.repeat(5000));
  try{expect(()=>getSessionSecret()).toThrow(/session.*key|signing.*key/i);}finally{fs.rmSync(file,{recursive:true,force:true});if(before)fs.writeFileSync(file,before);}
});
