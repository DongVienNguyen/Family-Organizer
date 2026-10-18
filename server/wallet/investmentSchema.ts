import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
export const walletInvestmentSql=`
CREATE TABLE IF NOT EXISTS wallet_instruments(
 id TEXT PRIMARY KEY,exchange TEXT NOT NULL,ticker TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('stock','etf')),currency TEXT NOT NULL REFERENCES wallet_currencies(code),timezone TEXT NOT NULL,revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(exchange,ticker));
CREATE TABLE IF NOT EXISTS wallet_portfolios(
 account_id TEXT PRIMARY KEY REFERENCES wallet_accounts(id),revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),next_sequence INTEGER NOT NULL CHECK(typeof(next_sequence)='integer' AND next_sequence>=2),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wallet_investment_trades(
 id TEXT PRIMARY KEY REFERENCES wallet_records(id),account_id TEXT NOT NULL REFERENCES wallet_accounts(id),instrument_id TEXT NOT NULL REFERENCES wallet_instruments(id),revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence>=1),side TEXT NOT NULL CHECK(side IN('buy','sell')),quantity_units INTEGER NOT NULL CHECK(typeof(quantity_units)='integer' AND quantity_units>0),price_minor INTEGER NOT NULL CHECK(typeof(price_minor)='integer' AND price_minor>0),fee_minor INTEGER NOT NULL CHECK(typeof(fee_minor)='integer' AND fee_minor>=0),currency TEXT NOT NULL REFERENCES wallet_currencies(code),effective_date TEXT NOT NULL,timezone TEXT NOT NULL,note TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('active','voided')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(account_id,sequence));
CREATE INDEX IF NOT EXISTS wallet_investment_position ON wallet_investment_trades(account_id,instrument_id,effective_date,sequence);
CREATE INDEX IF NOT EXISTS wallet_investment_source_fence ON wallet_postings(account_id,record_id);
CREATE TABLE IF NOT EXISTS wallet_market_quotes(
 sequence INTEGER PRIMARY KEY CHECK(typeof(sequence)='integer' AND sequence>=1),id TEXT NOT NULL UNIQUE,instrument_id TEXT NOT NULL REFERENCES wallet_instruments(id),as_of TEXT NOT NULL,price_minor INTEGER NOT NULL CHECK(typeof(price_minor)='integer' AND price_minor>0),currency TEXT NOT NULL REFERENCES wallet_currencies(code),source TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('manual','closing')),fetched_at TEXT NOT NULL,created_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_market_quote_lookup ON wallet_market_quotes(instrument_id,as_of,sequence);
`;
export const walletInvestmentColumns={wallet_instruments:['id','exchange','ticker','name','kind','currency','timezone','revision','archived_at','created_at','updated_at'],wallet_portfolios:['account_id','revision','next_sequence','created_at','updated_at'],wallet_investment_trades:['id','account_id','instrument_id','revision','sequence','side','quantity_units','price_minor','fee_minor','currency','effective_date','timezone','note','state','created_by','created_at','updated_at'],wallet_market_quotes:['sequence','id','instrument_id','as_of','price_minor','currency','source','kind','fetched_at','created_by']} as const;
export const walletInvestmentChecksum=createHash('sha256').update(walletInvestmentSql+'\nwallet-investments-quotes-average-cost-v15').digest('hex');
export function prepareWalletInvestments(tx:AppWriteTx){tx.exec(walletInvestmentSql);}
