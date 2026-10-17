import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as schema from './schema.js';
import {withAppWriteTransaction,markSnapshotReadResult} from '../appStore.js';
import {sqliteConnection,sqliteLoad,sqliteSave} from '../sqlite.js';
import {openWalletStore} from './store.js';
import {exportWalletSnapshot,restoreWalletSnapshot,walletSnapshotChecksum} from './snapshot.js';
import {UserRole} from '../../src/types.js';
const meta=()=>({actorId:'synthetic-metadata-owner',command:'wallet:synthetic:metadata',requestId:randomUUID(),payloadHash:'synthetic'});
const store=openWalletStore({write:withAppWriteTransaction});
const account={id:'synthetic-metadata-account',name:'Synthetic credit',type:'credit' as const,currency:'VND',ownerUserId:'synthetic-metadata-owner',accessMode:'private' as const,openingMinor:'-50',openingDate:'2026-10-17',revision:1};
const record={id:'synthetic-metadata-record',kind:'expense' as const,effectiveDate:'2026-10-17',timezone:'Asia/Saigon',source:'legacy' as const,note:'Synthetic only',settlementStatus:'cleared' as const,creatorId:'synthetic-metadata-owner',revision:1};
const provenance={createdAt:'2026-10-17T00:00:00.000Z',updatedAt:'2026-10-17T01:00:00.000Z',createdBy:meta().actorId,updatedBy:meta().actorId};
const accountMetadata={accountId:account.id,excludedFromStats:true,creditLimitMinor:'9223372036854775807',dueDay:31,balanceDisplay:'both' as const,...provenance};
const recordMetadata={recordId:record.id,occurredAt:null,payee:'Synthetic payee',paymentMethod:'Synthetic method',reviewedAt:'2026-10-17T01:00:00.000Z',...provenance};
function setup(upgrade=true){
 withAppWriteTransaction(meta(),tx=>{
  schema.prepareWalletSchema(tx);
  for(const name of ['wallet_audit_metadata','wallet_label_metadata','wallet_category_metadata','wallet_record_metadata','wallet_account_metadata'])tx.run('DROP TABLE IF EXISTS '+name);
  for(const name of ['wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+name);
  tx.legacy.users=[{id:meta().actorId,username:'synthetic-metadata',fullName:'Synthetic metadata',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:provenance.createdAt}];
 });
 store.transaction(meta(),tx=>{tx.accounts.insert(account);tx.records.insert(record);tx.postings.insert({recordId:record.id,accountId:account.id,deltaMinor:'-9223372036854775808'});tx.audit.append({id:'synthetic-metadata-audit',recordId:record.id,actorId:meta().actorId,action:'Synthetic audit'});tx.sql.run("INSERT INTO wallet_categories VALUES('synthetic-metadata-category',NULL,'Synthetic category','need',NULL)");tx.sql.run("INSERT INTO wallet_labels VALUES('synthetic-metadata-label','Synthetic label',NULL)");});
 if(upgrade)withAppWriteTransaction(meta(),tx=>schema.prepareWalletMetadata(tx));
}
const capture=()=>store.transaction(meta(),tx=>exportWalletSnapshot(tx,markSnapshotReadResult));
it('adds metadata without changing frozen core DDL, money, IDs or inventing historical time and actor',()=>{
 expect(schema).toHaveProperty('prepareWalletMetadata',expect.any(Function));setup(false);
 const before=capture();expect(before.schemaVersion).toBe(2);
 withAppWriteTransaction(meta(),tx=>schema.prepareWalletMetadata(tx));
 expect(schema.walletCoreChecksum).toBe('5386132badbf4a5fee4331cbf0a133bd2a106ed284f80ee479ff31df4bcb1e6a');
 store.transaction(meta(),tx=>{expect(tx.metadata.accounts.get(account.id)).toEqual({accountId:account.id,excludedFromStats:false,creditLimitMinor:null,dueDay:null,balanceDisplay:'book',createdAt:null,updatedAt:null,createdBy:null,updatedBy:null});expect(tx.metadata.records.get(record.id)).toEqual({recordId:record.id,occurredAt:null,payee:'',paymentMethod:'',reviewedAt:null,createdAt:null,updatedAt:null,createdBy:null,updatedBy:null});});
 const after=capture();expect(after.schemaVersion).toBe(3);for(const [name,rows]of Object.entries(before.tables))expect(after.tables[name]).toEqual(rows);
 withAppWriteTransaction(meta(),tx=>schema.prepareWalletMetadata(tx));expect(capture()).toEqual(after);
});
it('round-trips typed account and record metadata, exact credit limit and legacy save without erasing Wallet',()=>{
 setup();store.transaction(meta(),tx=>{tx.metadata.accounts.set(accountMetadata);tx.metadata.records.set(recordMetadata);expect(tx.metadata.accounts.get(account.id)).toEqual(accountMetadata);expect(tx.metadata.records.get(record.id)).toEqual(recordMetadata);});
 const saved=capture();expect(saved.tables.wallet_account_metadata[0].credit_limit_minor).toBe('9223372036854775807');sqliteSave(sqliteLoad());expect(capture()).toEqual(saved);
 store.transaction(meta(),tx=>{tx.metadata.accounts.set({...accountMetadata,creditLimitMinor:'0'});restoreWalletSnapshot(tx,saved);});expect(capture()).toEqual(saved);expect(sqliteConnection().prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it('creates empty historical metadata alongside new canonical rows after the explicit upgrade',()=>{
 setup();store.transaction(meta(),tx=>{tx.accounts.insert({...account,id:'synthetic-second-account'});tx.records.insert({...record,id:'synthetic-second-record'});tx.audit.append({id:'synthetic-second-audit',recordId:record.id,actorId:meta().actorId,action:'Synthetic second audit'});expect(tx.metadata.accounts.get('synthetic-second-account')!.createdAt).toBeNull();expect(tx.metadata.records.get('synthetic-second-record')!.occurredAt).toBeNull();expect(tx.metadata.audit.get('synthetic-second-audit')).toEqual({auditId:'synthetic-second-audit',occurredAt:null,before:null,after:null});});expect(capture().tables.wallet_record_metadata).toHaveLength(2);
});
it('stores catalog display metadata and structured audit before/after without a second writer',()=>{
 setup();const catalog={icon:'banknote',color:'slate',hidden:true,revision:2,...provenance};
 store.transaction(meta(),tx=>{tx.metadata.categories.set({categoryId:'synthetic-metadata-category',...catalog});tx.metadata.labels.set({labelId:'synthetic-metadata-label',...catalog});tx.metadata.audit.set({auditId:'synthetic-metadata-audit',occurredAt:provenance.updatedAt,before:{minor:'-50'},after:{minor:'-75'}});expect(tx.metadata.categories.get('synthetic-metadata-category')).toEqual({categoryId:'synthetic-metadata-category',...catalog});expect(tx.metadata.labels.get('synthetic-metadata-label')).toEqual({labelId:'synthetic-metadata-label',...catalog});expect(tx.metadata.audit.get('synthetic-metadata-audit')!.after).toEqual({minor:'-75'});});
 const saved=capture();store.transaction(meta(),tx=>restoreWalletSnapshot(tx,saved));expect(capture()).toEqual(saved);
});
it.each([
 ['overflow',{creditLimitMinor:'9223372036854775808'}],['negative',{creditLimitMinor:'-1'}],['fraction',{creditLimitMinor:'1.5'}],['unsafe-number',{creditLimitMinor:Number.MAX_SAFE_INTEGER+1}],['due-low',{dueDay:0}],['due-high',{dueDay:32}],['due-fraction',{dueDay:1.5}],['display',{balanceDisplay:'guess'}],['boolean',{excludedFromStats:1}],['unknown-actor',{updatedBy:'synthetic-missing-user'}],['invalid-time',{createdAt:'2026-02-30T00:00:00.000Z'}],['nonutc',{updatedAt:'2026-10-17T08:00:00+07:00'}],['backwards-time',{updatedAt:'2026-10-16T00:00:00.000Z'}],
] as const)('refuses invalid account metadata %s atomically',(_name,patch)=>{
 setup();const saved=capture(),before=sqliteLoad();expect(()=>store.transaction(meta(),tx=>{tx.legacy.notes.push({id:'synthetic-rolled-back-metadata'} as any);tx.metadata.accounts.set({...accountMetadata,...patch} as any);})).toThrow();expect(sqliteLoad()).toEqual(before);expect(capture()).toEqual(saved);
});
it('rejects orphan metadata and rolls back prior metadata and legacy writes in the same transaction',()=>{
 setup();const saved=capture(),before=sqliteLoad();expect(()=>store.transaction(meta(),tx=>{tx.metadata.accounts.set(accountMetadata);tx.legacy.notes.push({id:'synthetic-metadata-rollback'} as any);tx.metadata.records.set({...recordMetadata,recordId:'synthetic-missing-record'});})).toThrow();expect(capture()).toEqual(saved);expect(sqliteLoad()).toEqual(before);
});
it.each(['orphan','missing','unsafe-money','unknown-actor','bad-time','invalid-audit','bad-flag'])('rejects checksum-valid metadata %s before any SQL or legacy writes',kind=>{
 setup();const saved=capture(),bad=structuredClone(saved);if(kind==='orphan')bad.tables.wallet_record_metadata[0].record_id='synthetic-missing-record';if(kind==='missing')bad.tables.wallet_account_metadata=[];if(kind==='unsafe-money')bad.tables.wallet_account_metadata[0].credit_limit_minor=9007199254740992;if(kind==='unknown-actor')bad.tables.wallet_record_metadata[0].created_by='synthetic-missing-user';if(kind==='bad-time')bad.tables.wallet_record_metadata[0].occurred_at='2026-02-30T00:00:00.000Z';if(kind==='invalid-audit')bad.tables.wallet_audit_metadata[0].after_json='[]';if(kind==='bad-flag')bad.tables.wallet_category_metadata[0].hidden=2;
 bad.checksum=walletSnapshotChecksum(bad);const changes=sqliteConnection().prepare('SELECT total_changes() AS n').get(),legacy=sqliteLoad();expect(()=>store.transaction(meta(),tx=>restoreWalletSnapshot(tx,bad))).toThrow();expect(sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(changes);expect(sqliteLoad()).toEqual(legacy);expect(capture()).toEqual(saved);
});
it('refuses cross-version standalone restore before deleting any metadata',()=>{
 setup(false);const old=capture();withAppWriteTransaction(meta(),tx=>schema.prepareWalletMetadata(tx));const current=capture(),changes=sqliteConnection().prepare('SELECT total_changes() AS n').get();expect(()=>store.transaction(meta(),tx=>restoreWalletSnapshot(tx,old))).toThrow(/version/i);expect(sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(changes);expect(capture()).toEqual(current);
});
it.each(['partial-schema','unknown-table','unknown-actor','missing-row'])('refuses exporting unrestorable metadata %s instead of silently omitting it',kind=>{
 setup();store.transaction(meta(),tx=>{if(kind==='partial-schema')tx.sql.run('DROP TABLE wallet_account_metadata');if(kind==='unknown-table')tx.sql.run('CREATE TABLE wallet_synthetic_future(id TEXT)');if(kind==='unknown-actor')tx.sql.run("UPDATE wallet_account_metadata SET updated_by='synthetic-orphan-user'");if(kind==='missing-row')tx.sql.run('DELETE FROM wallet_record_metadata');});
 try{const changes=sqliteConnection().prepare('SELECT total_changes() AS n').get();expect(()=>capture()).toThrow();expect(sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(changes);}finally{if(kind==='unknown-table')store.transaction(meta(),tx=>tx.sql.run('DROP TABLE wallet_synthetic_future'));}
});
it('preserves known historical metadata actors after deletion or role restriction without granting live access',()=>{
 setup();store.transaction(meta(),tx=>{tx.metadata.accounts.set(accountMetadata);const user=tx.legacy.users[0];user.role=UserRole.CHILD;user.isDeleted=true;});const saved=capture();store.transaction(meta(),tx=>restoreWalletSnapshot(tx,saved));expect(capture()).toEqual(saved);
});
