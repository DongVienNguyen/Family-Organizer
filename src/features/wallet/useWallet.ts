import { useEffect, useState } from 'react';
import { browserSession } from '../../utils/browserSession.js';
import { createWalletApi } from './api.js';
import { createAccountWorkspace } from './accountWorkspace.js';
import { effectiveDateAt } from './dates.js';
/** App is keyed by BrowserSessionRoot's revision. StrictMode may replay effects,
 * so the resource is retired by the actual session boundary, not effect cleanup. */
export function useWallet(authHeaders: () => HeadersInit) {
    const [owner] = useState(() => ({ session: browserSession.snapshot(), workspace: createAccountWorkspace(createWalletApi({ request: browserSession.request, authHeaders }), { date: () => effectiveDateAt(new Date().toISOString(), 'Asia/Ho_Chi_Minh') }) }));
    useEffect(() => {
        const changed = () => { const current = browserSession.snapshot(); if (current.status !== 'ready' || current.revision !== owner.session.revision || current.token !== owner.session.token)
            owner.workspace.dispose(); };
        const unsubscribe = browserSession.subscribe(changed);
        changed();
        const focus = () => { if (owner.workspace.snapshot().phase !== 'checking' && owner.workspace.snapshot().phase !== 'disposed')
            void owner.workspace.refresh(); };
        window.addEventListener('focus', focus);
        return () => { unsubscribe(); window.removeEventListener('focus', focus); };
    }, [owner]);
    return owner.workspace;
}
