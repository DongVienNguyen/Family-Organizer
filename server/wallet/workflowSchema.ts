import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import {recordDraftValue} from '../../src/features/wallet/recordDraftValue.js';
import {allocationRows,assertAllocationTotal} from '../../src/features/wallet/allocations.js';
export const walletWorkflowSql=`
CREATE TABLE IF NOT EXISTS wallet_templates(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,draft_json TEXT NOT NULL CHECK(json_valid(draft_json) AND json_type(draft_json)='object'),archived_at TEXT,revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,created_by TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_template_owner ON wallet_templates(owner_id,archived_at,id);
`;
export const walletWorkflowColumns={wallet_templates:['id','owner_id','name','draft_json','archived_at','revision','created_at','updated_at','created_by','updated_by']} as const;
export const walletWorkflowChecksum=createHash('sha256').update(walletWorkflowSql+'\nwallet-owned-templates-and-exact-splits-v7').digest('hex');
type Row=Record<string,any>;
/** Versions1-6 retain their accepted historical backup contract. Version7
 * explicitly refuses inconsistent splits, rather than rewriting financial data. */
export function validateWalletWorkflowTables(tables:Record<string,Row[]>,userIds?:Set<string>):void {
 const records=new Map(tables.wallet_records.map(row=>[row.id,row])),postings=new Map<string,{deltaMinor:string}[]>(),splits=new Map<string,unknown[]>();
 for(const row of tables.wallet_postings){const entries=postings.get(row.record_id)??[];entries.push({deltaMinor:row.delta_minor});postings.set(row.record_id,entries);}
 for(const row of tables.wallet_allocations){const entries=splits.get(row.record_id)??[];entries.push({categoryId:row.category_id,amountMinor:row.amount_minor});splits.set(row.record_id,entries);}
 for(const [id,raw] of splits){const record=records.get(id);if(!record)throw Error('Unknown split record');assertAllocationTotal(allocationRows(raw),{kind:record.kind},postings.get(id)??[]);}
 const accounts=new Map(tables.wallet_accounts.map(row=>[row.id,row])),categories=new Set(tables.wallet_categories.map(row=>row.id)),labels=new Set(tables.wallet_labels.map(row=>row.id));
 const time=(raw:unknown)=>{if(typeof raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw)||!Number.isFinite(Date.parse(raw))||new Date(raw).toISOString()!==raw)throw Error('Invalid template time');return Date.parse(raw);};
 for(const row of tables.wallet_templates??[]){const input=recordDraftValue(JSON.parse(row.draft_json));if(userIds&&!userIds.has(row.owner_id)||row.created_by!==row.owner_id||row.updated_by!==row.owner_id)throw Error('Invalid template owner');const created=time(row.created_at),updated=time(row.updated_at);if(updated<created||row.archived_at!==null&&time(row.archived_at)<created)throw Error('Invalid template chronology');
  const account=(id:string,money:{currency:string})=>{if(accounts.get(id)?.currency!==money.currency)throw Error('Invalid template account reference');},category=(id:string|null|undefined)=>{if(id&&!categories.has(id))throw Error('Invalid template category reference');};
  category(input.categoryId);for(const row of input.allocations??[])category(row.categoryId);for(const id of input.labelIds??[])if(!labels.has(id))throw Error('Invalid template label reference');
  if(input.kind==='transfer'){if(input.fromAccountId)account(input.fromAccountId,input.debit);if(input.toAccountId)account(input.toAccountId,input.credit);if(input.fee){account(input.fee.accountId,input.fee.money);category(input.fee.categoryId);}}
  else account(input.accountId,input.money);
 }
}
export function prepareWalletWorkflow(tx:AppWriteTx):void {
 validateWalletWorkflowTables({wallet_records:tx.all('SELECT id,kind FROM wallet_records'),wallet_postings:tx.all('SELECT record_id,CAST(delta_minor AS TEXT) AS delta_minor FROM wallet_postings'),wallet_allocations:tx.all('SELECT record_id,category_id,CAST(amount_minor AS TEXT) AS amount_minor FROM wallet_allocations'),wallet_accounts:[],wallet_categories:[],wallet_labels:[],wallet_templates:[]});
 tx.exec(walletWorkflowSql);
}
