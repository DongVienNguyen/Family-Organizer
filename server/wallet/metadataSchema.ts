import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
const provenance='created_at TEXT,updated_at TEXT,created_by TEXT,updated_by TEXT';
/** Additive pilot migration2. Migration1 and its accepted bytes stay immutable. */
export const walletMetadataSql=`
CREATE TABLE IF NOT EXISTS wallet_account_metadata(account_id TEXT PRIMARY KEY REFERENCES wallet_accounts(id),${provenance},excluded_from_stats INTEGER NOT NULL DEFAULT 0 CHECK(excluded_from_stats IN(0,1)),credit_limit_minor INTEGER CHECK(credit_limit_minor IS NULL OR (typeof(credit_limit_minor)='integer' AND credit_limit_minor>=0)),due_day INTEGER CHECK(due_day IS NULL OR (typeof(due_day)='integer' AND due_day BETWEEN 1 AND 31)),balance_display TEXT NOT NULL DEFAULT 'book' CHECK(balance_display IN('book','available','both')));
CREATE TABLE IF NOT EXISTS wallet_record_metadata(record_id TEXT PRIMARY KEY REFERENCES wallet_records(id),${provenance},occurred_at TEXT,payee TEXT NOT NULL DEFAULT '',payment_method TEXT NOT NULL DEFAULT '',reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS wallet_category_metadata(category_id TEXT PRIMARY KEY REFERENCES wallet_categories(id),${provenance},icon TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '',hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),revision INTEGER NOT NULL DEFAULT 1 CHECK(typeof(revision)='integer' AND revision>=1));
CREATE TABLE IF NOT EXISTS wallet_label_metadata(label_id TEXT PRIMARY KEY REFERENCES wallet_labels(id),${provenance},icon TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '',hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),revision INTEGER NOT NULL DEFAULT 1 CHECK(typeof(revision)='integer' AND revision>=1));
CREATE TABLE IF NOT EXISTS wallet_audit_metadata(audit_id TEXT PRIMARY KEY REFERENCES wallet_audit(id),occurred_at TEXT,before_json TEXT CHECK(before_json IS NULL OR (json_valid(before_json) AND json_type(before_json)='object')),after_json TEXT CHECK(after_json IS NULL OR (json_valid(after_json) AND json_type(after_json)='object')));
CREATE INDEX IF NOT EXISTS wallet_category_parent ON wallet_categories(parent_id,id);
`;
export const walletMetadataChecksum=createHash('sha256').update(walletMetadataSql+'\nwallet-core-metadata-v2').digest('hex');
export const walletMetadataParents={wallet_account_metadata:'wallet_accounts',wallet_record_metadata:'wallet_records',wallet_category_metadata:'wallet_categories',wallet_label_metadata:'wallet_labels',wallet_audit_metadata:'wallet_audit'} as const;
export function prepareWalletMetadata(tx:AppWriteTx):void {
 tx.exec(walletMetadataSql);
 for(const [name,parent]of Object.entries(walletMetadataParents))tx.run('INSERT OR IGNORE INTO '+name+'('+name.slice(7,-9)+'_id) SELECT id FROM '+parent);
}
