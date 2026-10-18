import type { WalletApi } from './api.js';
import type { WalletAccountResult, AccountDraft } from '../../../server/wallet/accounts.js';
import type { AccessibleWalletAccount } from '../../../server/wallet/access.js';
import { WalletApiError } from './api.js';
import { createWalletCommand, type WalletCommandState } from './commandState.js';
import { accountDraft, accountInput, type AccountFormDraft } from './accountDraft.js';
type AccountApi = Pick<WalletApi, 'status' | 'accounts' | 'account' | 'balance' | 'createAccount' | 'updateAccount' | 'archiveAccount'>;
export interface WalletAccountForm {
    draft: AccountFormDraft;
    locale: string;
    initial?: WalletAccountResult;
    invalid: boolean;
}
export interface AccountWorkspaceState {
    phase: 'checking' | 'inactive' | 'ready' | 'error' | 'disposed';
    accounts: AccessibleWalletAccount[];
    selected: WalletAccountResult | null;
    balance: Awaited<ReturnType<WalletApi['balance']>> | null;
    form: WalletAccountForm | null;
    command: WalletCommandState<WalletAccountResult>;
    error: WalletApiError | null;
}
type Intent = {
    kind: 'create';
    input: AccountDraft;
} | {
    kind: 'update';
    id: string;
    revision: number;
    input: AccountDraft;
} | {
    kind: 'archive' | 'restore';
    id: string;
    revision: number;
};
/** One owner per authenticated App session, retained above Finance tab navigation.
 * The public snapshot drops financial data synchronously on invalidation. */
