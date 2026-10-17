import type {WalletReceiptMetadata} from '../../../server/wallet/receiptContract.js';
import type {ReceiptMutation} from '../../../server/wallet/receipts.js';
import type { WalletApi } from './api.js';
import { WalletApiError } from './api.js';
import type { WalletRecordDetail } from '../../../server/wallet/read.js';
import type { WalletCatalog } from '../../../server/wallet/catalogView.js';
import type { AccessibleWalletAccount } from '../../../server/wallet/access.js';
import type { RecordFilter } from './contracts.js';
import type { WalletRecordView } from '../../../server/wallet/query.js';
import type { RecordDraft, RecordPatch, WalletRecordResult,WalletRecordActions } from '../../../server/wallet/records.js';
import { createWalletCommand, type WalletCommandState } from './commandState.js';
import { recordFormDraft, recordFormInput, recordFormPatch, type RecordFormDraft, type RecordFormInitial } from './recordDraft.js';
import { resolvePeriod } from './dates.js';
import { normalizeFilter } from './filter.js';
type Api = Pick<WalletApi, 'status' | 'accounts' | 'catalog' | 'query' | 'record' | 'actions' | 'createRecord' | 'updateRecord' | 'voidRecord'>&Partial<Pick<WalletApi,'receipts'|'attachReceipt'|'detachReceipt'|'receiptFile'>>;
export interface WalletRecordForm {
    draft: RecordFormDraft;
    initial?: RecordFormInitial;
    invalid: string | null;
}
export interface RecordWorkspaceState {
    phase: 'checking' | 'inactive' | 'ready' | 'error' | 'disposed';
    accounts: AccessibleWalletAccount[];
    catalog: WalletCatalog;
    filter: RecordFilter;
    filterInvalid: boolean;
    items: WalletRecordView[];
    total: number;
    nextCursor: string | null;
    loadingMore: boolean;
    selected: WalletRecordDetail | null;
    actions:WalletRecordActions|null;
    receipts:WalletReceiptMetadata[];
    receiptStorage:boolean;
    form: WalletRecordForm | null;
    command: WalletCommandState<never>;
    error: WalletApiError | null;
}
type Intent = {
    kind: 'create';
    input: RecordDraft;
} | {
    kind: 'update';
    id: string;
    revision: number;
    input: RecordPatch;
} | {
    kind: 'void';
    id: string;
    revision: number;
}|{kind:'attach';id:string;revision:number;input:{fileName:string;dataUrl:string}}|{kind:'detach';id:string;revision:number;receiptId:string};
type Result=WalletRecordResult|ReceiptMutation|{recordId:string;revision:number;receiptId:string};
export function createRecordWorkspace(api: Api, options: {
    actorId: string | (() => string);
    date: () => string;
    timezone: string;
    newRequestId?: () => string;
    now?: () => number;
}) {
    const defaultFilter = () => normalizeFilter({ period: resolvePeriod({ kind: 'month', anchorDate: options.date() }, options.timezone), referenceCurrency: 'VND', statuses: ['uncleared', 'cleared', 'reconciled'] });
    let filter = defaultFilter();
    const empty = () => ({ accounts: [], catalog: { categories: [], labels: [] }, items: [], total: 0, nextCursor: null, loadingMore: false, selected: null, actions:null, receipts:[],receiptStorage:false, form: null });
    let state: RecordWorkspaceState = { phase: 'checking', ...empty(), filter, filterInvalid: false, command: { phase: 'idle' }, error: null }, form: WalletRecordForm | null = null, formOpen = false, selectedId: string | null = null, selectedInitial: RecordFormInitial | undefined, generation = 0, disposed = false, addAnother = false;
    const listeners = new Set<() => void>(), publish = (patch: Partial<RecordWorkspaceState>) => { if (disposed)
        return; state = Object.freeze({ ...state, ...patch }); for (const listener of listeners)
        listener(); };
    const command = createWalletCommand<Intent, Result>({ newRequestId: options.newRequestId, execute: (intent, nonce) => {
        if(intent.kind==='attach'){if(!api.attachReceipt)throw new WalletApiError(409,'Kho hóa đơn chưa sẵn sàng.','CONFLICT',nonce);return api.attachReceipt(intent.id,intent.revision,intent.input,nonce);}
        if(intent.kind==='detach'){if(!api.detachReceipt)throw new WalletApiError(409,'Kho hóa đơn chưa sẵn sàng.','CONFLICT',nonce);return api.detachReceipt(intent.id,intent.revision,intent.receiptId,nonce);}
        return intent.kind === 'create' ? api.createRecord(intent.input, nonce) : intent.kind === 'update' ? api.updateRecord(intent.id, intent.revision, intent.input, nonce) : api.voidRecord(intent.id, intent.revision, nonce);
    } });
    const unsubscribe = command.subscribe(() => { const { result: _result, ...status } = command.snapshot(); publish({ command: status }); });
    const busy = () => ['pending', 'unknown'].includes(command.snapshot().phase), editable = () => !disposed && state.phase === 'ready' && !busy();
    const errorValue = (error: unknown) => error instanceof WalletApiError ? error : new WalletApiError(0, 'Không tải được giao dịch.', 'NETWORK_ERROR', undefined);
    function localWrite(value: WalletRecordDetail | null, accounts = state.accounts) { const actorId = typeof options.actorId === 'function' ? options.actorId() : options.actorId; return !!value && !value.partial && !['trade'].includes(value.record.kind) && value.record.settlementStatus !== 'voided' && !value.record.occurrenceId && value.postings.every(p => { const permission = accounts.find(a => a.id === p.accountId)?.permission; return permission === 'manage' || permission === 'contribute' && value.record.creatorId === actorId; }); }
    function canEdit(value:WalletRecordDetail|null,accounts=state.accounts,actions=state.actions){return !!value&&actions?.recordId===value.record.id&&actions.canEdit&&localWrite(value,accounts);}
    function canVoid(){return !!state.selected&&state.actions?.recordId===state.selected.record.id&&state.actions.canVoid&&localWrite(state.selected);}
    function makeForm(locale: string, initial?: RecordFormInitial) { return { draft: recordFormDraft(initial, state.accounts, { locale, date: options.date(), timezone: options.timezone }), initial, invalid: null }; }
    async function refresh() {
        if (disposed)
            return;
        const current = ++generation;
        publish({ phase: 'checking', ...empty(), error: null });
        try {
            const status = await api.status();
            if (disposed || current !== generation)
                return;
            if (!status.active) {
                form = null;
                selectedId = null;
                selectedInitial = undefined;
                publish({ phase: 'inactive' });
                return;
            }
            const [accounts, catalog, page] = await Promise.all([api.accounts(), api.catalog(), api.query(filter, null, 50)]);
            if (disposed || current !== generation)
                return;
            let selected: WalletRecordDetail | null = null, actions:WalletRecordActions|null=null, initial: RecordFormInitial | undefined;
            let receipts:WalletReceiptMetadata[]=[];
            if (selectedId) {
                try{
                    [selected,actions]=await Promise.all([api.record(selectedId),api.actions(selectedId)]);
                    if(disposed||current!==generation)return;
                    initial={detail:selected};
                    if(status.storageVersion>=5&&!selected.partial){
                        if(!api.receipts)throw new WalletApiError(409,'Kho hóa đơn chưa sẵn sàng.','CONFLICT',undefined);
                        const manifest=await api.receipts(selectedId);
                        if(manifest.recordId!==selected.record.id||manifest.revision!==selected.record.revision)throw new WalletApiError(409,'Giao dịch vừa thay đổi.','CONFLICT',undefined);
                        receipts=manifest.receipts;
                    }
                    if(selected.feeRecordId)initial.fee=await api.record(selected.feeRecordId);
                }catch(error){
                    if(error instanceof WalletApiError&&[403,404].includes(error.status)){selectedId=null;form=null;formOpen=false;}
                    throw error;
                }
            }
            if (disposed || current !== generation)
                return;
            if (form?.initial && !canEdit(selected, accounts,actions))
                form = null;
            selectedInitial = initial;
            publish({ phase: 'ready', accounts, catalog, items: page.items, total: page.total, nextCursor: page.nextCursor, selected,actions,receipts,receiptStorage:status.storageVersion>=5, form: formOpen ? form : null });
        }
        catch (error) {
            if (disposed || current !== generation)
                return;
            selectedInitial = undefined;
            publish({ phase: 'error', ...empty(), error: errorValue(error) });
        }
    }
    async function finish(operation: () => Promise<void>) {
        await operation();
        if (disposed || command.snapshot().phase !== 'success')
            return;
        const result = command.snapshot().result!, locale = form?.draft.locale ?? 'vi-VN', again = addAnother;
        form = null;
        formOpen = false;
        selectedId = 'record'in result?result.record.id:result.recordId;
        publish({ form: null });
        await refresh();
        if (!disposed && again && state.phase === 'ready') {
            command.reset();
            selectedId = null;
            form = makeForm(locale);
            formOpen = true;
            publish({ form, selected: null,receipts:[] });
        }
    }
    function canManageReceipts(){
        const value=state.selected,actorId=typeof options.actorId==='function'?options.actorId():options.actorId;
        return state.phase==='ready'&&state.receiptStorage&&!!value&&!value.partial&&value.record.settlementStatus!=='voided'&&value.postings.every(p=>{const permission=state.accounts.find(a=>a.id===p.accountId)?.permission;return permission==='manage'||permission==='contribute'&&value.record.creatorId===actorId;});
    }
    async function receiptMutation(id:string,revision:number,intent:Intent){
        if(disposed||busy()||form)return;
        if(state.phase==='checking')await refresh();
        if(!editable()||state.selected?.record.id!==id)return;
        if(state.selected.record.revision!==revision){publish({error:new WalletApiError(409,'Giao dịch vừa thay đổi.','CONFLICT',undefined)});return;}
        if(!canManageReceipts()){publish({error:new WalletApiError(403,'Không có quyền sửa hóa đơn.','FORBIDDEN',undefined)});return;}
        command.reset();publish({error:null});addAnother=false;await finish(()=>command.submit(intent));
        if([403,404].includes(command.snapshot().error?.status??0))await refresh();
    }
    return {
        snapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, refresh,canManageReceipts,
        attachReceipt:(id:string,revision:number,input:{fileName:string;dataUrl:string})=>receiptMutation(id,revision,{kind:'attach',id,revision,input}),
        detachReceipt:(id:string,revision:number,receiptId:string)=>receiptMutation(id,revision,{kind:'detach',id,revision,receiptId}),
        async downloadReceipt(receiptId:string){
            if(disposed||state.phase!=='ready'||!state.selected||!api.receiptFile)return null;
            const current=generation,recordId=state.selected.record.id,metadata=state.receipts.find(row=>row.id===receiptId);if(!metadata)return null;
            try{const blob=await api.receiptFile(recordId,metadata);if(disposed||current!==generation||state.phase!=='ready'||state.selected?.record.id!==recordId)return null;return {blob,fileName:metadata.fileName};}
            catch(error){if(!disposed&&current===generation){const failure=errorValue(error);if([403,404].includes(failure.status))await refresh();else publish({error:failure});}return null;}
        }, canEdit: () => canEdit(state.selected),canVoid,
        async select(id: string) { if (!editable() || form)
            return; selectedId = id; await refresh(); },
        openCreate(locale: string) { if (!editable() || form || !state.accounts.some(a => a.permission !== 'read' && a.archivedAt === null))
            return; command.reset(); selectedId = null; selectedInitial = undefined; form = makeForm(locale); formOpen = true; publish({ form, selected: null,actions:null,receipts:[],error:null }); },
        edit(locale: string) { if (!editable() || form || !canEdit(state.selected) || !selectedInitial)
            return; command.reset(); form = makeForm(locale, selectedInitial); formOpen = true; publish({ form,error:null }); },
        change(patch: Partial<RecordFormDraft>) { if (!editable() || !form || command.snapshot().phase === 'conflict')
            return; form = { ...form, draft: { ...form.draft, ...patch }, invalid: null }; publish({ form }); },
        cancel() { if (!editable() || !form)
            return; command.reset(); form = null; formOpen = false; publish({ form }); },
        hideForm() { if (disposed || !busy())
            return; formOpen = false; publish({ form: null }); },
        resumeForm() { if (disposed || state.phase !== 'ready' || !form)
            return; formOpen = true; publish({ form }); },
        async reload() { if (!editable() || !form?.initial)
            return; const locale = form.draft.locale; form = null; formOpen = false; command.reset(); await refresh(); if (state.phase === 'ready' && canEdit(state.selected) && selectedInitial) {
            form = makeForm(locale, selectedInitial);
            formOpen = true;
            publish({ form });
        } },
        async save(another = false) {
            if (!editable() || !form || command.snapshot().phase === 'conflict')
                return;
            let intent: Intent;
            try {
                const args = { initial: form.initial, now: options.now };
                intent = form.initial ? { kind: 'update', id: form.initial.detail.record.id, revision: form.initial.detail.record.revision, input: recordFormPatch(form.draft, state.accounts, { ...args, initial: form.initial }) } : { kind: 'create', input: recordFormInput(form.draft, state.accounts, args) };
            }
            catch (error) {
                const code = error instanceof Error && ['AMBIGUOUS_LOCAL_TIME', 'NONEXISTENT_LOCAL_TIME', 'ACCOUNT_NOT_WRITABLE'].includes(error.message) ? error.message : 'INVALID_INPUT';
                form = { ...form, invalid: code };
                publish({ form });
                return;
            }
            addAnother = another && !form.initial;
            await finish(() => command.submit(intent));
        },
        async retry() { if (disposed || state.phase !== 'ready' || command.snapshot().phase !== 'unknown')
            return; await finish(() => command.retry()); },
        async voidSelected(id: string, revision: number) { if(disposed||busy()||form)return;
            command.reset();if(state.phase==='checking')await refresh();
            if(!editable()||state.selected?.record.id!==id)return;
            if(state.selected.record.revision!==revision){publish({error:new WalletApiError(409,'Ghi chép đã thay đổi.','CONFLICT',undefined)});return;}
            if(!canVoid()){publish({error:new WalletApiError(403,'Không có quyền hủy ghi chép.','FORBIDDEN',undefined)});return;}
            command.reset();publish({error:null});addAnother = false; await finish(() => command.submit({ kind: 'void', id, revision })); },
        async applyFilter(value: RecordFilter) { if (!editable() || form)
            return; let next: RecordFilter; try {
            next = normalizeFilter(value);
        }
        catch {
            publish({ filterInvalid: true });
            return;
        } filter = next; selectedId = null; publish({ filter, filterInvalid: false }); await refresh(); },
        async resetFilter() { if (disposed || command.snapshot().phase === 'pending')
            return; filter = defaultFilter(); publish({ filter, filterInvalid: false }); await refresh(); },
        async loadMore() {
            if (!editable() || state.loadingMore || !state.nextCursor)
                return;
            const current = generation, cursor = state.nextCursor;
            publish({ loadingMore: true });
            try {
                const page = await api.query(filter, cursor, 50);
                if (disposed || generation !== current)
                    return;
                const ids = new Set(state.items.map(item => item.record.id));
                if (page.items.some(item => ids.has(item.record.id)))
                    throw Error('Duplicate cursor page');
                publish({ items: [...state.items, ...page.items], total: page.total, nextCursor: page.nextCursor, loadingMore: false });
            }
            catch (error) {
                if (disposed || generation !== current)
                    return;
                publish({ phase: 'error', ...empty(), error: errorValue(error) });
            }
        },
        dispose() { if (disposed)
            return; generation++; form = null; selectedId = null; selectedInitial = undefined; filter = defaultFilter(); unsubscribe(); command.dispose(); state = { ...state, phase: 'disposed', ...empty(), filter, filterInvalid: false, command: { phase: 'disposed' }, error: null }; disposed = true; for (const listener of listeners)
            listener(); listeners.clear(); },
    };
}
export type RecordWorkspace = ReturnType<typeof createRecordWorkspace>;
