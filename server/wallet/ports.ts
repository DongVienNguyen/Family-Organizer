import {createWalletRules} from './rules.js';
import {createWalletExports} from './exports.js';
import {createWalletImports} from './imports.js';
import {createImportFiles} from './importFiles.js';
import {createWalletPreferences} from './preferences.js';
import {createWalletReports} from './reports.js';
import {createWalletFx,createFrankfurterProvider,type FxRate} from './fx.js';
import {convertMoney} from '../../src/features/wallet/money.js';
import {createWalletTemplates} from './templates.js';
import {createWalletCatalog} from './catalog.js';
import {createWalletBulk} from './bulk.js';
import {createWalletSelections} from './selections.js';
import {walletStorageVersions} from './schemaRegistry.js';
import {readWalletFilterOptions} from './filterOptions.js';
import {appConfig} from '../config.js';
import {createReceiptFiles} from './receiptFiles.js';
import {createWalletReceipts} from './receipts.js';
import type * as Sqlite from '../sqlite.js';
import type * as Gateway from '../appStore.js';
import type { Actor } from '../../src/features/wallet/contracts.js';
import { createWalletAccess, assertWalletActor, type WalletReader } from './access.js';
import { createWalletAccounts } from './accounts.js';
import { createWalletRecords } from './records.js';
import { createWalletQueries } from './query.js';
import { createWalletReads } from './read.js';
import {readWalletCatalog} from './catalogView.js';
/** Existing installation connection/I01 writer only. Factory/import owns no
 * connection, migration, activation, schedule or external provider. */
export function createWalletPorts(storage: typeof Sqlite, gateway: typeof Gateway, options: {
    enqueueImport?:Parameters<typeof createWalletImports>[0]['enqueue'];now?: () => number;fxProvider?:(asOf:string)=>Promise<FxRate>;
} = {}) {
    const reader: WalletReader = { get(sql, ...args) { const tx = gateway.currentAppWriteTx(); return tx ? tx.get(sql, ...args) : storage.sqliteConnection().prepare(sql).get(...args); }, all(sql, ...args) { const tx = gateway.currentAppWriteTx(); return tx ? tx.all(sql, ...args) : storage.sqliteConnection().prepare(sql).all(...args) as any[]; }, get legacy() { return gateway.currentAppWriteTx()?.legacy; } };
    const access = createWalletAccess(reader), storageVersion = () => reader.get("SELECT max(version) AS version FROM app_migrations WHERE namespace='wallet'")?.version ?? 0;
    const candidates = (): Actor[] => reader.legacy ? reader.legacy.users.filter(user => !user.isDeleted && ['admin', 'member'].includes(user.role)).map(user => ({ userId: user.id, role: user.role })) : reader.all("SELECT id,json_extract(data,'$.role') AS role FROM users WHERE json_extract(data,'$.role') IN('admin','member') AND COALESCE(json_extract(data,'$.isDeleted'),0)=0").map(row => ({ userId: row.id, role: row.role }));
    const audience = (ids: string[], kind: 'account' | 'record') => { const result = new Set<string>(); for (const actor of candidates())
        for (const id of ids) {
            try {
                if (kind === 'account')
                    access.getAccount(actor, id);
                else
                    access.getRecord(actor, id);
                result.add(actor.userId);
                break;
            }
            catch (error) {
                if ((error as any)?.status === 403 || (error as any)?.status === 404)
                    continue;
                throw error;
            }
        } return result; };
    const fx=createWalletFx({reader,write:gateway.withAppWriteTransaction,now:options.now,provider:options.fxProvider??createFrankfurterProvider()}),queries=createWalletQueries({reader,referenceValue:input=>{const rate=fx.getFxRate({fromCurrency:input.money.currency,toCurrency:input.targetCurrency},input.effectiveDate);return rate?convertMoney(input.money,input.targetCurrency,rate):undefined;}}),reports=createWalletReports({reader,queries,now:options.now,getFxRate:fx.getFxRate});
    return {rules:createWalletRules({reader,write:gateway.withAppWriteTransaction,queries,now:options.now}),exports:createWalletExports({reader,queries,now:options.now}),imports:createWalletImports({reader,write:gateway.withAppWriteTransaction,files:createImportFiles({dataRoot:appConfig.dataRoot}),now:options.now,enqueue:options.enqueueImport}),importAudience:(id:string)=>{const row=reader.get('SELECT account_id FROM wallet_import_batches WHERE id=?',id);return row?audience([row.account_id],'account'):new Set<string>();},preferences:createWalletPreferences({reader,write:gateway.withAppWriteTransaction,now:options.now}),fx,reports,templates:createWalletTemplates({reader,write:gateway.withAppWriteTransaction,now:options.now}), catalogCommands:createWalletCatalog({reader,write:gateway.withAppWriteTransaction,now:options.now}),catalogAudience:()=>new Set(candidates().map(actor=>actor.userId)),selections:createWalletSelections({reader,write:gateway.withAppWriteTransaction,now:options.now}),bulk:createWalletBulk({reader,write:gateway.withAppWriteTransaction,now:options.now}),filterOptions:(actor:Actor)=>readWalletFilterOptions(reader,actor), receipts:createWalletReceipts({reader,write:gateway.withAppWriteTransaction,files:createReceiptFiles({dataRoot:appConfig.dataRoot}),now:options.now}), catalog:(actor:Actor)=>readWalletCatalog(reader,actor), storageVersion, assertActor: (actor: Actor) => { assertWalletActor(reader, actor); }, active() { const version = storageVersion(); return version>=3&&walletStorageVersions.includes(version) && reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value === '1' && (version < 4 || !reader.get("SELECT 1 AS blocked FROM wallet_legacy_runs WHERE status!='ready' LIMIT 1")); }, access, accounts: createWalletAccounts({ reader, write: gateway.withAppWriteTransaction, now: options.now }), records: createWalletRecords({ reader, write: gateway.withAppWriteTransaction, now: options.now }), queries, read: createWalletReads(reader), accountAudience: (id: string) => audience([id], 'account'), recordAudience(id: string) { const fee = reader.get('SELECT fee_record_id AS id FROM wallet_transfer_fees WHERE transfer_record_id=?', id); return audience(fee ? [id, fee.id] : [id], 'record'); } };
}
export type WalletPorts = ReturnType<typeof createWalletPorts>;
