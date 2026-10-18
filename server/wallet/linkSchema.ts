import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
export const walletLinkSql=`
CREATE TABLE IF NOT EXISTS wallet_financial_links(
 id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('debt','goal')),parent_id TEXT NOT NULL,entry_id TEXT NOT NULL,owner_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),state TEXT NOT NULL CHECK(state IN('active','kept','voided')),
 mode TEXT NOT NULL CHECK(mode IN('payment','allocation','transfer')),amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>=0),interest_minor INTEGER NOT NULL CHECK(typeof(interest_minor)='integer' AND interest_minor>=0),currency TEXT NOT NULL REFERENCES wallet_currencies(code),
 account_id TEXT NOT NULL REFERENCES wallet_accounts(id),counter_account_id TEXT REFERENCES wallet_accounts(id),record_id TEXT REFERENCES wallet_records(id),interest_record_id TEXT REFERENCES wallet_records(id),
 plan_json TEXT NOT NULL CHECK(json_valid(plan_json) AND json_type(plan_json)='object'),strict INTEGER NOT NULL CHECK(strict IN(0,1)),effective_date TEXT NOT NULL,timezone TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(kind,parent_id,entry_id));
CREATE INDEX IF NOT EXISTS wallet_financial_parent ON wallet_financial_links(kind,parent_id,state,id);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_financial_active_record ON wallet_financial_links(record_id) WHERE state='active' AND record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_financial_active_interest ON wallet_financial_links(interest_record_id) WHERE state='active' AND interest_record_id IS NOT NULL;
`;
export const walletLinkColumns={wallet_financial_links:['id','kind','parent_id','entry_id','owner_id','revision','state','mode','amount_minor','interest_minor','currency','account_id','counter_account_id','record_id','interest_record_id','plan_json','strict','effective_date','timezone','created_at','updated_at']} as const;
export const walletLinkChecksum=createHash('sha256').update(walletLinkSql+'\nwallet-debt-goal-links-v13').digest('hex');
export function prepareWalletLinks(tx:AppWriteTx){tx.exec(walletLinkSql);}
