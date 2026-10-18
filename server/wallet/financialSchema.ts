import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
/** Immutable transaction FX and explicit fee ownership; no live quote service. */
export const walletFinancialSql=`
CREATE TABLE IF NOT EXISTS wallet_record_fx(record_id TEXT PRIMARY KEY REFERENCES wallet_records(id),from_currency TEXT NOT NULL REFERENCES wallet_currencies(code),to_currency TEXT NOT NULL REFERENCES wallet_currencies(code),debit_minor INTEGER NOT NULL CHECK(typeof(debit_minor)='integer' AND debit_minor>0),credit_minor INTEGER NOT NULL CHECK(typeof(credit_minor)='integer' AND credit_minor>0),rate_numerator TEXT NOT NULL,rate_denominator TEXT NOT NULL,as_of TEXT NOT NULL,source TEXT NOT NULL,CHECK(from_currency!=to_currency));
CREATE TABLE IF NOT EXISTS wallet_transfer_fees(transfer_record_id TEXT PRIMARY KEY REFERENCES wallet_records(id),fee_record_id TEXT NOT NULL UNIQUE REFERENCES wallet_records(id),CHECK(transfer_record_id!=fee_record_id));
`;
export const walletFinancialChecksum=createHash('sha256').update(walletFinancialSql+'\nwallet-financial-relations-v3').digest('hex');
export function prepareWalletFinancial(tx:AppWriteTx):void {tx.exec(walletFinancialSql);}
