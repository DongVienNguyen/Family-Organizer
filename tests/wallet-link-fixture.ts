import {setup,owner,reader,write} from './wallet-schedule-fixture.js';
import {createWalletLinks} from '../server/wallet/links.js';
import {prepareWalletLinks} from '../server/wallet/linkSchema.js';
export const date='2027-01-31',timezone='Asia/Ho_Chi_Minh',money=(minor:string)=>({minor,currency:'VND'});
export function walletLinkFixture(){
 if(reader.get("SELECT 1 FROM sqlite_master WHERE name='wallet_financial_links'"))write(tx=>tx.run('DELETE FROM wallet_financial_links'));
 const f=setup();write(tx=>{prepareWalletLinks(tx);tx.legacy.debts=[{id:'synthetic-debt',direction:'borrowed',counterparty:'Synthetic lender',amount:1000000,isSettled:false,creatorId:owner().userId,payments:[],createdAt:'2027-01-01T00:00:00.000Z',updatedAt:'2027-01-01T00:00:00.000Z'}];tx.legacy.savingsGoals=[{id:'synthetic-goal',name:'Synthetic private goal',targetAmount:500000,isShared:false,creatorId:owner().userId,contributions:[],createdAt:'2027-01-01T00:00:00.000Z',updatedAt:'2027-01-01T00:00:00.000Z'}];});
 const service=createWalletLinks(f.ports),hash=(kind:'debts'|'goals')=>service.targets(owner())[kind][0].parentHash;
 return {...f,service,hash,debt:(extra:any={})=>({parentHash:hash('debts'),principal:money('100000'),interest:money('10000'),accountId:f.cash,date,timezone,note:'Synthetic debt payment',...extra}),goal:(extra:any={})=>({parentHash:hash('goals'),mode:'allocation',money:money('100000'),fromAccountId:f.cash,date,timezone,note:'Synthetic goal contribution',strict:true,...extra})};
}
