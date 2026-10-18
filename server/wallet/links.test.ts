import {it,expect} from 'vitest';
import {planDebtPayment,planGoalContribution} from './linksPlan.js';
const money=(minor:string,currency='VND')=>({minor,currency});
const common={date:'2026-10-18',timezone:'Asia/Ho_Chi_Minh',note:'Synthetic linked cashflow'};
const debt=(extra:any={})=>({direction:'borrowed',principal:money('100000'),interest:money('10000'),accountId:'synthetic-cash',...common,...extra});
const goal=(extra:any={})=>({mode:'allocation',money:money('100000'),fromAccountId:'synthetic-cash',...common,...extra});
it('borrowed principal reduces liability without becoming consumption; interest is a separate expense',()=>{
 const plan=planDebtPayment(debt());expect(plan.cashDelta).toEqual(money('-110000'));expect(plan.total).toEqual(money('110000'));expect(plan.records).toHaveLength(2);
 expect(plan.records[0]).toMatchObject({role:'principal',draft:{kind:'transfer',fromAccountId:'synthetic-cash',toAccountId:null,debit:money('100000'),credit:money('100000')}});
 expect(plan.records[1]).toMatchObject({role:'interest',draft:{kind:'expense',accountId:'synthetic-cash',money:money('10000')}});
});
it('lent repayment reduces receivable without fictitious principal income, and earned interest is income',()=>{
 const plan=planDebtPayment(debt({direction:'lent'}));expect(plan.cashDelta).toEqual(money('110000'));expect(plan.records[0]).toMatchObject({role:'principal',draft:{kind:'transfer',fromAccountId:null,toAccountId:'synthetic-cash'}});expect(plan.records[1]).toMatchObject({role:'interest',draft:{kind:'income',money:money('10000')}});
});
it('an explicitly mapped liability or receivable account is the other transfer leg',()=>{
 expect(planDebtPayment(debt({counterAccountId:'synthetic-liability'})).records[0].draft).toMatchObject({fromAccountId:'synthetic-cash',toAccountId:'synthetic-liability'});
 expect(planDebtPayment(debt({direction:'lent',counterAccountId:'synthetic-receivable'})).records[0].draft).toMatchObject({fromAccountId:'synthetic-receivable',toAccountId:'synthetic-cash'});
});
it('preserves amounts beyond Number precision and does not create a zero-valued interest record',()=>{
 const plan=planDebtPayment(debt({principal:money('9007199254740993'),interest:money('0')}));expect(plan.cashDelta).toEqual(money('-9007199254740993'));expect(plan.records).toHaveLength(1);expect(plan.records[0].draft).toMatchObject({debit:money('9007199254740993')});
 expect(planDebtPayment(debt({principal:money('0')})).records).toMatchObject([{role:'interest',draft:{kind:'expense'}}]);
});
it.each([{principal:money('-1')},{principal:money('0'),interest:money('0')},{principal:money('9223372036854775807'),interest:money('1')},{interest:money('1','USD')},{direction:'bank'},{counterAccountId:'synthetic-cash'},{source:'import'},{date:'2026-02-30'},{timezone:'Invalid/Zone'}])('rejects invalid debt cashflow %j before any command is planned',patch=>expect(()=>planDebtPayment(debt(patch))).toThrow());
it('goal allocation only earmarks an existing balance and creates no income, asset or posting',()=>{
 const plan=planGoalContribution(goal(),{strict:true,available:money('150000'),allocated:money('50000')});expect(plan).toMatchObject({mode:'allocation',money:money('100000'),cashDelta:money('0'),record:null,remainingAvailable:money('0')});
});
it('strict allocation uses available minus existing earmarks and cannot spend the same available money twice',()=>{
 expect(()=>planGoalContribution(goal(),{strict:true,available:money('150000'),allocated:money('50001')})).toThrow();expect(()=>planGoalContribution(goal(),{strict:true,available:money('150000','USD'),allocated:money('0')})).toThrow();
 const plan=planGoalContribution(goal(),{strict:false,available:money('0'),allocated:money('0')});expect(plan.remainingAvailable).toEqual(money('-100000'));expect(plan.overallocated).toBe(true);
});
it('a goal transfer conserves funds across the two accounts and never creates another income',()=>{
 const plan=planGoalContribution(goal({mode:'transfer',toAccountId:'synthetic-savings'}),{strict:true,available:money('200000'),allocated:money('0')});expect(plan.record).toMatchObject({kind:'transfer',fromAccountId:'synthetic-cash',toAccountId:'synthetic-savings',debit:money('100000'),credit:money('100000')});expect(plan.cashDelta).toEqual(money('-100000'));
});
it.each([{money:money('0')},{money:money('-1')},{mode:'transfer'},{mode:'transfer',toAccountId:'synthetic-cash'},{mode:'allocation',toAccountId:'synthetic-savings'},{ownerId:'other'}])('rejects malformed goal flow %j',patch=>expect(()=>planGoalContribution(goal(patch),{strict:true,available:money('1000000'),allocated:money('0')})).toThrow());
