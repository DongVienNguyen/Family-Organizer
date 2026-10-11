import { createSessionBoundary } from './sessionBoundary.js';
import { purgePrivateStorage } from './privateStorage.js';
import { ensurePrivacyWorker } from './privacyWorker.js';
/** One boundary for every internal browser request and React session tree. */
export const browserSession=createSessionBoundary({
  origin:typeof window==='undefined'?'http://localhost':window.location.origin,
  request:(input,init)=>globalThis.fetch(input,init),
  readToken:()=>localStorage.getItem('family_token'),
  writeToken:token=>{
    localStorage.removeItem('family_token');localStorage.removeItem('family_user_id');localStorage.removeItem('family_active_tab');
    if(token)localStorage.setItem('family_token',token);
  },
  purge:()=>purgePrivateStorage({
    caches:typeof caches==='undefined'?undefined:caches,
    indexedDB:typeof indexedDB==='undefined'?undefined:indexedDB,
    ensureWorker:()=>ensurePrivacyWorker({container:navigator.serviceWorker}),
  }),
});
export const sessionFetch:typeof fetch=(input,init)=>browserSession.request(input,init);
