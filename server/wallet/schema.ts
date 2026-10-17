export {prepareWalletSelections,walletSelectionSql,walletSelectionChecksum} from './selectionSchema.js';
export {prepareWalletReceipts,walletReceiptSql,walletReceiptChecksum} from './receiptSchema.js';
import type {AppWriteTx} from '../appStore.js';
import {createHash} from 'node:crypto';
export {prepareWalletMetadata,walletMetadataSql,walletMetadataChecksum} from './metadataSchema.js';
export {prepareWalletFinancial,walletFinancialSql,walletFinancialChecksum} from './financialSchema.js';
export {prepareWalletLegacyMigration,walletLegacyMigrationSql,walletLegacyMigrationChecksum} from './legacyMigrationSchema.js';
/** Trusted explicit pilot DDL. Imports never open/register another connection. */
export const walletCoreSql=`
CREATE TABLE IF NOT EXISTS wallet_currencies(code TEXT PRIMARY KEY,exponent INTEGER NOT NULL CHECK(exponent BETWEEN 0 AND 8));
INSERT OR IGNORE INTO wallet_currencies VALUES('VND',0),('USD',2);
CREATE TABLE IF NOT EXISTS wallet_accounts(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN('cash','bank','savings','credit','e_wallet','investment','asset','liability')),
 currency TEXT NOT NULL REFERENCES wallet_currencies(code),owner_user_id TEXT NOT NULL,access_mode TEXT NOT NULL CHECK(access_mode IN('shared','private')),
 opening_minor INTEGER NOT NULL CHECK(typeof(opening_minor)='integer'),opening_date TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),archived_at TEXT);
CREATE TABLE IF NOT EXISTS wallet_account_grants(account_id TEXT NOT NULL REFERENCES wallet_accounts(id),user_id TEXT NOT NULL,permission TEXT NOT NULL CHECK(permission IN('read','contribute','manage')),PRIMARY KEY(account_id,user_id));
CREATE TABLE IF NOT EXISTS wallet_categories(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES wallet_categories(id) DEFERRABLE INITIALLY DEFERRED,name TEXT NOT NULL,nature TEXT NOT NULL CHECK(nature IN('must','need','want','unspecified')),archived_at TEXT);
CREATE TABLE IF NOT EXISTS wallet_labels(id TEXT PRIMARY KEY,name TEXT NOT NULL,archived_at TEXT);
CREATE TABLE IF NOT EXISTS wallet_schedules(id TEXT PRIMARY KEY,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)));
CREATE TABLE IF NOT EXISTS wallet_occurrences(id TEXT PRIMARY KEY,schedule_id TEXT NOT NULL REFERENCES wallet_schedules(id),due_date TEXT NOT NULL,UNIQUE(schedule_id,due_date));
CREATE TABLE IF NOT EXISTS wallet_records(
 id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('income','expense','transfer','adjustment','trade')),effective_date TEXT NOT NULL,timezone TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source IN('manual','import','schedule','legacy')),external_key TEXT,note TEXT NOT NULL,
 settlement_status TEXT NOT NULL CHECK(settlement_status IN('uncleared','cleared','reconciled','voided')),creator_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),
 category_id TEXT REFERENCES wallet_categories(id),occurrence_id TEXT UNIQUE REFERENCES wallet_occurrences(id),UNIQUE(id,effective_date));
CREATE UNIQUE INDEX IF NOT EXISTS wallet_record_external_key ON wallet_records(source,external_key) WHERE external_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS wallet_postings(record_id TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES wallet_accounts(id),effective_date TEXT NOT NULL,delta_minor INTEGER NOT NULL CHECK(typeof(delta_minor)='integer'),PRIMARY KEY(record_id,account_id),FOREIGN KEY(record_id,effective_date) REFERENCES wallet_records(id,effective_date));
CREATE INDEX IF NOT EXISTS wallet_posting_account_date ON wallet_postings(account_id,effective_date,record_id);
CREATE TABLE IF NOT EXISTS wallet_record_labels(record_id TEXT NOT NULL REFERENCES wallet_records(id),label_id TEXT NOT NULL REFERENCES wallet_labels(id),PRIMARY KEY(record_id,label_id));
CREATE TABLE IF NOT EXISTS wallet_allocations(record_id TEXT NOT NULL REFERENCES wallet_records(id),category_id TEXT NOT NULL REFERENCES wallet_categories(id),amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>=0),PRIMARY KEY(record_id,category_id));
CREATE TABLE IF NOT EXISTS wallet_audit(id TEXT PRIMARY KEY,record_id TEXT REFERENCES wallet_records(id),actor_id TEXT NOT NULL,action TEXT NOT NULL);
`;
export const walletCoreChecksum=createHash('sha256').update(walletCoreSql+'\nwallet-core-pilot-v1').digest('hex');
export function prepareWalletSchema(tx:AppWriteTx):void {tx.exec(walletCoreSql);}
