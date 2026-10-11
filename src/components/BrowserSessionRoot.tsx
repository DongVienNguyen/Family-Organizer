import React,{useSyncExternalStore} from 'react';
import {useTranslation} from 'react-i18next';
import { browserSession } from '../utils/browserSession.js';
import App from '../App.js';
/** Changing the key discards every private App/component state together. */
export function BrowserSessionRoot(){
  const {t}=useTranslation();
  const state=useSyncExternalStore(browserSession.subscribe,browserSession.snapshot);
  if(state.status==='ready')return <App key={state.revision}/>;
  return <main className="min-h-screen bg-slate-950 text-slate-300 flex flex-col items-center justify-center gap-4 p-6" aria-live="polite">
    {state.status==='clearing'?<><div className="w-12 h-12 border-4 border-slate-800 border-t-sky-500 rounded-full animate-spin motion-reduce:animate-none"/><p className="text-xs text-slate-400">{t('auth.sessionPreparing')}</p></>:<>
      <p className="text-sm text-rose-400">{t('auth.sessionCleanupFailed')}</p>
      <button className="neu-btn bg-slate-900 rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer focus:ring-2 focus:ring-sky-500/40" onClick={()=>{void browserSession.retry().catch(()=>{});}}>{t('auth.sessionRetry')}</button>
    </>}
  </main>;
}
