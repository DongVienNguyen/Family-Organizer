import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import {minorInteger} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
export const walletFxCacheSql=`
CREATE TABLE IF NOT EXISTS wallet_fx_rates(from_currency TEXT NOT NULL CHECK(from_currency='USD'),to_currency TEXT NOT NULL CHECK(to_currency='VND'),as_of TEXT NOT NULL,numerator TEXT NOT NULL,denominator TEXT NOT NULL,source TEXT NOT NULL CHECK(source='frankfurter-v2-blended'),fetched_at TEXT NOT NULL,PRIMARY KEY(from_currency,to_currency,as_of));
`;
export const walletFxCacheColumns={wallet_fx_rates:['from_currency','to_currency','as_of','numerator','denominator','source','fetched_at']} as const;
export const walletFxCacheChecksum=createHash('sha256').update(walletFxCacheSql+'\nwallet-dated-public-fx-cache-v8').digest('hex');
export function prepareWalletFxCache(tx:AppWriteTx):void {tx.exec(walletFxCacheSql);}
export function validateWalletFxCache(tables:Record<string,Record<string,any>[]>):void {
 for(const r of tables.wallet_fx_rates??[]){if(r.from_currency!=='USD'||r.to_currency!=='VND'||r.source!=='frankfurter-v2-blended'||minorInteger(r.numerator)<=0n||minorInteger(r.denominator)<=0n)throw Error('Invalid cached FX ratio/pair');parseEffectiveDate(r.as_of);if(typeof r.fetched_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.fetched_at)||new Date(r.fetched_at).toISOString()!==r.fetched_at||r.fetched_at.slice(0,10)<r.as_of)throw Error('Invalid cached FX chronology');}
}
