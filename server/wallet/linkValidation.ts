import {createHash} from 'node:crypto';
import {text,integer,choice} from '../../src/features/productivity/validation.js';
import {utcInstant,timezoneFormatter} from '../../src/features/productivity/dates.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {assertMoney,minorInteger} from '../../src/features/wallet/money.js';
import type {Money} from '../../src/features/wallet/contracts.js';
import type {FamilyOrganizerDB,Debt,SavingsGoal} from '../../src/types.js';
import type {RecordDraft} from './records.js';
import {planDebtPayment,planGoalContribution} from './linksPlan.js';
type Row=Record<string,any>;
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const same=(a:Money,b:Money)=>a.currency===b.currency&&a.minor===b.minor;
const zero=(currency:string):Money=>({minor:'0',currency});
/** Validate the native graph without opening storage or replaying historical
 * financial commands. A kept annotation may outlive an edited ledger record. */
export function validateWalletLinkTables(tables:Record<string,Row[]>,users?:Set<string>){
 const accounts=new Map(tables.wallet_accounts.map(v=>[v.id,v])),records=new Map(tables.wallet_records.map(v=>[v.id,v])),postings=new Map<string,Row[]>(),feeChildren=new Set(tables.wallet_transfer_fees.map(v=>v.fee_record_id)),auditMeta=new Map(tables.wallet_audit_metadata.map(v=>[v.audit_id,v])),creators=new Map<string,{actor:string;action:string;after:Row}[]>(),activeRecords=new Set<string>();
 for(const posting of tables.wallet_postings){const values=postings.get(posting.record_id)??[];values.push(posting);postings.set(posting.record_id,values);}
 for(const audit of tables.wallet_audit){if(!['wallet:financial-link:create','wallet:financial-link:update','wallet:financial-link:unlink'].includes(audit.action))continue;const metadata=auditMeta.get(audit.id),after=metadata?.after_json===null?null:JSON.parse(metadata?.after_json??'null');if(!after||typeof after.id!=='string')throw Error('Invalid financial creation audit');const values=creators.get(after.id)??[];values.push({actor:audit.actor_id,action:audit.action,after});creators.set(after.id,values);}
 function match(id:string,draft:RecordDraft,state:string){
  const record=records.get(id);if(!record||feeChildren.has(id))throw Error('Invalid financial record reference');if(state==='voided'){if(record.settlement_status!=='voided')throw Error('Live record in voided financial link');return;}if(state!=='active')return;
  if(activeRecords.has(id))throw Error('Duplicate active financial cashflow');activeRecords.add(id);if(record.kind!==draft.kind||record.effective_date!==draft.effectiveDate||record.settlement_status==='voided'||record.occurrence_id!==null)throw Error('Invalid active financial record');
  const expected=new Map<string,string>();if(draft.kind==='transfer'){if(draft.fromAccountId)expected.set(draft.fromAccountId,(-minorInteger(draft.debit.minor)).toString());if(draft.toAccountId)expected.set(draft.toAccountId,draft.credit.minor);}else expected.set(draft.accountId,(minorInteger(draft.money.minor)*(draft.kind==='expense'?-1n:1n)).toString());
  const actual=postings.get(id)??[];if(actual.length!==expected.size||actual.some(p=>expected.get(p.account_id)!==p.delta_minor))throw Error('Financial link does not match canonical postings');
 }
 for(const row of tables.wallet_financial_links){
  text(row.id,256);text(row.parent_id,256);text(row.entry_id,256);text(row.owner_id,256);if(users&&!users.has(row.owner_id))throw Error('Unknown financial link owner');integer(row.revision,1);choice(row.kind,['debt','goal']);choice(row.state,['active','kept','voided']);choice(row.mode,['payment','allocation','transfer']);integer(row.strict,0,1);parseEffectiveDate(row.effective_date);timezoneFormatter(row.timezone);utcInstant(row.created_at);utcInstant(row.updated_at);if(row.updated_at<row.created_at)throw Error('Invalid financial chronology');
  const original=JSON.parse(row.plan_json),currency=row.currency,amount={minor:row.amount_minor,currency},interest={minor:row.interest_minor,currency};assertMoney(amount);assertMoney(interest);if(minorInteger(amount.minor)<0n||minorInteger(interest.minor)<0n||currency!=='VND')throw Error('Invalid financial link money');
  const events=creators.get(row.id)?.sort((a,b)=>a.after.revision-b.after.revision);if(!events||events.length!==row.revision||events[0].action!=='wallet:financial-link:create'||events[0].actor!==row.owner_id)throw Error('Missing financial creation audit');for(let index=0;index<events.length;index++){const event=events[index];if(event.after.revision!==index+1||event.after.kind!==row.kind||event.after.parentId!==row.parent_id||event.after.entryId!==row.entry_id||index>0&&(event.action==='wallet:financial-link:create'||events[index-1].after.state!=='active'))throw Error('Financial audit sequence mismatch');}const receipt=events.at(-1)!;if(receipt.after.state!==row.state||receipt.after.planSha256!==hash(original)||receipt.after.recordId!==row.record_id||receipt.after.interestRecordId!==row.interest_record_id)throw Error('Financial current binding mismatch');
  const source=accounts.get(row.account_id);if(!source||source.currency!==currency)throw Error('Invalid financial source account');if(row.counter_account_id!==null){const counter=accounts.get(row.counter_account_id);if(!counter||counter.id===source.id||counter.currency!==currency)throw Error('Invalid financial counter account');}
  if(original.date!==row.effective_date||original.timezone!==row.timezone)throw Error('Financial date binding mismatch');
  let primary:RecordDraft|undefined,extra:RecordDraft|undefined;
  if(row.kind==='debt'){
   const plan=planDebtPayment(original);if(row.mode!=='payment'||row.strict!==0||!same(plan.principal,amount)||!same(plan.interest,interest)||original.accountId!==row.account_id||(original.counterAccountId??null)!==row.counter_account_id)throw Error('Debt plan binding mismatch');
   if(row.counter_account_id!==null&&accounts.get(row.counter_account_id)?.type!==(original.direction==='borrowed'?'liability':'asset'))throw Error('Invalid debt book account type');primary=plan.records.find(v=>v.role==='principal')?.draft;extra=plan.records.find(v=>v.role==='interest')?.draft;
  }else{
   const plan=planGoalContribution(original,{strict:false,available:zero(currency),allocated:zero(currency)});if(row.mode!==plan.mode||!same(plan.money,amount)||interest.minor!=='0'||original.fromAccountId!==row.account_id||(original.toAccountId??null)!==row.counter_account_id)throw Error('Goal plan binding mismatch');primary=plan.record??undefined;
  }
  if(Boolean(primary)!==(row.record_id!==null)||Boolean(extra)!==(row.interest_record_id!==null))throw Error('Financial record coverage mismatch');if(primary)match(row.record_id,primary,row.state);if(extra)match(row.interest_record_id,extra,row.state);
 }
}
/** Shared backups must preserve the exact link between the native graph and
 * legacy history. Standalone Wallet snapshots do not contain that history. */
