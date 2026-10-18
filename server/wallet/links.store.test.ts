import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {setup,owner,ctx,reader,write,meta} from '../../tests/wallet-schedule-fixture.js';
import {withAppWriteTransaction} from '../appStore.js';
import {sqliteLoad,sqliteConnection} from '../sqlite.js';
import {openWalletStore} from './store.js';
import {createWalletLinks} from './links.js';
import {prepareWalletLinks} from './linkSchema.js';
import {FamilyDB} from '../db.js';
import {walletLinkFixture as fixture,date,timezone,money} from '../../tests/wallet-link-fixture.js';
it('a borrowed principal transfer and interest expense commit with one exact legacy payment and nonce receipt',()=>{
 const f=fixture(),context=ctx(),input=f.debt(),first=f.service.recordDebtPayment(context,'synthetic-debt',input);expect(first).toMatchObject({kind:'debt',state:'active',revision:1,money:money('100000'),interest:money('10000')});expect(f.service.recordDebtPayment(context,'synthetic-debt',input)).toEqual(first);expect(sqliteLoad().debts[0].payments).toMatchObject([{id:first.entryId,amount:money('100000'),walletLinkId:first.id}]);
 expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(2);expect(f.read.getRecord(owner(),first.recordId!).record.kind).toBe('transfer');expect(f.read.getRecord(owner(),first.interestRecordId!).record.kind).toBe('expense');expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(money('890000'));
 expect(()=>f.service.recordDebtPayment(ctx(),'synthetic-debt',input)).toThrow(expect.objectContaining({status:409}));expect(sqliteLoad().debts[0].payments).toHaveLength(1);
});
it('linking a combined imported repayment reclassifies principal and interest without another cash outflow',()=>{
 const f=fixture(),record=openWalletStore({write:withAppWriteTransaction}).transaction(meta(),tx=>f.records.createImportedWithin(tx,ctx(),{kind:'expense',accountId:f.cash,money:money('110000'),effectiveDate:date,timezone,note:'Synthetic imported repayment'},'synthetic-debt-import'));
 const before=f.accounts.getBookBalance(owner(),f.cash,date),linked=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({recordId:record.record.id,recordRevision:1}));expect(linked.recordId).toBe(record.record.id);expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(before);expect(f.read.getRecord(owner(),record.record.id).record).toMatchObject({kind:'transfer',source:'import',externalKey:'synthetic-debt-import',revision:2});expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(2);
});
it('an allocation is an exact earmark with no ledger entry and strict capacity cannot be reused',()=>{
 const f=fixture(),allocated=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal({money:money('600000')}));expect(allocated).toMatchObject({mode:'allocation',recordId:null,interestRecordId:null,money:money('600000')});expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(0);expect(sqliteLoad().savingsGoals[0].contributions).toMatchObject([{amount:money('600000'),walletLinkId:allocated.id}]);
 expect(()=>f.service.contributeGoal(ctx(),'synthetic-goal',f.goal({money:money('500000')}))).toThrow(expect.objectContaining({status:422}));expect(sqliteLoad().savingsGoals[0].contributions).toHaveLength(1);expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(money('1000000'));
});
it('a goal transfer conserves account net worth and linking the same transfer never moves money again',()=>{
 const f=fixture(),before=f.accounts.getBookBalance(owner(),f.cash,date),transfer=f.records.createRecord(ctx(),{kind:'transfer',fromAccountId:f.cash,toAccountId:f.bank,debit:money('200000'),credit:money('200000'),effectiveDate:date,timezone,note:'Synthetic existing goal transfer'}),cash=f.accounts.getBookBalance(owner(),f.cash,date);
 const link=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal({mode:'transfer',money:money('200000'),toAccountId:f.bank,recordId:transfer.record.id,recordRevision:1}));expect(link.recordId).toBe(transfer.record.id);expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(cash);expect(BigInt(cash.minor)+BigInt(f.accounts.getBookBalance(owner(),f.bank,date).minor)).toBe(BigInt(before.minor));expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(1);
});
it('an injected native failure leaves both the shared legacy history and Wallet ledger/nonce unchanged',()=>{
 const f=fixture(),before=sqliteLoad(),context=ctx();sqliteConnection().exec("CREATE TEMP TRIGGER synthetic_link_fault BEFORE INSERT ON wallet_records WHEN NEW.kind='expense' BEGIN SELECT RAISE(ABORT,'synthetic financial link failure');END");
 try{expect(()=>f.service.recordDebtPayment(context,'synthetic-debt',f.debt())).toThrow(/synthetic financial link failure/);expect(sqliteLoad()).toEqual(before);expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(0);expect(reader.get('SELECT count(*) AS n FROM wallet_financial_links').n).toBe(0);}finally{sqliteConnection().exec('DROP TRIGGER synthetic_link_fault');}
 expect(f.service.recordDebtPayment(context,'synthetic-debt',f.debt()).state).toBe('active');expect(sqliteLoad().debts[0].payments).toHaveLength(1);
});
it('private goals and revoked accounts deny financial links without exposing linked amounts or identifiers',()=>{
 const f=fixture(),link=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal());expect(f.service.targets(owner('other')).goals).toEqual([]);expect(()=>f.service.getLink(owner('other'),link.id)).toThrow(expect.objectContaining({status:404}));
 write(tx=>tx.run('UPDATE wallet_accounts SET owner_user_id=? WHERE id=?',owner('other').userId,f.cash));expect(()=>f.service.getLink(owner(),link.id)).toThrow(expect.objectContaining({status:404}));expect(f.service.projectGoals(owner(),sqliteLoad().savingsGoals)[0].contributions).toEqual([]);expect(()=>f.service.unlinkFinancialLink(ctx(1),link.id,{policy:'keep'})).toThrow(expect.objectContaining({status:404}));
});
it('unlink keep preserves cash and history while void reverses the cash and principal in one coordinated command',()=>{
 const f=fixture(),link=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt()),balance=f.accounts.getBookBalance(owner(),f.cash,date),key=randomUUID();expect(f.service.unlinkFinancialLink({...ctx(1),idempotencyKey:key},link.id,{policy:'keep'}).state).toBe('kept');expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(balance);expect(sqliteLoad().debts[0].payments).toHaveLength(1);
 const second=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt());expect(f.service.unlinkFinancialLink(ctx(1),second.id,{policy:'void'}).state).toBe('voided');expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(balance);expect(sqliteLoad().debts[0].payments).toHaveLength(1);expect(f.read.getRecord(owner(),second.recordId!).record.settlementStatus).toBe('voided');expect(f.read.getRecord(owner(),second.interestRecordId!).record.settlementStatus).toBe('voided');
});
it.each(['debt','goal'] as const)('explicitly links an existing legacy %s history row once regardless of Money key order',kind=>{
 const f=fixture(),entry={id:'synthetic-legacy-history',amount:100000,date,byId:owner().userId,createdAt:'2027-01-01T00:00:00.000Z'};write(tx=>{if(kind==='debt')tx.legacy.debts[0].payments.push(entry);else tx.legacy.savingsGoals[0].contributions.push(entry);});
 if(kind==='debt'){
  const old=f.records.createRecord(ctx(),{kind:'expense',accountId:f.cash,money:money('100000'),effectiveDate:date,timezone,note:'Synthetic historical payment'}),balance=f.accounts.getBookBalance(owner(),f.cash,date),link=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({principal:{currency:'VND',minor:'100000'},interest:money('0'),existingPaymentId:entry.id,recordId:old.record.id,recordRevision:1}));
  expect(link.entryId).toBe(entry.id);expect(sqliteLoad().debts[0].payments).toHaveLength(1);expect(f.service.targets(owner()).debts[0].remaining).toEqual(money('900000'));expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(balance);
 }else{
  const link=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal({money:{currency:'VND',minor:'100000'},existingContributionId:entry.id}));expect(link.entryId).toBe(entry.id);expect(sqliteLoad().savingsGoals[0].contributions).toHaveLength(1);expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(0);
 }
});
it('links an already recorded interest-only payment without creating a second expense',()=>{
 const f=fixture(),old=f.records.createRecord(ctx(),{kind:'expense',accountId:f.cash,money:money('10000'),effectiveDate:date,timezone,note:'Synthetic historical interest'}),balance=f.accounts.getBookBalance(owner(),f.cash,date),link=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({principal:money('0'),recordId:old.record.id,recordRevision:1}));expect(link).toMatchObject({recordId:null,interestRecordId:old.record.id});expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(balance);expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(1);expect(f.service.targets(owner()).debts[0].remaining).toEqual(money('1000000'));
});
it('does not silently discard existing category allocations when reclassifying an imported-style debt payment',()=>{
 const f=fixture();write(tx=>{tx.run("INSERT INTO wallet_categories VALUES('synthetic-debt-split',NULL,'Synthetic split','unspecified',NULL)");tx.run("INSERT INTO wallet_category_metadata(category_id) VALUES('synthetic-debt-split')");});
 const old=f.records.createRecord(ctx(),{kind:'expense',accountId:f.cash,money:money('110000'),effectiveDate:date,timezone,note:'Synthetic split payment',allocations:[{categoryId:'synthetic-debt-split',amountMinor:'110000'}]}),before=sqliteLoad(),balance=f.accounts.getBookBalance(owner(),f.cash,date);
 expect(()=>f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({recordId:old.record.id,recordRevision:1}))).toThrow(expect.objectContaining({status:409}));expect(sqliteLoad()).toEqual(before);expect(reader.get('SELECT CAST(amount_minor AS TEXT) AS minor FROM wallet_allocations WHERE record_id=?',old.record.id)).toEqual({minor:'110000'});expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(balance);
});
it('a goal contribution also retires when a linked transfer fee leg loses its account permission',()=>{
 const f=fixture(),fee=f.accounts.createAccount(ctx(),{name:'Synthetic private fee source',type:'cash',currency:'VND',openingMinor:'1000',openingDate:date,accessMode:'private'}).account.id,transfer=f.records.createRecord(ctx(),{kind:'transfer',fromAccountId:f.cash,toAccountId:f.bank,debit:money('100000'),credit:money('100000'),effectiveDate:date,timezone,note:'Synthetic goal fee',fee:{accountId:fee,money:money('1000')}}),link=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal({mode:'transfer',toAccountId:f.bank,recordId:transfer.record.id,recordRevision:1}));
 expect(f.service.getLink(owner(),link.id).id).toBe(link.id);write(tx=>tx.run('UPDATE wallet_accounts SET owner_user_id=? WHERE id=?',owner('other').userId,fee));expect(()=>f.service.getLink(owner(),link.id)).toThrow(expect.objectContaining({status:404}));expect(f.service.projectGoals(owner(),sqliteLoad().savingsGoals)[0].contributions).toEqual([]);
});
it('legacy delete/edit routes cannot detach active financial history or bypass the coordinated record guards',()=>{
 const f=fixture(),debt=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt()),goal=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal()),before=sqliteLoad();
 for(const action of [()=>FamilyDB.removeDebtPayment('synthetic-debt',debt.entryId),()=>FamilyDB.deleteDebt('synthetic-debt',owner().userId,'Synthetic'),()=>FamilyDB.saveDebt({...before.debts[0],amount:2000000},owner().userId,'Synthetic'),()=>FamilyDB.removeSavingsContribution('synthetic-goal',goal.entryId),()=>FamilyDB.deleteSavingsGoal('synthetic-goal',owner().userId,'Synthetic'),()=>f.records.updateRecord(ctx(1),debt.recordId!,{note:'ordinary bypass'}),()=>f.records.voidRecord(ctx(1),debt.recordId!)])expect(action).toThrow(expect.objectContaining({status:409}));
 expect(sqliteLoad()).toEqual(before);expect(f.service.getLink(owner(),debt.id).state).toBe('active');expect(f.service.getLink(owner(),goal.id).state).toBe('active');
});
it('an explicit debt book account stays reconciled and subsequent payments retain that binding',()=>{
 const f=fixture(),liability=f.accounts.createAccount(ctx(),{name:'Synthetic mapped liability',type:'liability',currency:'VND',openingMinor:'-1000000',openingDate:'2027-01-01',accessMode:'private'}).account.id;
 f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({counterAccountId:liability}));expect(f.accounts.getBookBalance(owner(),liability,date)).toEqual(money('-900000'));
 f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt());expect(f.accounts.getBookBalance(owner(),liability,date)).toEqual(money('-800000'));expect(f.service.targets(owner()).debts[0].remaining).toEqual(money('800000'));expect(BigInt(f.accounts.getBookBalance(owner(),f.cash,date).minor)+BigInt(f.accounts.getBookBalance(owner(),liability,date).minor)).toBe(-20000n);
});
it('does not invent a liability opening balance or accept an unreconciled book mapping',()=>{
 const f=fixture(),liability=f.accounts.createAccount(ctx(),{name:'Synthetic unreconciled liability',type:'liability',currency:'VND',openingMinor:'0',openingDate:'2027-01-01',accessMode:'private'}).account.id,before=sqliteLoad();
 expect(()=>f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({counterAccountId:liability}))).toThrow(expect.objectContaining({status:422}));expect(sqliteLoad()).toEqual(before);expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(0);expect(f.accounts.getBookBalance(owner(),liability,date)).toEqual(money('0'));
});
it('removing an explicitly detached allocation releases its reserved capacity without changing ledger money',()=>{
 const f=fixture(),link=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal());f.service.unlinkFinancialLink(ctx(1),link.id,{policy:'keep'});FamilyDB.removeSavingsContribution('synthetic-goal',link.entryId);expect(sqliteLoad().savingsGoals[0].contributions).toEqual([]);
 const replacement=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal({money:money('1000000')}));expect(replacement.money).toEqual(money('1000000'));expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(0);expect(f.accounts.getBookBalance(owner(),f.cash,date)).toEqual(money('1000000'));
});
it('a kept repayment history cannot reuse the same existing cashflow as a second principal payment',()=>{
 const f=fixture(),link=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({interest:money('0')}));f.service.unlinkFinancialLink(ctx(1),link.id,{policy:'keep'});const record=f.read.getRecord(owner(),link.recordId!),before=sqliteLoad();
 expect(()=>f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({interest:money('0'),recordId:record.record.id,recordRevision:record.record.revision}))).toThrow(expect.objectContaining({status:409}));expect(sqliteLoad()).toEqual(before);expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(1);
});
it('reclassifying an existing repayment preserves its original memo, payee and payment method',()=>{
 const f=fixture(),old=f.records.createRecord(ctx(),{kind:'expense',accountId:f.cash,money:money('110000'),effectiveDate:date,timezone,note:'SYNTHETIC_ORIGINAL_BANK_MEMO',payee:'Synthetic original lender',paymentMethod:'bank'}),link=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt({recordId:old.record.id,recordRevision:1,note:'Synthetic separate payment annotation'})),record=f.read.getRecord(owner(),link.recordId!);expect(record.record.note).toBe('SYNTHETIC_ORIGINAL_BANK_MEMO');expect(record.metadata).toMatchObject({payee:'Synthetic original lender',paymentMethod:'bank'});expect(sqliteLoad().debts[0].payments[0].note).toBe('Synthetic separate payment annotation');
});
