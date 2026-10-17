import { createHash } from 'node:crypto';
import { snapshotCoreTables, type AppSnapshot } from '../snapshotValidation.js';
import type { RestoreGuardReader } from '../appSnapshot.js';
import { publicSettingKeys } from '../snapshotFiles.js';
import { moneyColumns } from './snapshot.js';
function canonical(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, canonical(value)]));
    return value;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function readReceipt(row: Record<string, unknown>): boolean {
    if (typeof row.result !== 'string')
        return false;
    try {
        const value = JSON.parse(row.result);
        return value && Object.keys(value).length === 1 && value.snapshotRead === true;
    }
    catch {
        return false;
    }
}
/** SQL result order and read-only capture receipts are not application changes.
 * All financial/write nonces, canonical rows, credentials and legacy ordering are. */
export function walletRestoreDatabaseIdentity(source: Pick<AppSnapshot, 'legacy' | 'tables'>): string {
    const tables = Object.fromEntries(Object.entries(source.tables).map(([name, rows]) => [name, rows.filter(row => name !== 'app_commands' || !readReceipt(row)).map(row => JSON.stringify(canonical(row))).sort()]));
    return hash({ legacy: source.legacy, tables });
}
/** The shared restore preserves local private settings; only its public settings
 * and full media bytes participate in the replacement-file identity. */
export function walletRestoreFilesIdentity(source: Pick<AppSnapshot, 'settings' | 'media'>): string {
    return hash({ media: source.media, settings: Object.fromEntries(publicSettingKeys.filter(key => source.settings[key] !== undefined).map(key => [key, source.settings[key]])) });
}
/** Source has already passed the one shared validator. Only trusted identifiers
 * reach SQL; signed64 Wallet money is cast to text on the existing read owner. */
export function currentWalletRestoreDatabaseIdentity(source: AppSnapshot, live: RestoreGuardReader): string {
    const tables = Object.fromEntries(Object.entries(source.tables).map(([name, rows]) => {
        if (!/^[a-z][a-z0-9_]*$/.test(name))
            throw Error('Invalid restore identity table');
        if (name === 'app_commands' && !rows.length)
            return [name, live.all('SELECT ' + snapshotCoreTables.get(name)!.join(',') + ' FROM ' + name)];
        if (!rows.length)
            return [name, live.get('SELECT 1 AS present FROM ' + name + ' LIMIT 1') ? [{ unexpected: 1 }] : []];
        const columns = Object.keys(rows[0]);
        if (!columns.length || columns.some(column => !/^[a-z][a-z0-9_]*$/.test(column)))
            throw Error('Invalid restore identity columns');
        const projection = columns.map(column => moneyColumns[name]?.includes(column) ? 'CAST(' + column + ' AS TEXT) AS ' + column : column).join(',');
        return [name, live.all('SELECT ' + projection + ' FROM ' + name)];
    }));
    return walletRestoreDatabaseIdentity({ legacy: live.legacy, tables });
}
