/** Local clearing is immediate; offline logout cannot claim server revocation. */
export async function endClientSession(token:string|null,clear:()=>void,request:typeof fetch=fetch):Promise<void>{
  clear();if(!token)return;
  try{await request('/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});}catch{/* Local state is already cleared; server-side expiry still bounds the old token. */}
}
