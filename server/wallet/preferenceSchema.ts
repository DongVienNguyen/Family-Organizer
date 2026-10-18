import { createHash } from 'node:crypto';
import type { AppWriteTx } from '../appStore.js';
import { normalizePreferenceConfig } from '../../src/features/wallet/preferenceContracts.js';
import { choice,text } from '../../src/features/productivity/validation.js';
export const walletPreferenceSql = `
CREATE TABLE IF NOT EXISTS wallet_preferences(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('filter','chart','layout')),name TEXT NOT NULL,value_json TEXT NOT NULL CHECK(json_valid(value_json) AND json_type(value_json)='object'),archived_at TEXT,revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,created_by TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_preference_owner ON wallet_preferences(owner_id,kind,id);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_preference_layout_owner ON wallet_preferences(owner_id) WHERE kind='layout';
`;
export const walletPreferenceColumns = { wallet_preferences: ['id', 'owner_id', 'kind', 'name', 'value_json', 'archived_at', 'revision', 'created_at', 'updated_at', 'created_by', 'updated_by'] } as const;
export const walletPreferenceChecksum = createHash('sha256').update(walletPreferenceSql + '\nwallet-personal-preferences-v9').digest('hex');
export function prepareWalletPreferences(tx: AppWriteTx): void { tx.exec(walletPreferenceSql); }
export function validateWalletPreferenceTables(tables: Record<string, Record<string, any>[]>, users?: Set<string>): void {
    const layouts = new Set<string>();
    const budgets=new Map<string,{bytes:number;kinds:Map<string,number>}>();
    for (const row of tables.wallet_preferences ?? []) {
        choice(row.kind, ['filter', 'chart', 'layout']);
        text(row.name,120);const budget=budgets.get(row.owner_id)??{bytes:0,kinds:new Map<string,number>()};budget.bytes+=Buffer.byteLength(row.value_json);const count=(budget.kinds.get(row.kind)??0)+1;budget.kinds.set(row.kind,count);budgets.set(row.owner_id,budget);if(count>(row.kind==='layout'?1:32)||budget.bytes>1024*1024)throw Error('Preference owner budget exceeded');
        normalizePreferenceConfig(row.kind, JSON.parse(row.value_json));
        if (users && !users.has(row.owner_id) || row.created_by !== row.owner_id || row.updated_by !== row.owner_id)
            throw Error('Invalid preference owner');
        const time = (v: unknown) => { if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v)
            throw Error('Invalid preference timestamp'); return Date.parse(v); }, created = time(row.created_at);
        if (time(row.updated_at) < created || row.archived_at !== null && time(row.archived_at) < created)
            throw Error('Invalid preference chronology');
        if (row.kind === 'layout') {
            if (layouts.has(row.owner_id))
                throw Error('Duplicate personal layout');
            layouts.add(row.owner_id);
        }
    }
}
