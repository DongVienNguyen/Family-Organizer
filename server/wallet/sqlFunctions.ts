import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { validateMetadata } from './metadata.js';
/** Explicit registration on the installation's existing connection. Pure text
 * metrics let a set-based bulk audit avoid materializing every note in JS. */
export function configureWalletSql(connection: Pick<Database.Database, 'function'>): void {
    connection.function('fo_wallet_valid_record_metadata', { deterministic: true, directOnly: true }, (value: unknown) => { try {
        if (typeof value !== 'string')
            return 0;
        validateMetadata('wallet_record_metadata', JSON.parse(value));
        return 1;
    }
    catch {
        return 0;
    } });
    connection.function('fo_wallet_uuid', { directOnly: true }, () => randomUUID());
    connection.function('fo_wallet_text_metrics', { deterministic: true, directOnly: true }, (value: unknown) => {
        if (typeof value !== 'string')
            throw Error('Wallet text metrics require text');
        return JSON.stringify({ length: value.length, sha256: createHash('sha256').update(value).digest('hex') });
    });
}
