import type { WalletApi } from './api.js';
import { WalletApiError } from './api.js';
import { createWalletCommand, type WalletCommandState } from './commandState.js';
import { normalizePreferenceConfig, type WalletLayoutConfig, type WalletPreferences, type WalletPreference, type PreferenceKind, type PreferenceDraft, type PreferenceConfig } from './preferenceContracts.js';
import { preferencesValue } from './preferenceDto.js';
import { createWidgetLoader, type WidgetData } from './widgetData.js';
import type { RecordFilter } from './contracts.js';
type Api = Pick<WalletApi, 'status' | 'preferences' | 'createPreference' | 'updatePreference' | 'report' | 'query' | 'accounts' | 'catalog' | 'balance'>;
interface LayoutDraft {
    id?: string;
    revision: number;
    name: string;
    config: WalletLayoutConfig;
}
interface PreferenceForm {
    kind: PreferenceKind;
    id?: string;
    revision: number;
    name: string;
    config: PreferenceConfig;
    invalid: boolean;
}
interface WidgetState {
    id: string;
    phase: 'loading' | 'ready' | 'error';
    data: WidgetData | null;
    error: WalletApiError | null;
}
export interface DashboardState {
    phase: 'checking' | 'ready' | 'unavailable' | 'error' | 'disposed';
    preferences: WalletPreferences | null;
    layout: LayoutDraft | null;
    layoutDirty: boolean;
    layoutStale: boolean;
    widgets: WidgetState[];
    form: PreferenceForm | null;
    command: WalletCommandState<never>;
    error: WalletApiError | null;
}
type Intent = {
    kind: PreferenceKind;
    id?: string;
    revision: number;
    input: PreferenceDraft;
};
/** Configuration and financial widget views share an authenticated-session owner.
 * Config is never authority. Every refresh starts with empty financial results. */
