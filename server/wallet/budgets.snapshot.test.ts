import {it,expect} from 'vitest';
import {walletBudgetFixture as fixture,budgetPeriod as period,budgetMoney as money} from '../../tests/wallet-budget-fixture.js';
import {owner,ctx,meta} from '../../tests/wallet-schedule-fixture.js';
import {withAppWriteTransaction,markSnapshotReadResult} from '../appStore.js';
import {sqliteLoad} from '../sqlite.js';
import {openWalletStore} from './store.js';
import {exportWalletSnapshot,validate,walletSnapshotChecksum} from './snapshot.js';
const capture=()=>openWalletStore({write:withAppWriteTransaction}).transaction(meta(),tx=>exportWalletSnapshot(tx,markSnapshotReadResult)),users=()=>new Set(sqliteLoad().users.map(v=>v.id));
it('explicit schema14 standalone15 retains exact personal budget policy and an immutable signed carry without changing older snapshots',()=>{
 const f=fixture(),budget=f.service.saveBudget(ctx(),{draft:f.budgetDraft({carryPolicy:'signed'})});f.records.createRecord(ctx(),{kind:'expense',accountId:f.cash,money:money('1200000'),effectiveDate:'2027-01-15',timezone:period.timezone,note:'Synthetic signed carry overspend'});f.setTime('2027-02-02T02:00:00.000Z');const carry=f.service.carryBudget(ctx(1),budget.id,period,{...period,fromDate:'2027-02-01',toDateExclusive:'2027-03-01'}),value=capture();expect(carry.money).toEqual(money('-200000'));expect(value.schemaVersion).toBe(15);expect(value.tables.wallet_budget_carries).toMatchObject([{id:carry.id,amount_minor:'-200000'}]);expect(()=>validate(value,users())).not.toThrow();
});
it.each(['money','owner','policy','audit','carry-money','carry-month'] as const)('rejects rewritten budget snapshot %s even after its transport checksum is recomputed',kind=>{
 const f=fixture(),budget=f.budget();f.setTime('2027-02-02T02:00:00.000Z');f.service.carryBudget(ctx(1),budget.id,period,{...period,fromDate:'2027-02-01',toDateExclusive:'2027-03-01'});const value=structuredClone(capture()),row=value.tables.wallet_budgets[0],carry=value.tables.wallet_budget_carries[0];if(kind==='money')row.limit_minor='999999';if(kind==='owner')row.owner_id=owner('other').userId;if(kind==='policy')row.policy_revision=2;if(kind==='audit')value.tables.wallet_audit.find(v=>v.action==='wallet:budget:save')!.actor_id=owner('other').userId;if(kind==='carry-money')carry.amount_minor='1';if(kind==='carry-month')carry.from_date='2027-03-01';value.checksum=walletSnapshotChecksum(value);expect(()=>validate(value,users())).toThrow();
});
