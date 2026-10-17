import { useEffect, useState,useRef } from 'react';
import { browserSession } from '../../utils/browserSession.js';
import { createWalletApi } from './api.js';
import { createAccountWorkspace } from './accountWorkspace.js';
import { effectiveDateAt } from './dates.js';
import {createRecordWorkspace} from './recordWorkspace.js';
import type {AccountWorkspace} from './accountWorkspace.js';
import type {RecordWorkspace} from './recordWorkspace.js';
export interface WalletWorkspace {accounts:AccountWorkspace;records:RecordWorkspace;refresh:()=>Promise<void>;dispose:()=>void}
/** App is keyed by BrowserSessionRoot's revision. StrictMode may replay effects,
 * so the resource is retired by the actual session boundary, not effect cleanup. */
export function useWallet(authHeaders: () => HeadersInit,actorId?:string) {
    const currentActor=useRef(actorId??'');currentActor.current=actorId??'';
    const [owner] = useState(() => {const api=createWalletApi({request:browserSession.request,authHeaders}),date=()=>effectiveDateAt(new Date().toISOString(),'Asia/Ho_Chi_Minh'),accounts=createAccountWorkspace(api,{date}),records=createRecordWorkspace(api,{actorId:()=>currentActor.current,date,timezone:'Asia/Ho_Chi_Minh'});const workspace:WalletWorkspace={accounts,records,async refresh(){await Promise.all([accounts.refresh(),records.refresh()]);},dispose(){accounts.dispose();records.dispose();}};return {session:browserSession.snapshot(),workspace};});
    useEffect(() => {
        const changed = () => { const current = browserSession.snapshot(); if (current.status !== 'ready' || current.revision !== owner.session.revision || current.token !== owner.session.token)
            owner.workspace.dispose(); };
        const unsubscribe = browserSession.subscribe(changed);
        changed();
        const focus = () => { if (owner.workspace.accounts.snapshot().phase !== 'checking' && owner.workspace.accounts.snapshot().phase !== 'disposed')
            void owner.workspace.refresh(); };
        window.addEventListener('focus', focus);
        return () => { unsubscribe(); window.removeEventListener('focus', focus); };
    }, [owner]);
    return owner.workspace;
}