export function validateWalletLinkLegacy(tables:Record<string,Row[]>,legacy:FamilyOrganizerDB){
 const rows=new Map(tables.wallet_financial_links.map(row=>[row.id,row])),parents={debt:new Map(legacy.debts.map(v=>[v.id,v])),goal:new Map(legacy.savingsGoals.map(v=>[v.id,v]))},boundRecords=new Set<string>();
 function entries(kind:'debt'|'goal',target:Debt|SavingsGoal){return kind==='debt'?(target as Debt).payments:(target as SavingsGoal).contributions;}
 for(const row of rows.values()){
  const target=row.kind==='debt'?parents.debt.get(row.parent_id):parents.goal.get(row.parent_id),matches=target?entries(row.kind,target).filter(v=>v.id===row.entry_id):[],entry=matches[0];if(matches.length>1)throw Error('Ambiguous financial history identity');
  if(row.state==='voided'){if(entry)throw Error('Voided financial entry remains in legacy history');continue;}
  if(!target||!entry){if(row.state==='active')throw Error('Missing active financial history');continue;}
  assertMoney(entry.amount);if(entry.walletLinkId!==row.id||entry.amount.minor!==row.amount_minor||entry.amount.currency!==row.currency||entry.date!==row.effective_date)throw Error('Financial history binding mismatch');
  for(const id of [row.record_id,row.interest_record_id].filter(Boolean)){if(boundRecords.has(id))throw Error('A cashflow is counted by multiple live histories');boundRecords.add(id);}
 }
 for(const [kind,list]of [['debt',legacy.debts],['goal',legacy.savingsGoals]] as const)for(const target of list)for(const entry of entries(kind,target))if(entry.walletLinkId){const row=rows.get(entry.walletLinkId);if(!row||row.kind!==kind||row.parent_id!==target.id||row.entry_id!==entry.id||row.state==='voided')throw Error('Unknown financial history source');}
}
