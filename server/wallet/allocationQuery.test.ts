import {createWalletQueries} from './query.js';
import {walletSchemas} from './schemaRegistry.js';
import {walletMetadataRepositories} from './metadata.js';
import {walletSnapshotChecksum,validate} from './snapshot.js';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as records from './records.js';
import {createWalletAccounts} from './accounts.js';
import {UserRole,type User} from '../../src/types.js';
import {withAppWriteTransaction,markSnapshotReadResult} from '../appStore.js';
import {sqliteConnection,sqliteLoad} from '../sqlite.js';
import {prepareWalletSchema,prepareWalletMetadata,prepareWalletFinancial} from './schema.js';
import {openWalletStore} from './store.js';
import {exportWalletSnapshot,restoreWalletSnapshot} from './snapshot.js';
const actor=(id='owner',role:UserRole=UserRole.MEMBER)=>({userId:'synthetic-record-'+id,role});
const meta=()=>({actorId:actor().userId,command:'wallet:synthetic:record-test',requestId:randomUUID(),payloadHash:'synthetic'}),write=<T>(fn:Parameters<typeof withAppWriteTransaction<T>>[1])=>withAppWriteTransaction(meta(),fn);
const reader={get:(sql:string,...args:any[]):any=>sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqliteConnection().prepare(sql).all(...args)};
const ctx=(expectedRevision?:number,who=actor())=>({actor:who,idempotencyKey:randomUUID(),...(expectedRevision===undefined?{}:{expectedRevision})});
const money=(minor:string,currency='VND')=>({minor,currency});
const common={effectiveDate:'2026-10-17',timezone:'Asia/Saigon',note:'Synthetic record',payee:'Synthetic payee',paymentMethod:'Synthetic method',occurredAt:null,settlementStatus:'cleared' as const};
let clockCalls=0;
function setup(){
 write(tx=>{prepareWalletSchema(tx);prepareWalletMetadata(tx);prepareWalletFinancial(tx);for(const name of ['wallet_transfer_fees','wallet_record_fx','wallet_audit_metadata','wallet_label_metadata','wallet_category_metadata','wallet_record_metadata','wallet_account_metadata','wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+name);tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','1')");tx.legacy.users=['owner','other','read','contribute','manage','child','admin'].map(id=>({id:actor(id).userId,role:id==='child'?UserRole.CHILD:id==='admin'?UserRole.ADMIN:UserRole.MEMBER,username:'synthetic-record-'+id,fullName:'Synthetic record '+id,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-17T00:00:00.000Z'} as User&{passwordHash:string}));});
 const accounts=createWalletAccounts({reader,write:withAppWriteTransaction,now:()=>Date.parse('2026-10-17T01:00:00.000Z')}),make=(name:string,currency:string,openingMinor:string)=>accounts.createAccount(ctx(),{name,type:'bank',currency,openingMinor,openingDate:'2026-10-17',accessMode:'private'}).account.id;
 const cash=make('Synthetic cash','VND','1000000'),bank=make('Synthetic bank','VND','2000000'),usd=make('Synthetic USD','USD','10000');clockCalls=0;
 write(tx=>{for(const entry of walletSchemas.filter(row=>row.version>3&&row.version<=7))entry.prepare(tx);});
 const service=records.createWalletRecords({reader,write:withAppWriteTransaction,now:()=>{clockCalls++;return Date.parse('2026-10-17T02:00:00.000Z');}});
 const single=(kind:'income'|'expense'|'adjustment',minor:string,accountId=cash,currency='VND')=>({...common,kind,accountId,money:money(minor,currency)});
 const transfer=()=>({...common,kind:'transfer' as const,fromAccountId:cash,toAccountId:bank,debit:money('300000'),credit:money('300000')});
 return {accounts,cash,bank,usd,service,single,transfer};
}
function categories(){write(tx=>{for(const id of ['one','two','parent','other']){tx.run('INSERT INTO wallet_categories VALUES(?,NULL,?,?,NULL)','synthetic-split-'+id,'Synthetic split '+id,'need');walletMetadataRepositories(tx).categories.set({categoryId:'synthetic-split-'+id,revision:1,hidden:false,icon:'',color:'',createdAt:null,updatedAt:null,createdBy:null,updatedBy:null});}});}
const rows=()=>[{categoryId:'synthetic-split-one',amountMinor:'60000'},{categoryId:'synthetic-split-two',amountMinor:'40000'}];
const filter=(categoryIds?:string[])=>({period:{fromDate:'2026-10-01',toDateExclusive:'2026-11-01',timezone:'Asia/Saigon'},referenceCurrency:'VND',...(categoryIds?{categoryIds}:{})});
it('category filters and durable selection match split children once and no longer count an unrelated parent category',()=>{const f=setup();categories();write(tx=>tx.run("UPDATE wallet_categories SET parent_id='synthetic-split-parent' WHERE id='synthetic-split-one'"));const saved=f.service.createRecord(ctx(),{...f.single('expense','100000'),categoryId:'synthetic-split-other'});f.service.setAllocations(ctx(1),saved.record.id,rows());const q=createWalletQueries({reader});for(const ids of [['synthetic-split-one'],['synthetic-split-two'],['synthetic-split-parent'],['synthetic-split-one','synthetic-split-two']]){const page=q.listRecords(actor(),filter(ids),null,100);expect(page.total).toBe(1);expect(page.items.map(row=>row.record.id)).toEqual([saved.record.id]);expect(page.items[0].postings[0].deltaMinor).toBe('-100000');expect(q.captureSelection(actor(),filter(ids)).entries).toEqual([{id:saved.record.id,revision:2}]);expect(page.items[0]).not.toHaveProperty('allocationCategoryIds');}expect(q.listRecords(actor(),filter(['synthetic-split-other']),null,100).total).toBe(0);f.service.setAllocations(ctx(2),saved.record.id,[]);expect(q.listRecords(actor(),filter(['synthetic-split-one']),null,100).total).toBe(0);expect(q.listRecords(actor(),filter(['synthetic-split-other']),null,100).total).toBe(1);});
it('private split category associations never create matches after current account access is revoked',()=>{const f=setup();categories();const saved=f.service.createRecord(ctx(),f.single('expense','100000'));f.service.setAllocations(ctx(1),saved.record.id,rows());const q=createWalletQueries({reader});expect(q.listRecords(actor('read'),filter(['synthetic-split-one']),null,100).total).toBe(0);write(tx=>tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',f.cash,actor('read').userId,'read'));expect(q.listRecords(actor('read'),filter(['synthetic-split-one']),null,100).total).toBe(1);write(tx=>tx.run('DELETE FROM wallet_account_grants WHERE account_id=? AND user_id=?',f.cash,actor('read').userId));expect(q.captureSelection(actor('read'),filter(['synthetic-split-one'])).entries).toEqual([]);});
it('a split change invalidates a prior query cursor and cannot rebase it silently',()=>{const f=setup();categories();const a=f.service.createRecord(ctx(),f.single('expense','100000')),b=f.service.createRecord(ctx(),f.single('expense','100000')),q=createWalletQueries({reader});const first=q.listRecords(actor(),filter(),null,1);expect(first.total).toBe(2);expect(first.nextCursor).toBeTruthy();f.service.setAllocations(ctx(1),a.record.id,rows());expect(()=>q.listRecords(actor(),filter(),first.nextCursor,1)).toThrow(expect.objectContaining({status:409}));expect(q.listRecords(actor(),filter(),null,100).items.map(row=>row.record.id).sort()).toEqual([a.record.id,b.record.id].sort());});
