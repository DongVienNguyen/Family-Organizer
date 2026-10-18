import {it,expect} from 'vitest';
import {walletLinkFixture as fixture} from '../../tests/wallet-link-fixture.js';
import {owner,ctx,meta,write,reader} from '../../tests/wallet-schedule-fixture.js';
import {withAppWriteTransaction,markSnapshotReadResult} from '../appStore.js';
import {openWalletStore} from './store.js';
import {exportWalletSnapshot,validate,walletSnapshotChecksum} from './snapshot.js';
import {validateWalletLinkLegacy} from './linkValidation.js';
import {sqliteLoad} from '../sqlite.js';
const capture=()=>openWalletStore({write:withAppWriteTransaction}).transaction(meta(),tx=>exportWalletSnapshot(tx,markSnapshotReadResult));
const users=()=>new Set(sqliteLoad().users.map(v=>v.id));
it('explicit schema13 standalone14 snapshots retain exact debt and goal bindings with the shared histories',()=>{
 const f=fixture(),debt=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt()),goal=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal()),snapshot=capture();expect(snapshot.schemaVersion).toBe(14);expect(snapshot.tables.wallet_financial_links).toHaveLength(2);expect(snapshot.tables.wallet_financial_links.map(v=>v.id).sort()).toEqual([debt.id,goal.id].sort());expect(()=>validate(snapshot,users())).not.toThrow();expect(()=>validateWalletLinkLegacy(snapshot.tables,sqliteLoad())).not.toThrow();
});
it.each(['amount','posting','owner','parent','plan','record','audit'])('a recomputed checksum cannot conceal a broken active financial %s binding',kind=>{
 const f=fixture();f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt());const snapshot=structuredClone(capture()),row=snapshot.tables.wallet_financial_links[0];if(kind==='amount')row.amount_minor='100001';if(kind==='posting')snapshot.tables.wallet_postings.find(v=>v.record_id===row.record_id)!.delta_minor='-100001';if(kind==='owner')row.owner_id=owner('other').userId;if(kind==='parent')row.parent_id='other-parent';if(kind==='plan')row.plan_json=JSON.stringify({...JSON.parse(row.plan_json as string),principal:{minor:'99999',currency:'VND'}});if(kind==='record')row.record_id=row.interest_record_id;if(kind==='audit')snapshot.tables.wallet_audit.find(v=>v.action==='wallet:financial-link:create')!.actor_id=owner('other').userId;snapshot.checksum=walletSnapshotChecksum(snapshot);expect(()=>validate(snapshot,users())).toThrow();
});
it.each(['missing','amount','source','parent','voided'])('shared legacy validation rejects %s history divergence without restoring anything',kind=>{
 const f=fixture(),link=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal()),snapshot=capture(),legacy=structuredClone(sqliteLoad());if(kind==='missing')legacy.savingsGoals[0].contributions=[];if(kind==='amount')legacy.savingsGoals[0].contributions[0].amount={minor:'100001',currency:'VND'};if(kind==='source')legacy.savingsGoals[0].contributions[0].walletLinkId='unknown';if(kind==='parent')legacy.savingsGoals=[];if(kind==='voided')snapshot.tables.wallet_financial_links.find(v=>v.id===link.id)!.state='voided';expect(()=>validateWalletLinkLegacy(snapshot.tables,legacy)).toThrow();
});
it('kept annotations remain valid after their explicitly detached history is removed; voided entries cannot remain live',()=>{
 const f=fixture(),allocation=f.service.contributeGoal(ctx(),'synthetic-goal',f.goal());f.service.unlinkFinancialLink(ctx(1),allocation.id,{policy:'keep'});write(tx=>{tx.legacy.savingsGoals[0].contributions=[];});expect(()=>validate(capture(),users())).not.toThrow();expect(()=>validateWalletLinkLegacy(capture().tables,sqliteLoad())).not.toThrow();const debt=f.service.recordDebtPayment(ctx(),'synthetic-debt',f.debt());f.service.unlinkFinancialLink(ctx(1),debt.id,{policy:'void'});expect(()=>validate(capture(),users())).not.toThrow();expect(()=>validateWalletLinkLegacy(capture().tables,sqliteLoad())).not.toThrow();expect(reader.get('SELECT count(*) AS n FROM wallet_records').n).toBe(2);
});
