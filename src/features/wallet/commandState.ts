import { WalletApiError } from './api.js';
export type WalletCommandState<T> = {
    phase: 'idle' | 'pending' | 'unknown' | 'conflict' | 'error' | 'success' | 'disposed';
    result?: T;
    error?: WalletApiError;
};
/** Session-owned, memory-only intent. No automatic retry or persisted offline queue.
 * Unknown outcomes retain the exact frozen payload/key until explicitly retried.
 * Keep this owner above tab navigation; dispose it at the session boundary. */
export function createWalletCommand<I, T>(ports: {
    execute: (input: I, nonce: string) => Promise<T>;
    newRequestId?: () => string;
}) {
    let state: WalletCommandState<T> = { phase: 'idle' }, intent: {
        input: I;
        nonce: string;
    } | undefined, revision = 0;
    const listeners = new Set<() => void>();
    const publish = (next: WalletCommandState<T>) => { state = Object.freeze(next); for (const listener of listeners)
        listener(); };
    async function run(wasUnknown = false) {
        if (!intent)
            throw Error('No financial intent');
        const owned = intent, version = ++revision;
        publish({ phase: 'pending' });
        try {
            const result = await ports.execute(structuredClone(owned.input), owned.nonce);
            if (version === revision && state.phase !== 'disposed') {
                intent = undefined;
                publish({ phase: 'success', result });
            }
        }
        catch (error) {
            if (version !== revision || state.phase === 'disposed')
                return;
            const failure = error instanceof WalletApiError ? error : new WalletApiError(0, 'Chưa xác nhận được kết quả.', 'NETWORK_ERROR', owned.nonce, true);
            // A subsequent 4xx (for example a revoked grant) is not evidence that
            // the first request never committed. Only its successful receipt resolves it.
            const phase = wasUnknown || failure.unknownOutcome ? 'unknown' : failure.status === 409 ? 'conflict' : 'error';
            if (phase !== 'unknown')
                intent = undefined;
            publish({ phase, error: failure });
        }
    }
    return {
        snapshot: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        async submit(input: I) {
            if (!['idle', 'error', 'success'].includes(state.phase))
                throw Error('Financial intent is unresolved');
            const nonce = (ports.newRequestId ?? (() => crypto.randomUUID()))();
            if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(nonce))
                throw Error('Invalid financial nonce');
            intent = { input: structuredClone(input), nonce };
            await run();
        },
        async retry() { if (state.phase !== 'unknown' || !intent)
            throw Error('No unknown financial intent'); await run(true); },
        reset() { if (['pending', 'unknown', 'disposed'].includes(state.phase))
            throw Error('Cannot discard unresolved financial intent'); intent = undefined; publish({ phase: 'idle' }); },
        dispose() { revision++; intent = undefined; publish({ phase: 'disposed' }); listeners.clear(); },
    };
}
