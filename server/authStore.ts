import type { SessionRecord,SessionStore } from './auth.js';
import type { AppWriteTx } from './appStore.js';
export class NativeSessionStore implements SessionStore {
  constructor(){throw new Error('F04 native session store not implemented');}
  get(_hash:string):SessionRecord|undefined {throw new Error('F04 native session store not implemented');}
  insert(_record:SessionRecord):void {throw new Error('F04 native session store not implemented');}
  version(_userId:string):number {throw new Error('F04 native session store not implemented');}
  revoke(_hash:string,_now:number):void {throw new Error('F04 native session store not implemented');}
}
export function revokeUserSessions(_tx:AppWriteTx,_userId:string):void {throw new Error('F04 native session store not implemented');}
