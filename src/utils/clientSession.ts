import {abortDeadline} from './abortSignals.js';
/** Local clearing is immediate; offline logout cannot claim server revocation. */
export async function endClientSession(token:string|null,clear:()=>void,request:typeof fetch=fetch):Promise<void>{
  clear();if(!token)return;
  const deadline=abortDeadline(5000);
  try{await request('/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token},signal:deadline.signal});}catch{/* Local state is already cleared; server-side expiry still bounds the old token. */}
  finally{deadline.dispose();}
}
