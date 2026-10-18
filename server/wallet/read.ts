import type { Actor } from '../../src/features/wallet/contracts.js';
import { minorInteger, assertMoney } from '../../src/features/wallet/money.js';
import { AppStoreError } from '../appErrors.js';
import { createWalletAccess, walletAccountReadScope, type WalletReader } from './access.js';
import { walletMetadataColumns, decodeMetadata, validateMetadata, type WalletRecordMetadata } from './metadata.js';
import { validateFx, type WalletFxSnapshot } from './financial.js';
import type { WalletRecordView } from './query.js';
export interface WalletRecordDetail extends WalletRecordView {
    fx: WalletFxSnapshot | null;
    feeRecordId: string | null;
}
/** Current record ACL before metadata/quote bodies; partial transfers never read
 * the hidden FX quote. A private fee is not disclosed by its parent association. */
export function createWalletReads(reader: WalletReader) {
    const access = createWalletAccess(reader);
    return { getRecord(actor: Actor, id: string): WalletRecordDetail {
            walletAccountReadScope(reader, actor);
            if (reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value !== '1')
                throw new AppStoreError('Wallet chưa sẵn sàng.', 409);
            const visible = access.getRecord(actor, id), columns = walletMetadataColumns.wallet_record_metadata, row = reader.get('SELECT ' + columns.map(column => visible.partial && ['payee', 'payment_method'].includes(column) ? "'' AS " + column : column).join(',') + ' FROM wallet_record_metadata WHERE record_id=?', id);
            if (!row)
                throw new AppStoreError('Dữ liệu giao dịch chưa sẵn sàng.', 409);
            const metadata = decodeMetadata('wallet_record_metadata', row) as unknown as WalletRecordMetadata;
            validateMetadata('wallet_record_metadata', metadata, new Set(reader.legacy ? reader.legacy.users.map(user => user.id) : reader.all('SELECT id FROM users').map(row => row.id)));
            const postings = visible.postings.map(posting => { const account = access.getAccount(actor, posting.accountId); assertMoney({ minor: posting.deltaMinor, currency: posting.currency }); return { ...posting, accountName: account.name }; });
            if (['income', 'expense'].includes(visible.record.kind) && (visible.partial || postings.length !== 1 || minorInteger(postings[0].deltaMinor) * (visible.record.kind === 'income' ? 1n : -1n) <= 0n))
                throw new AppStoreError('Dữ liệu giao dịch không hợp lệ.', 422);
            const fx: WalletFxSnapshot | null = visible.partial ? null : reader.get('SELECT record_id AS recordId,from_currency AS fromCurrency,to_currency AS toCurrency,CAST(debit_minor AS TEXT) AS debitMinor,CAST(credit_minor AS TEXT) AS creditMinor,rate_numerator AS numerator,rate_denominator AS denominator,as_of AS asOf,source FROM wallet_record_fx WHERE record_id=?', id) ?? null;
            if (fx)
                validateFx(fx);
            const scope = walletAccountReadScope(reader, actor), fee = reader.get("SELECT fee.fee_record_id AS id FROM wallet_transfer_fees fee WHERE fee.transfer_record_id=? AND EXISTS(SELECT 1 FROM wallet_postings p JOIN wallet_accounts a ON a.id=p.account_id WHERE p.record_id=fee.fee_record_id AND (" + scope.sql + ") IN('read','contribute','manage'))", id, ...scope.args);
            return { ...visible, metadata, postings, labelIds: visible.partial ? [] : reader.all('SELECT label_id AS id FROM wallet_record_labels WHERE record_id=? ORDER BY label_id', id).map(row => row.id), matchedAccountIds: postings.map(posting => posting.accountId), fx, feeRecordId: fee?.id ?? null };
        } };
}
