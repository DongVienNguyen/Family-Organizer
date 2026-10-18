import {walletBudgetFixture} from './wallet-budget-fixture.js';
import {reader,write,ctx,owner} from './wallet-schedule-fixture.js';
import {prepareWalletInvestments} from '../server/wallet/investmentSchema.js';
import {createWalletInvestments} from '../server/wallet/investments.js';
import {UserRole} from '../src/types.js';
export function walletInvestmentFixture(){
 if(reader.get("SELECT 1 FROM sqlite_master WHERE name='wallet_instruments'"))write(tx=>{for(const table of ['wallet_investment_trades','wallet_market_quotes','wallet_portfolios','wallet_instruments'])tx.run('DELETE FROM '+table);});
 const f=walletBudgetFixture();write(tx=>prepareWalletInvestments(tx));const service=createWalletInvestments(f.ports),account=f.accounts.createAccount(ctx(),{name:'Synthetic investment cash',type:'investment',currency:'VND',openingMinor:'10000',openingDate:'2027-01-01',accessMode:'private'}).account,instrument=service.saveInstrument(ctx(0,owner('admin',UserRole.ADMIN)),{exchange:'SYNTH',ticker:'TEST',name:'Synthetic fund',kind:'etf',currency:'VND',timezone:'Asia/Ho_Chi_Minh'}),draft=(patch:any={})=>({accountId:account.id,instrumentId:instrument.id,kind:'buy',quantity:'10',price:{minor:'100',currency:'VND'},fee:{minor:'10',currency:'VND'},date:'2027-01-15',timezone:'Asia/Ho_Chi_Minh',note:'Synthetic trade',accountRevision:1,portfolioRevision:0,...patch});return {...f,budgets:f.service,service,account,instrument,draft};
}
