import type { WalletApi } from './api.js';
import { WalletApiError } from './api.js';
import { createWalletCommand, type WalletCommandState } from './commandState.js';
import { normalizeImportMapping, type ImportBatch, type ImportMapping, type ImportPreviewPage, type ImportUpload } from './importContracts.js';
import type { AccessibleWalletAccount } from '../../../server/wallet/access.js';
export interface ImportState {
    phase: 'idle' | 'checking' | 'ready' | 'unavailable' | 'error' | 'disposed';
    step: 1 | 2 | 3 | 4 | 5;
    accounts: AccessibleWalletAccount[];
    batch: ImportBatch | null;
    preview: ImportPreviewPage | null;
    history: ImportBatch[];
    hasMore: boolean;
    historyOffset: number;
    mapping: ImportMapping;
    mappingDirty: boolean;
    dateFormatChosen: boolean;
    command: WalletCommandState<never>;
    error: WalletApiError | null;
}
type Intent = {
    kind: 'stage';
    file: ImportUpload;
} | {
    kind: 'preview';
    id: string;
    revision: number;
    mapping: ImportMapping;
} | {
    kind: 'commit';
    id: string;
    revision: number;
} | {
    kind: 'reopen';
    id: string;
    revision: number;
} | {
    kind: 'undo';
    id: string;
    revision: number;
    policy: 'onlyUnmodified' | 'rejectIfModified';
};
const initialMapping = (): ImportMapping => ({ headerRow: 1, dateColumn: 1, amount: { mode: 'signed', column: 2 }, dateFormat: 'DD/MM/YYYY', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', status: 'cleared', payeeColumn: 3, noteColumn: 4, labelDelimiter: '|', defaultCategoryId: null, labelIds: [], excludedRows: [], delimiter: ',' });
const fail = (message: string, status = 409) => new WalletApiError(status, message, 'CONFLICT', undefined);
type Api = Pick<WalletApi, 'status' | 'accounts' | 'importBatch' | 'importHistory' | 'importRows' | 'stageImport' | 'previewImport' | 'commitImport' | 'reopenImport' | 'undoImport'>;
/** One session owner above navigation. Hide/invalidation drops financial views;
 * unresolved exact request body/key stays only in the existing command owner. */
export function createImportWorkspace(api: Api) {
    let state: ImportState = { phase: 'idle', step: 1, accounts: [], batch: null, preview: null, history: [], hasMore: false, historyOffset: 0, mapping: initialMapping(), mappingDirty: false, dateFormatChosen: false, command: { phase: 'idle' }, error: null }, active = false, disposed = false, generation = 0, currentId: string | null = null, intentAccountId: string | null = null;
    const listeners = new Set<() => void>(), publish = (patch: Partial<ImportState>) => { if (disposed)
        return; state = Object.freeze({ ...state, ...patch }); for (const l of listeners)
        l(); }, busy = () => ['pending', 'unknown', 'conflict'].includes(command.snapshot().phase), writable = (account: AccessibleWalletAccount | undefined) => !!account && account.permission !== 'read' && account.archivedAt === null;
    const command = createWalletCommand<Intent, {
        kind: Intent['kind'];
        batch: ImportBatch;
    }>({ execute: async (input, key) => ({ kind: input.kind, batch: input.kind === 'stage' ? await api.stageImport(input.file, key) : input.kind === 'preview' ? await api.previewImport(input.id, input.revision, input.mapping, key) : input.kind === 'commit' ? await api.commitImport(input.id, input.revision, key) : input.kind === 'reopen' ? await api.reopenImport(input.id, input.revision, key) : await api.undoImport(input.id, input.revision, input.policy, key) }) });
    const unsubscribe = command.subscribe(() => { const { result: _result, ...value } = command.snapshot(); publish({ command: value }); });
    const failed = (error: unknown) => publish({ phase: 'error', batch: null, preview: null, accounts: [], history: [], error: error instanceof WalletApiError ? error : fail('Không tải được bản nhập.', 0) });
    const sameScope = (a: AccessibleWalletAccount[], b: AccessibleWalletAccount[]) => JSON.stringify(a.map(v => [v.id, v.revision, v.permission, v.archivedAt]).sort()) === JSON.stringify(b.map(v => [v.id, v.revision, v.permission, v.archivedAt]).sort());
    async function page(batch: ImportBatch, offset: number, version: number) { const preview = await api.importRows(batch.id, offset), fresh = await api.accounts(); if (disposed || !active || generation !== version)
        return null; if (preview.revision !== batch.revision || !fresh.some(a => a.id === batch.accountId) || !sameScope(state.accounts, fresh))
        throw fail('Quyền hoặc bản nhập vừa thay đổi.'); return preview; }
    async function finish() { const result = command.snapshot().result; if (!result)
        return; currentId = result.batch.id; if (!active || disposed)
        return; publish({step:result.kind==='stage'?2:result.kind==='preview'?4:5,mappingDirty:false});const version = ++generation, batch = result.batch, fresh = await api.accounts(); if (disposed || !active || version !== generation)
        return; if (!fresh.some(a => a.id === batch.accountId)) {
        failed(new WalletApiError(404, 'Tài khoản không còn khả dụng.', 'NOT_FOUND', undefined));
        return;
    } const mapping = batch.mapping ?? (result.kind === 'stage' ? batch.format === 'ofx' ? { ...initialMapping(), headerRow: null, dateFormat: 'ofx' as const, currencyColumn: 5 } : initialMapping() : state.mapping); publish({ phase: 'ready', accounts: fresh, batch, preview: null, mapping, mappingDirty: false, dateFormatChosen: result.kind === 'stage' ? batch.format === 'ofx' : state.dateFormatChosen, step: result.kind === 'stage' ? 2 : result.kind === 'preview' ? 4 : 5, error: null }); if (result.kind === 'preview')
        try {
            const preview = await page(batch, 0, version);
            if (preview)
                publish({ preview });
        }
        catch (error) {
            if (!disposed && generation === version)
                failed(error);
        } }
    async function refresh() { const version = ++generation; publish({ phase: active ? 'checking' : 'idle', accounts: [], history: [], batch: null, preview: null, error: null }); if (!active || disposed)
        return; try {
        const status = await api.status();
        if (disposed || version !== generation)
            return;
        if (!status.active || status.storageVersion < 10) {
            publish({ phase: 'unavailable' });
            return;
        }
        const accounts = await api.accounts(), history = await api.importHistory(state.historyOffset);
        if (disposed || version !== generation)
            return;
        let batch = currentId ? await api.importBatch(currentId) : null;
        if (batch && !accounts.some(a => a.id === batch!.accountId))
            batch = null;
        const preview = batch && batch.state === 'preview' && state.step === 4 ? await api.importRows(batch.id, 0) : null, fresh = await api.accounts();
        if (disposed || version !== generation)
            return;
        if (!sameScope(accounts, fresh) || batch && !fresh.some(a => a.id === batch.accountId))
            throw fail('Quyền hoặc tài khoản vừa thay đổi.');
        if (preview && batch && preview.revision !== batch.revision)
            throw fail('Preview vừa thay đổi.');
        publish({ phase: 'ready', accounts: fresh, batch, preview,...(batch&&['queued','committed','undone','expired'].includes(batch.state)?{step:5 as const}:{}), history: history.batches, hasMore: history.hasMore, ...(batch?.mapping && !state.mappingDirty ? { mapping: batch.mapping, dateFormatChosen: true } : {}) });
    }
    catch (error) {
        if (!disposed && version === generation)
            failed(error);
    } }
    async function authorized(accountId: string) { const version = generation, status = await api.status(), fresh = await api.accounts(); return !disposed && active && version === generation && status.active && status.storageVersion >= 10 && writable(fresh.find(a => a.id === accountId)); }
    async function submit(input: Intent) { if (disposed || !active || busy())
        return; const accountId = input.kind === 'stage' ? input.file.accountId : state.batch?.accountId; if (!accountId)
        return; try {
        if (!await authorized(accountId)) {
            await refresh();
            return;
        }
        intentAccountId = accountId;
        publish({ preview: null, error: null });
        await command.submit(input);
        await finish();
    }
    catch (error) {
        if (!disposed)
            failed(error);
    } }
    const result = { snapshot: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, refresh, async show() { active = true; await refresh(); }, hide() { active = false; generation++; publish({ phase: 'idle', accounts: [], batch: null, preview: null, history: [], error: null }); },
        step(step: ImportState['step']) { if (busy() || disposed)
            return; if (step === 1) {
            currentId = null;
            command.reset();
            publish({ step, batch: null, preview: null, mapping: initialMapping(), dateFormatChosen: false, mappingDirty: false });
        }
        else if (state.batch && [2, 3, 4, 5].includes(step))
            publish({ step }); },
        changeMapping(patch: Partial<ImportMapping>) { if (busy() || disposed)
            return; publish({ mapping: { ...state.mapping, ...structuredClone(patch) }, mappingDirty: true, ...(patch.dateFormat ? { dateFormatChosen: true } : {}), error: null }); },
        exclude(row: number, excluded: boolean) { const values = new Set(state.mapping.excludedRows); if (excluded)
            values.add(row);
        else
            values.delete(row); result.changeMapping({ excludedRows: [...values].sort((a, b) => a - b) }); },
        stage(file: ImportUpload) { return submit({ kind: 'stage', file }); },
        async preview() { if (!state.batch || !state.dateFormatChosen || busy())
            return; let mapping: ImportMapping; try {
            mapping = normalizeImportMapping(state.mapping);
        }
        catch {
            publish({ error: fail('Ánh xạ cột không hợp lệ.', 400) });
            return;
        } await submit({ kind: 'preview', id: state.batch.id, revision: state.batch.revision, mapping }); },
        async commit() { const batch = state.batch; if (!batch || batch.state !== 'preview' || state.mappingDirty || batch.errorCount || !(batch.validCount + batch.duplicateCount) || busy())
            return; await submit({ kind: 'commit', id: batch.id, revision: batch.revision }); },
        async reopen() { const batch = state.batch; if (batch?.state === 'queued' && !busy())
            await submit({ kind: 'reopen', id: batch.id, revision: batch.revision }); },
        async undo(policy: 'onlyUnmodified' | 'rejectIfModified') { const batch = state.batch; if (batch?.state === 'committed' && !busy())
            await submit({ kind: 'undo', id: batch.id, revision: batch.revision, policy }); },
        async retry() { if (disposed || !active || command.snapshot().phase !== 'unknown')
            return; const version = generation; try {
            const status = await api.status(), accounts = await api.accounts();
            if (disposed || version !== generation || !active)
                return;
            if (!status.active || status.storageVersion < 10 || !writable(accounts.find(a => a.id === intentAccountId))) {
                await refresh();
                return;
            }
            await command.retry();
            await finish();
        }
        catch (error) {
            if (!disposed)
                failed(error);
        } },
        async select(id: string) { if (busy())
            return; currentId = id; publish({ step: 5, mappingDirty: false }); await refresh(); if (state.batch?.state === 'preview')
            publish({ step: 4 }); if (state.batch?.state === 'staged')
            publish({ step: 2 }); if (state.batch?.state === 'preview')
            await result.loadPage(0); },
        async loadPage(offset: number) { const batch = state.batch; if (!batch || busy())
            return; const version = ++generation; publish({ preview: null }); try {
            const preview = await page(batch, offset, version);
            if (preview)
                publish({ preview });
        }
        catch (error) {
            if (!disposed && version === generation)
                failed(error);
        } },
        async poll() { if (!active || disposed || state.batch?.state !== 'queued' || busy())
            return; await refresh(); },
        async historyPage(offset: number) { if (busy())
            return; publish({ historyOffset: offset }); await refresh(); },
        async reload() { if (busy() && command.snapshot().phase !== 'conflict')
            return; command.reset(); publish({ mappingDirty: false }); await refresh(); },
        dispose() { if (disposed)
            return; generation++; active = false; unsubscribe(); command.dispose(); state = Object.freeze({ ...state, phase: 'disposed', accounts: [], batch: null, preview: null, history: [], mapping: initialMapping(), command: { phase: 'disposed' as const }, error: null }); disposed = true; for (const l of listeners)
            l(); listeners.clear(); }
    };
    return result;
}
export type ImportWorkspace = ReturnType<typeof createImportWorkspace>;
