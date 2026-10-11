import type { SessionRecord,SessionStore } from './auth.js';
import { currentAppWriteTx,withAppWriteTransaction,type AppWriteTx } from './appStore.js';
import { sqliteConnection } from './sqlite.js';
import { createHash,randomUUID } from 'node:crypto';
const connection=sqliteConnection();
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function write(command:string,payload:string,fn:(tx:AppWriteTx)=>void):void {
  const tx=currentAppWriteTx();if(tx){fn(tx);return;}
  withAppWriteTransaction({actorId:'system:auth',command:'core:auth:'+command,requestId:randomUUID(),payloadHash:hash(payload)},fn);
}
export class NativeSessionStore implements SessionStore {
  constructor(){
    withAppWriteTransaction({actorId:'system:bootstrap',command:'core:auth:init',requestId:'auth-store-v1',payloadHash:hash('auth-store-v1')},tx=>{
      tx.exec('CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,user_version TEXT NOT NULL,key_version TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER)');
      tx.exec('CREATE TABLE IF NOT EXISTS auth_user_versions (user_id TEXT PRIMARY KEY,version INTEGER NOT NULL)');
      tx.exec('CREATE TABLE IF NOT EXISTS auth_store_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
      tx.run('INSERT OR IGNORE INTO auth_store_meta VALUES (?,?)','version','1');
      tx.exec('CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id,created_at)');
    });
    const columns={auth_sessions:['token_hash','user_id','user_version','key_version','created_at','expires_at','revoked_at'],auth_user_versions:['user_id','version'],auth_store_meta:['key','value']};
    for(const [table,expected] of Object.entries(columns))if(JSON.stringify(connection.prepare(`PRAGMA table_info(${table})`).all().map((row:any)=>row.name))!==JSON.stringify(expected))throw new Error('Unsupported native session schema');
    if((connection.prepare('SELECT value FROM auth_store_meta WHERE key=?').get('version') as any)?.value!=='1')throw new Error('Unsupported native session version');
  }
  get(tokenHash:string):SessionRecord|undefined {
    const row=connection.prepare('SELECT * FROM auth_sessions WHERE token_hash=?').get(tokenHash) as any;
    if(row)return {tokenHash:row.token_hash,userId:row.user_id,userVersion:row.user_version,keyVersion:row.key_version,createdAt:row.created_at,expiresAt:row.expires_at,revokedAt:row.revoked_at};
  }
  insert(record:SessionRecord):void {
    write('issue',record.tokenHash,tx=>{
      tx.run('DELETE FROM auth_sessions WHERE expires_at<=? OR revoked_at IS NOT NULL',record.createdAt);
      tx.run('INSERT INTO auth_sessions VALUES (?,?,?,?,?,?,?)',record.tokenHash,record.userId,record.userVersion,record.keyVersion,record.createdAt,record.expiresAt,record.revokedAt);
      tx.run('DELETE FROM auth_sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM auth_sessions WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 32)',record.userId,record.userId);
    });
  }
  version(userId:string):number {
    const version=(connection.prepare('SELECT version FROM auth_user_versions WHERE user_id=?').get(userId) as any)?.version??0;
    if(!Number.isSafeInteger(version)||version<0)throw new Error('Unsupported native session user version');return version;
  }
  keyVersion(fingerprint:string):string {
    const read=(key:string)=>(connection.prepare('SELECT value FROM auth_store_meta WHERE key=?').get(key) as any)?.value;
    if(read('key-fingerprint')!==fingerprint)write('key-rotation',fingerprint,tx=>{
      const generation=Number(read('key-generation')??'0');if(!Number.isSafeInteger(generation)||generation<0)throw new Error('Unsupported native session key generation');
      tx.run('INSERT OR REPLACE INTO auth_store_meta VALUES (?,?)','key-fingerprint',fingerprint);
      tx.run('INSERT OR REPLACE INTO auth_store_meta VALUES (?,?)','key-generation',String(generation+1));
      tx.run('DELETE FROM auth_sessions');
    });
    const generation=Number(read('key-generation'));if(!Number.isSafeInteger(generation)||generation<1)throw new Error('Unsupported native session key generation');
    return hash(fingerprint+':'+generation);
  }
  revoke(tokenHash:string,now:number):void {write('logout',tokenHash,tx=>{tx.run('UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?',now,tokenHash);});}
}
export function revokeUserSessions(tx:AppWriteTx,userId:string):void {
  // Legacy-only fixtures/installations may not have initialized sessions yet.
  if(!tx.get("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_sessions'"))return;
  tx.run('INSERT INTO auth_user_versions VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1',userId);
  tx.run('UPDATE auth_sessions SET revoked_at=? WHERE user_id=?',Date.now(),userId);
}