export function createAccountWorkspace(api: AccountApi, options: {
    date: () => string;
    newRequestId?: () => string;
}) {
    let state: AccountWorkspaceState = { phase: 'checking', accounts: [], selected: null, balance: null, form: null, command: { phase: 'idle' }, error: null };
    let form: WalletAccountForm | null = null, formOpen = false, selectedId: string | null = null, generation = 0, disposed = false;
    const listeners = new Set<() => void>();
    const publish = (patch: Partial<AccountWorkspaceState>) => { if (disposed)
        return; state = Object.freeze({ ...state, ...patch }); for (const listener of listeners)
        listener(); };
    const command = createWalletCommand<Intent, WalletAccountResult>({ newRequestId: options.newRequestId, execute: (intent, nonce) => intent.kind === 'create' ? api.createAccount(intent.input, nonce) : intent.kind === 'update' ? api.updateAccount(intent.id, intent.revision, intent.input, nonce) : intent.kind === 'restore' ? api.updateAccount(intent.id, intent.revision, { archived: false }, nonce) : api.archiveAccount(intent.id, intent.revision, nonce) });
    // A successful receipt can contain money. It belongs to the intent owner,
    // never the view snapshot that is cleared during permission revalidation.
    const unsubscribe = command.subscribe(() => { const { result: _result, ...publicState } = command.snapshot(); publish({ command: publicState }); });
    const busy = () => ['pending', 'unknown'].includes(command.snapshot().phase);
    const failure = (error: unknown) => error instanceof WalletApiError ? error : new WalletApiError(0, 'Không tải được Wallet.', 'NETWORK_ERROR', undefined);
    async function refresh() {
        if (disposed)
            return;
        const current = ++generation;
        publish({ phase: 'checking', accounts: [], selected: null, balance: null, form: null, error: null });
        try {
            const status = await api.status();
            if (disposed || current !== generation)
                return;
            if (!status.active) {
                form = null;
                selectedId = null;
                publish({ phase: 'inactive' });
                return;
            }
            const accounts = await api.accounts();
            if (disposed || current !== generation)
                return;
            let selected: WalletAccountResult | null = null, balance: AccountWorkspaceState['balance'] = null;
            if (selectedId && accounts.some(a => a.id === selectedId)) {
                [selected, balance] = await Promise.all([api.account(selectedId), api.balance(selectedId, options.date())]);
                if (disposed || current !== generation)
                    return;
            }
            else if (selectedId) {
                selectedId = null;
                form = null;
            }
            if (form?.initial && (!selected || selected.account.permission !== 'manage'))
                form = null;
            publish({ phase: 'ready', accounts, selected, balance, form: formOpen ? form : null });
        }
        catch (error) {
            if (disposed || current !== generation)
                return;
            publish({ phase: 'error', accounts: [], selected: null, balance: null, form: null, error: failure(error) });
        }
    }
    async function finish(operation: () => Promise<void>) {
        if (disposed)
            return;
        await operation();
        if (disposed)
            return;
        if (command.snapshot().phase === 'success') {
            form = null;
            formOpen = false;
            selectedId = command.snapshot().result!.account.id;
            publish({ form: null });
            await refresh();
        }
    }
    function editable() { return !disposed && state.phase === 'ready' && !busy(); }
    return {
        snapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, refresh,
        async select(id: string) { if (!editable() || form)
            return; selectedId = id; await refresh(); },
        openCreate(locale: string) { if (!editable() || form)
            return; command.reset(); selectedId = null; formOpen = true; form = { draft: accountDraft(undefined, locale, options.date()), locale, invalid: false }; publish({ selected: null, balance: null, form }); },
        edit(locale: string) { if (!editable() || form || state.selected?.account.permission !== 'manage')
            return; command.reset(); formOpen = true; form = { draft: accountDraft(state.selected, locale, options.date()), locale, initial: state.selected, invalid: false }; publish({ form }); },
        change(patch: Partial<AccountFormDraft>) {
            if (!editable() || !form || command.snapshot().phase === 'conflict')
                return;
            form = { ...form, draft: { ...form.draft, ...patch }, invalid: false };
            publish({ form });
        },
        cancel() { if (!editable() || !form)
            return; command.reset(); form = null; formOpen = false; publish({ form }); },
        hideForm() { if (disposed || !busy())
            return; formOpen = false; publish({ form: null }); },
        resumeForm() { if (disposed || state.phase !== 'ready' || !form)
            return; formOpen = true; publish({ form }); },
        /** Explicitly discard/reload a conflicted draft. Never rebase money silently. */
        async reload() { if (!editable() || !form?.initial)
            return; const locale = form.locale; form = null; command.reset(); await refresh(); if (state.phase === 'ready' && state.selected?.account.permission === 'manage') {
            form = { draft: accountDraft(state.selected, locale, options.date()), locale, initial: state.selected, invalid: false };
            publish({ form });
        } },
        async save() {
            if (!editable() || !form || command.snapshot().phase === 'conflict')
                return;
            let input: AccountDraft;
            try {
                input = accountInput(form.draft, form.locale);
            }
            catch {
                form = { ...form, invalid: true };
                publish({ form });
                return;
            }
            const intent: Intent = form.initial ? { kind: 'update', id: form.initial.account.id, revision: form.initial.account.revision, input } : { kind: 'create', input };
            await finish(() => command.submit(intent));
        },
        async archive(id: string, revision: number) { if (!editable() || form || state.selected?.account.permission !== 'manage' || state.selected.account.id !== id || state.selected.account.revision !== revision)
            return; command.reset(); await finish(() => command.submit({ kind: 'archive', id, revision })); },
        async restore(id: string, revision: number) { if (!editable() || form || state.selected?.account.permission !== 'manage' || state.selected.account.id !== id || state.selected.account.revision !== revision || !state.selected.account.archivedAt)
            return; command.reset(); await finish(() => command.submit({ kind: 'restore', id, revision })); },
        async retry() { if (disposed || state.phase !== 'ready' || command.snapshot().phase !== 'unknown')
            return; await finish(() => command.retry()); },
        dispose() { if (disposed)
            return; generation++; form = null; selectedId = null; unsubscribe(); command.dispose(); state = { phase: 'disposed', accounts: [], selected: null, balance: null, form: null, command: { phase: 'disposed' }, error: null }; disposed = true; for (const listener of listeners)
            listener(); listeners.clear(); },
    };
}
export type AccountWorkspace = ReturnType<typeof createAccountWorkspace>;
