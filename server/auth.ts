import type { User } from '../src/types.js';
import { createHash,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import { AppStoreError } from './appErrors.js';
import { UserRole } from '../src/types.js';
export type AuthUser=User&{passwordHash:string};
const roles=new Set<string>(Object.values(UserRole));
export function isActiveAuthUser(value:unknown):value is AuthUser {
  if(!value||typeof value!=='object')return false;
  const user=value as Partial<AuthUser>;
  return typeof user.id==='string'&&!!user.id&&!user.isDeleted&&typeof user.role==='string'&&roles.has(user.role)&&typeof user.passwordHash==='string'&&user.passwordHash.length>0&&user.passwordHash.length<=4096;
}
export interface SessionRecord { tokenHash:string;userId:string;userVersion:string;keyVersion:string;createdAt:number;expiresAt:number;revokedAt:number|null }
export interface SessionStore { get(hash:string):SessionRecord|undefined;insert(record:SessionRecord):void;version(userId:string):number;keyVersion(fingerprint:string):string;revoke(hash:string,now:number):void }
export interface AuthDependencies { store:SessionStore;getUsers:()=>AuthUser[];getSecret:()=>string;now?:()=>number }
export const SESSION_TTL_MS=12*60*60*1000;
export interface AuthService { initialize():void;issue(user:AuthUser):string;verify(token:string):AuthUser|null;logout(token:string):void }
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function createAuth(deps:AuthDependencies):AuthService {
  const now=()=>{const time=(deps.now??Date.now)();if(!Number.isSafeInteger(time)||time<0)throw new Error('Invalid session clock');return time;};
  const userVersion=(user:AuthUser)=>hash(JSON.stringify([user.id,user.passwordHash,user.role,!!user.isDeleted,deps.store.version(user.id)]));
  const key=()=>{const secret=deps.getSecret();if(!secret||secret.length>4096)throw new Error('Invalid session signing key');return {secret,version:deps.store.keyVersion(hash(secret))};};
  const parse=(token:string)=>{if(typeof token!=='string'||!/^fo1\.[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/.test(token))return;const [,identifier,signature]=token.split('.');if(Buffer.from(identifier,'base64url').toString('base64url')!==identifier)return;return {identifier,signature,tokenHash:hash(identifier)};};
  const service:AuthService={
    initialize(){key();},
    issue(user){
      const current=deps.getUsers().find(item=>item?.id===user?.id);
      if(!isActiveAuthUser(user)||!isActiveAuthUser(current)||userVersion(current)!==userVersion(user))throw new AppStoreError('Phiên đăng nhập không hợp lệ.',401);
      const signing=key(),createdAt=now(),identifier=randomBytes(32).toString('base64url');
      const token=`fo1.${identifier}.${createHmac('sha256',signing.secret).update('fo1.'+identifier).digest('hex')}`;
      deps.store.insert({tokenHash:hash(identifier),userId:current.id,userVersion:userVersion(current),keyVersion:signing.version,createdAt,expiresAt:createdAt+SESSION_TTL_MS,revokedAt:null});
      return token;
    },
    verify(token){
      const parsed=parse(token);if(!parsed)return null;
      const signing=key(),expected=createHmac('sha256',signing.secret).update('fo1.'+parsed.identifier).digest('hex');
      if(!timingSafeEqual(Buffer.from(parsed.signature,'hex'),Buffer.from(expected,'hex')))return null;
      const row=deps.store.get(parsed.tokenHash),time=now();
      if(!row||row.revokedAt!==null||row.keyVersion!==signing.version||!Number.isSafeInteger(row.createdAt)||!Number.isSafeInteger(row.expiresAt)||time<row.createdAt||time>=row.expiresAt||row.expiresAt-row.createdAt!==SESSION_TTL_MS)return null;
      const user=deps.getUsers().find(item=>item?.id===row.userId);
      return isActiveAuthUser(user)&&row.userVersion===userVersion(user)?user:null;
    },
    logout(token){if(service.verify(token)){const parsed=parse(token)!;deps.store.revoke(parsed.tokenHash,now());}},
  };return service;
}
