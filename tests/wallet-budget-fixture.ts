import {setup,owner,ctx,reader,write} from './wallet-schedule-fixture.js';
import {createWalletBudgets} from '../server/wallet/budgets.js';
import {prepareWalletBudgets} from '../server/wallet/budgetSchema.js';
import {prepareWalletLinks} from '../server/wallet/linkSchema.js';
export const budgetPeriod={fromDate:'2027-01-01',toDateExclusive:'2027-02-01',timezone:'Asia/Ho_Chi_Minh'},budgetMoney=(minor:string)=>({minor,currency:'VND'});
export function walletBudgetFixture(extra:Partial<Parameters<typeof createWalletBudgets>[0]>={}){
 if(reader.get("SELECT 1 FROM sqlite_master WHERE name='wallet_budgets'"))write(tx=>{for(const table of ['wallet_budget_alert_claims','wallet_budget_carries','wallet_budgets'])tx.run('DELETE FROM '+table);});if(reader.get("SELECT 1 FROM sqlite_master WHERE name='wallet_financial_links'"))write(tx=>tx.run('DELETE FROM wallet_financial_links'));
 const f=setup();write(tx=>{prepareWalletLinks(tx);prepareWalletBudgets(tx);});const service=createWalletBudgets({...f.ports,...extra}),draft=(patch:any={})=>({name:'Synthetic monthly budget',limit:budgetMoney('1000000'),filter:{accountIds:[f.cash]},timezone:budgetPeriod.timezone,carryPolicy:'positive',...patch});return {...f,schedules:f.service,service,budget:()=>service.saveBudget(ctx(),{draft:draft()}),budgetDraft:draft};
}