export function createDashboardWorkspace(api: Api, options: {
    defaultFilter: () => RecordFilter;
    date: () => string;
    newRequestId?: () => string;
}) {
    let state: DashboardState = { phase: 'checking', preferences: null, layout: null, layoutDirty: false, layoutStale: false, widgets: [], form: null, command: { phase: 'idle' }, error: null }, draft: LayoutDraft | null = null, dirty = false, form: PreferenceForm | null = null, formOpen = false, active = false, generation = 0, disposed = false;
    const listeners = new Set<() => void>(), publish = (patch: Partial<DashboardState>) => {
        if (disposed)
            return;
        state = Object.freeze({ ...state, ...patch });
        for (const listener of listeners)
            listener();
    }, failure = (error: unknown) => error instanceof WalletApiError ? error : new WalletApiError(0, 'Không tải được dashboard.', 'NETWORK_ERROR', undefined), command = createWalletCommand<Intent, WalletPreference>({ newRequestId: options.newRequestId, execute: (input, nonce) => input.id ? api.updatePreference(input.kind, input.id, input.revision, input.input, nonce) : api.createPreference(input.kind, input.input, nonce) }), unsubscribe = command.subscribe(() => { const { result: _result, ...publicState } = command.snapshot(); publish({ command: publicState }); }), busy = () => ['pending', 'unknown'].includes(command.snapshot().phase), editable = () => !disposed && state.phase === 'ready' && !busy();
    const fromPreference = (saved: WalletPreference | null): LayoutDraft => saved ? { id: saved.id, revision: saved.revision, name: saved.name, config: normalizePreferenceConfig('layout', saved.config) as WalletLayoutConfig } : { revision: 0, name: 'Dashboard', config: { version: 1, baseFilter: options.defaultFilter(), widgets: [{ id: 'summary', kind: 'summary', width: 1, title: '' }, { id: 'balance-trend', kind: 'balanceTrend', width: 1, title: '' }, { id: 'recent-records', kind: 'recentRecords', width: 2, title: '' }] } };
    async function widgets(current: number) {
        if (!active || !draft || disposed)
            return;
        const config = structuredClone(draft.config), loader = createWidgetLoader(api, { date: options.date });
        publish({ widgets: config.widgets.map(w => ({ id: w.id, phase: 'loading', data: null, error: null })) });
        const values = await Promise.all(config.widgets.map(async (widget: typeof config.widgets[number]): Promise<WidgetState> => {
            try {
                return { id: widget.id, phase: 'ready', data: await loader.load(widget, config.baseFilter), error: null };
            }
            catch (error) {
                return { id: widget.id, phase: 'error', data: null, error: failure(error) };
            }
        }));
        if (disposed || !active || current !== generation)
            return;
        const revoked=values.find(widget=>widget.error&&[401,403,404].includes(widget.error.status));
        if(revoked){publish({phase:'error',preferences:null,layout:null,form:null,widgets:[],error:revoked.error});return;}
        try{await loader.verify();}catch(error){if(disposed||!active||current!==generation)return;publish({phase:'error',preferences:null,layout:null,form:null,widgets:[],error:failure(error)});return;}
        if(disposed||!active||current!==generation)return;
        publish({ widgets: values });
    }
    async function refresh() {
        if (disposed)
            return;
        const current = ++generation;
        publish({ phase: 'checking', preferences: null, layout: null, form: null, widgets: [], error: null });
        try {
            const status = await api.status();
            if (disposed || current !== generation)
                return;
            if (!status.active || status.storageVersion < 9) {
                if (!busy()) {
                    draft = null;
                    dirty = false;
                    form = null;
                }
                publish({ phase: 'unavailable', layoutDirty: false, layoutStale: false });
                return;
            }
            const preferences = preferencesValue(await api.preferences());
            if (disposed || current !== generation)
                return;
            let stale = false;
            if (dirty && draft) {
                stale = (preferences.layout?.id ?? null) !== (draft.id ?? null) || (preferences.layout?.revision ?? 0) !== draft.revision;
            }
            else
                draft = fromPreference(preferences.layout);
            publish({ phase: 'ready', preferences, layout: draft, layoutDirty: dirty, layoutStale: stale, form: formOpen ? form : null });
            await widgets(current);
        }
        catch (error) {
            if (disposed || current !== generation)
                return;
            publish({ phase: 'error', preferences: null, layout: null, form: null, widgets: [], error: failure(error) });
        }
    }
    async function finish(operation: () => Promise<void>) {
        await operation();
        if (disposed)
            return;
        if (command.snapshot().phase === 'success') {
            if (command.snapshot().result?.kind === 'layout') {
                draft = null;
                dirty = false;
            }
            form = null;
            formOpen = false;
            publish({ form: null, layout: null, widgets: [] });
            await refresh();
        }
        else if (command.snapshot().phase === 'conflict')
            publish({ layoutStale: true });
    }
    function changeLayout(change: (config: WalletLayoutConfig) => WalletLayoutConfig) {
        if (!editable() || !draft || form || state.layoutStale)
            return;
        try {
            const config = normalizePreferenceConfig('layout', change(structuredClone(draft.config))) as WalletLayoutConfig;
            draft = { ...draft, config };
            dirty = true;
            publish({ layout: draft, layoutDirty: true, widgets: [] });
            void widgets(++generation);
        }
        catch {
            publish({ error: new WalletApiError(400, 'Layout không hợp lệ.', 'INVALID_INPUT', undefined) });
        }
    }
    return { hasForm: () => !!form, snapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, refresh, async show() { active = true; await refresh(); }, hide() { active = false; generation++; publish({ widgets: [] }); },
        addWidget(kind: string) { changeLayout(config => ({ ...config, widgets: [...config.widgets, { id: (options.newRequestId ?? (() => crypto.randomUUID()))(), kind, width: 1, title: '' }] })); }, moveWidget(id: string, direction: -1 | 1) {
            changeLayout(config => {
                const index = config.widgets.findIndex(w => w.id === id), target = index + direction;
                if (index < 0 || target < 0 || target >= config.widgets.length)
                    return config;
                [config.widgets[index], config.widgets[target]] = [config.widgets[target], config.widgets[index]];
                return config;
            });
        }, resizeWidget(id: string, width: 1 | 2) { changeLayout(config => ({ ...config, widgets: config.widgets.map(w => w.id === id ? { ...w, width } : w) })); }, removeWidget(id: string) { changeLayout(config => ({ ...config, widgets: config.widgets.filter(w => w.id !== id) })); }, setBaseFilter(filter: RecordFilter) { changeLayout(config => ({ ...config, baseFilter: filter })); },
        async saveLayout() {
            if (!editable() || !draft || state.layoutStale || form)
                return;
            command.reset();
            await finish(() => command.submit({ kind: 'layout', id: draft!.id, revision: draft!.revision, input: { name: draft!.name, config: draft!.config } }));
        }, async reloadLayout() {
            if (!editable())
                return;
            command.reset();
            draft = null;
            dirty = false;
            await refresh();
        },
        openSave(kind: PreferenceKind, config: PreferenceConfig, initial?: WalletPreference) {
            if (!editable() || form)
                return;
            try {
                command.reset();
                form = { kind, id: initial?.id, revision: initial?.revision ?? 0, name: initial?.name ?? '', config: normalizePreferenceConfig(kind, config), invalid: false };
                formOpen = true;
                publish({ form });
            }
            catch {
                publish({ error: new WalletApiError(400, 'Cấu hình không hợp lệ.', 'INVALID_INPUT', undefined) });
            }
        }, changeName(name: string) {
            if (!editable() || !form || command.snapshot().phase === 'conflict')
                return;
            form = { ...form, name, invalid: false };
            publish({ form });
        }, cancelForm() {
            if (!editable())
                return;
            command.reset();
            form = null;
            formOpen = false;
            publish({ form: null });
        }, hideForm() {
            if (disposed || !busy())
                return;
            formOpen = false;
            publish({ form: null });
        }, resumeForm() {
            if (!disposed && state.phase === 'ready' && form) {
                formOpen = true;
                publish({ form });
            }
        }, async saveForm() {
            if (!editable() || !form || command.snapshot().phase === 'conflict')
                return;
            if (!form.name.trim() || form.name.length > 120) {
                form = { ...form, invalid: true };
                publish({ form });
                return;
            }
            await finish(() => command.submit({ kind: form!.kind, id: form!.id, revision: form!.revision, input: { name: form!.name, config: form!.config } }));
        },
        async reloadForm() { if (!editable() || !form?.id)
            return; const id = form.id, kind = form.kind; command.reset(); form = null; await refresh(); const found = [...(state.preferences?.filters ?? []), ...(state.preferences?.charts ?? []), ...(state.preferences?.layout ? [state.preferences.layout] : [])].find(p => p.id === id && p.kind === kind); if (found && editable()) {
            form = { id, kind, revision: found.revision, name: found.name, config: found.config, invalid: false };
            formOpen = true;
            publish({ form });
        } },
        async archive(saved: WalletPreference, archived: boolean) {
            if (!editable() || form)
                return;
            const current = [...(state.preferences?.filters ?? []), ...(state.preferences?.charts ?? []), ...(state.preferences?.layout ? [state.preferences.layout] : [])].find(p => p.id === saved.id && p.revision === saved.revision);
            if (!current)
                return;
            command.reset();
            await finish(() => command.submit({ kind: saved.kind, id: saved.id, revision: saved.revision, input: { archived } }));
        }, async retry() {
            if (disposed || state.phase !== 'ready' || command.snapshot().phase !== 'unknown')
                return;
            await finish(() => command.retry());
        },
        dispose() {
            if (disposed)
                return;
            generation++;
            unsubscribe();
            command.dispose();
            draft = null;
            form = null;
            state = Object.freeze({ phase: 'disposed', preferences: null, layout: null, layoutDirty: false, layoutStale: false, widgets: [], form: null, command: { phase: 'disposed' as const }, error: null });
            disposed = true;
            for (const listener of listeners)
                listener();
            listeners.clear();
        }
    };
}
export type DashboardWorkspace = ReturnType<typeof createDashboardWorkspace>;
