import { walletCoreColumns } from './coreColumns.js';
import { prepareWalletSchema, walletCoreSql, walletCoreChecksum } from './schema.js';
import { prepareWalletMetadata, walletMetadataSql, walletMetadataChecksum } from './metadataSchema.js';
import { walletMetadataColumns } from './metadata.js';
import { prepareWalletFinancial, walletFinancialSql, walletFinancialChecksum } from './financialSchema.js';
import { walletFinancialColumns } from './financial.js';
import { prepareWalletLegacyMigration, walletLegacyMigrationSql, walletLegacyMigrationChecksum, walletLegacyMigrationColumns } from './legacyMigrationSchema.js';
import { prepareWalletReceipts, walletReceiptSql, walletReceiptChecksum, walletReceiptColumns } from './receiptSchema.js';
import { prepareWalletSelections, walletSelectionSql, walletSelectionChecksum, walletSelectionColumns } from './selectionSchema.js';
/** One additive descriptor chain for registration, cold inspection and snapshots.
 * Imports are pure; accepted SQL/checksum bytes1–5 stay unchanged. */
export const walletSchemas = [
    { version: 1, columns: walletCoreColumns, sql: walletCoreSql, checksum: walletCoreChecksum, prepare: prepareWalletSchema },
    { version: 2, columns: walletMetadataColumns, sql: walletMetadataSql, checksum: walletMetadataChecksum, prepare: prepareWalletMetadata },
    { version: 3, columns: walletFinancialColumns, sql: walletFinancialSql, checksum: walletFinancialChecksum, prepare: prepareWalletFinancial },
    { version: 4, columns: walletLegacyMigrationColumns, sql: walletLegacyMigrationSql, checksum: walletLegacyMigrationChecksum, prepare: prepareWalletLegacyMigration },
    { version: 5, columns: walletReceiptColumns, sql: walletReceiptSql, checksum: walletReceiptChecksum, prepare: prepareWalletReceipts },
    { version: 6, columns: walletSelectionColumns, sql: walletSelectionSql, checksum: walletSelectionChecksum, prepare: prepareWalletSelections },
] as const;
export type WalletStorageVersion = typeof walletSchemas[number]['version'];
export const walletStorageVersions: number[] = walletSchemas.map(row => row.version);
export const latestWalletStorageVersion = walletSchemas.at(-1)!.version;
export function walletTableDefinitions(version: number): Record<string, readonly string[]> {
    if (!walletStorageVersions.includes(version))
        throw Error('Unsupported Wallet storage version');
    return Object.fromEntries(walletSchemas.filter(row => row.version <= version).flatMap(row => Object.entries(row.columns)));
}
