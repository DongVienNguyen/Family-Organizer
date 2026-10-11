import type { User } from '../src/types.js';
export type AuthUser=User&{passwordHash:string};
export interface SessionRecord { tokenHash:string;userId:string;userVersion:string;keyVersion:string;createdAt:number;expiresAt:number;revokedAt:number|null }
export interface SessionStore { get(hash:string):SessionRecord|undefined;insert(record:SessionRecord):void;version(userId:string):number;revoke(hash:string,now:number):void }
export interface AuthDependencies { store:SessionStore;getUsers:()=>AuthUser[];getSecret:()=>string;now?:()=>number }
export const SESSION_TTL_MS=12*60*60*1000;
export interface AuthService { issue(user:AuthUser):string;verify(token:string):AuthUser|null;logout(token:string):void }
export function createAuth(_deps:AuthDependencies):AuthService {throw new Error('F04 session owner not implemented');}
