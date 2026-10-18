import { createHash } from 'node:crypto';
import type { FamilyOrganizerDB } from '../../src/types.js';
import { mediaPath } from '../mediaPolicy.js';
import type { WalletReader } from './access.js';
/** Case-fold on every host: a backup produced in Cloud must also protect case
 * aliases of the same old receipt after Windows restore. This is a deny marker,
 * never a permission or a file lookup key. */
export function legacyReceiptPathDigest(url: string): string {
    return createHash('sha256').update(mediaPath(url).toLowerCase()).digest('hex');
}
/** Cutover protects former financial media before generic avatar/note/uploader
 * bindings can authorize it. Conversion retains the path digest durably even if
 * a later legacy projection no longer carries the original public URL. */
export function blocksLegacyWalletReceipt(reader: Pick<WalletReader, 'get'>, url: string, legacy: Pick<FamilyOrganizerDB, 'transactions'>): boolean {
    if (reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value !== '1')
        return false;
    const digest = legacyReceiptPathDigest(url);
    for (const transaction of legacy.transactions ?? []) {
        if (typeof transaction.receiptImage !== 'string' || !transaction.receiptImage.startsWith('/uploads/'))
            continue;
        try {
            if (legacyReceiptPathDigest(transaction.receiptImage) === digest)
                return true;
        }
        catch { /* An invalid legacy reference grants no managed-file authority. */ }
    }
    if (!reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_legacy_links'"))
        return false;
    return !!reader.get("SELECT 1 AS present FROM wallet_legacy_links WHERE source_kind='record' AND json_extract(detail_json,'$.legacyMediaPathDigest')=? LIMIT 1", digest);
}
