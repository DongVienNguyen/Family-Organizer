import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
export const walletBudgetSql=`
CREATE TABLE IF NOT EXISTS wallet_budgets(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),policy_revision INTEGER NOT NULL CHECK(typeof(policy_revision)='integer' AND policy_revision>=1 AND policy_revision<=revision),
 limit_minor INTEGER NOT NULL CHECK(typeof(limit_minor)='integer' AND limit_minor>0),currency TEXT NOT NULL REFERENCES wallet_currencies(code),draft_json TEXT NOT NULL CHECK(json_valid(draft_json) AND json_type(draft_json)='object'),archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_budget_owner ON wallet_budgets(owner_id,archived_at,id);
CREATE TABLE IF NOT EXISTS wallet_budget_carries(
 id TEXT PRIMARY KEY,budget_id TEXT NOT NULL REFERENCES wallet_budgets(id),from_date TEXT NOT NULL,to_date TEXT NOT NULL,timezone TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer'),currency TEXT NOT NULL REFERENCES wallet_currencies(code),source_revision INTEGER NOT NULL CHECK(typeof(source_revision)='integer' AND source_revision>=1),policy_revision INTEGER NOT NULL CHECK(typeof(policy_revision)='integer' AND policy_revision>=1),result_json TEXT NOT NULL CHECK(json_valid(result_json) AND json_type(result_json)='object'),created_at TEXT NOT NULL,created_by TEXT NOT NULL,
 UNIQUE(budget_id,from_date,to_date,timezone));
CREATE INDEX IF NOT EXISTS wallet_budget_carry_destination ON wallet_budget_carries(budget_id,to_date,timezone);
CREATE TABLE IF NOT EXISTS wallet_budget_alert_claims(
 id TEXT PRIMARY KEY,budget_id TEXT NOT NULL REFERENCES wallet_budgets(id),period_from TEXT NOT NULL,timezone TEXT NOT NULL,threshold INTEGER NOT NULL CHECK(typeof(threshold)='integer' AND threshold BETWEEN 1 AND 100),recipient_id TEXT NOT NULL,policy_revision INTEGER NOT NULL CHECK(typeof(policy_revision)='integer' AND policy_revision>=1),job_id TEXT NOT NULL UNIQUE,claim_json TEXT NOT NULL CHECK(json_valid(claim_json) AND json_type(claim_json)='object'),created_at TEXT NOT NULL,
 UNIQUE(budget_id,period_from,timezone,threshold,recipient_id,policy_revision));
`;
export const walletBudgetColumns={wallet_budgets:['id','owner_id','name','revision','policy_revision','limit_minor','currency','draft_json','archived_at','created_at','updated_at'],wallet_budget_carries:['id','budget_id','from_date','to_date','timezone','amount_minor','currency','source_revision','policy_revision','result_json','created_at','created_by'],wallet_budget_alert_claims:['id','budget_id','period_from','timezone','threshold','recipient_id','policy_revision','job_id','claim_json','created_at']} as const;
export const walletBudgetChecksum=createHash('sha256').update(walletBudgetSql+'\nwallet-budgets-carry-and-alert-policy-v14').digest('hex');
export function prepareWalletBudgets(tx:AppWriteTx){tx.exec(walletBudgetSql);}
