import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {UserRole} from '../../src/types.js';
import {withAppWriteTransaction,markSnapshotReadResult} from '../appStore.js';
import {sqliteConnection,sqliteLoad} from '../sqlite.js';
import {openWalletStore} from './store.js';
import {prepareWalletSchema} from './schema.js';
import {exportWalletSnapshot,restoreWalletSnapshot,walletSnapshotChecksum} from './snapshot.js';
const meta=()=>({actorId:'user_admin',command:'wallet:synthetic:snapshot',requestId:randomUUID(),payloadHash:'synthetic'}),store=openWalletStore({write:withAppWriteTransaction});
const setup=()=>withAppWriteTransaction(meta(),tx=>{prepareWalletSchema(tx);if(!tx.legacy.users.some(user=>user.id==='user_admin'))tx.legacy.users.push({id:'user_admin',username:'synthetic-wallet-admin',fullName:'Synthetic Wallet admin',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'bg-sky-500',createdAt:'2026-10-14T00:00:00Z'});for(const table of ['wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+table);});
const seed=()=>store.transaction(meta(),tx=>{tx.accounts.insert({id:'synthetic-snapshot-account',name:'Synthetic snapshot account',type:'bank',currency:'VND',ownerUserId:'user_admin',accessMode:'private',openingMinor:'9223372036854775807',openingDate:'2026-10-14',revision:1});tx.records.insert({id:'synthetic-snapshot-record',kind:'expense',effectiveDate:'2026-10-14',timezone:'Asia/Saigon',source:'manual',note:'Synthetic snapshot record',settlementStatus:'cleared',creatorId:'user_admin',revision:1});tx.postings.insert({recordId:'synthetic-snapshot-record',accountId:'synthetic-snapshot-account',deltaMinor:'-9223372036854775808'});});
const snapshot=()=>store.transaction(meta(),tx=>exportWalletSnapshot(tx,markSnapshotReadResult));
it('snapshot protocol2 serializes exact signed64 money strings and does not cache full snapshot bytes as a command result',()=>{
 setup();seed();const saved=snapshot();expect(saved.schemaVersion).toBe(2);expect(saved.tables.wallet_accounts[0].opening_minor).toBe('9223372036854775807');expect(saved.tables.wallet_postings[0].delta_minor).toBe('-9223372036854775808');expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);expect(saved.checksum).toBe(walletSnapshotChecksum(saved));const row=sqliteConnection().prepare('SELECT result FROM app_commands ORDER BY rowid DESC LIMIT 1').get() as {result:string};expect(JSON.parse(row.result)).toEqual({snapshotRead:true});
});
it('restores Wallet and legacy changes in one shared transaction and preserves exact amounts and IDs',()=>{
 setup();seed();const saved=snapshot();store.transaction(meta(),tx=>tx.sql.run('DELETE FROM wallet_postings'));store.transaction(meta(),tx=>{tx.legacy.shoppingItems.push({id:'synthetic-wallet-restore-item',name:'Synthetic restore',quantity:'1 piece',isPurchased:false,creatorId:'user_admin',createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z'});restoreWalletSnapshot(tx,saved);});expect(snapshot()).toEqual(saved);expect(sqliteLoad().shoppingItems.some(row=>row.id==='synthetic-wallet-restore-item')).toBe(true);expect(sqliteConnection().prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it.each(['future','checksum','foreign-account','unsafe-money','unknown-table'])('rejects %s before any Wallet or legacy mutation',kind=>{
 setup();seed();const saved=snapshot(),bad=structuredClone(saved);if(kind==='future')bad.schemaVersion=4;else if(kind==='checksum')bad.checksum='0'.repeat(64);else if(kind==='foreign-account')bad.tables.wallet_postings[0].account_id='missing-account';else if(kind==='unsafe-money')bad.tables.wallet_postings[0].delta_minor=Number.MAX_SAFE_INTEGER+1 as any;else bad.tables.wallet_unrecognized=[];if(kind!=='checksum')bad.checksum=walletSnapshotChecksum(bad);const before=sqliteLoad(),changes=sqliteConnection().prepare('SELECT total_changes() AS n').get();expect(()=>store.transaction(meta(),tx=>restoreWalletSnapshot(tx,bad))).toThrow();expect(sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(changes);expect(sqliteLoad()).toEqual(before);expect(snapshot()).toEqual(saved);
});

it('restores a valid category graph independently of alphabetical parent/child ID order',()=>{
 setup();seed();store.transaction(meta(),tx=>{tx.sql.run("INSERT INTO wallet_categories VALUES('z-synthetic-parent',NULL,'Synthetic parent','unspecified',NULL)");tx.sql.run("INSERT INTO wallet_categories VALUES('a-synthetic-child','z-synthetic-parent','Synthetic child','need',NULL)");});const saved=snapshot();store.transaction(meta(),tx=>restoreWalletSnapshot(tx,saved));expect(snapshot()).toEqual(saved);expect(sqliteConnection().prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it.each(['','   '])('an accepted optional note %j survives snapshot export and atomic restore',note=>{
 setup();seed();store.transaction(meta(),tx=>tx.records.insert({id:'synthetic-empty-note-record',kind:'income',effectiveDate:'2026-10-14',timezone:'Asia/Saigon',source:'manual',note,settlementStatus:'uncleared',creatorId:'user_admin',revision:1}));
 const saved=snapshot();expect(saved.tables.wallet_records.find(row=>row.id==='synthetic-empty-note-record')!.note).toBe(note);store.transaction(meta(),tx=>restoreWalletSnapshot(tx,saved));expect(snapshot()).toEqual(saved);store.transaction(meta(),tx=>{expect(tx.records.get('synthetic-empty-note-record')!.note).toBe(note);});
});

it.each(['record-creator','audit-actor','category-cycle'])('rejects valid-checksum %s provenance before any SQLite or legacy changes',kind=>{
 setup();seed();const saved=snapshot(),bad=structuredClone(saved);
 if(kind==='record-creator')bad.tables.wallet_records[0].creator_id='synthetic-unknown-creator';
 if(kind==='audit-actor')bad.tables.wallet_audit.push({id:'synthetic-unknown-actor-audit',record_id:'synthetic-snapshot-record',actor_id:'synthetic-unknown-actor',action:'Synthetic audit'});
 if(kind==='category-cycle')bad.tables.wallet_categories.push({id:'synthetic-cycle-a',parent_id:'synthetic-cycle-b',name:'Synthetic cycle A',nature:'need',archived_at:null},{id:'synthetic-cycle-b',parent_id:'synthetic-cycle-a',name:'Synthetic cycle B',nature:'want',archived_at:null});
 bad.checksum=walletSnapshotChecksum(bad);const before=sqliteLoad(),changes=sqliteConnection().prepare('SELECT total_changes()AS n').get();
 expect(()=>store.transaction(meta(),tx=>restoreWalletSnapshot(tx,bad))).toThrow();
 expect(sqliteConnection().prepare('SELECT total_changes()AS n').get()).toEqual(changes);expect(sqliteLoad()).toEqual(before);expect(snapshot()).toEqual(saved);
});

it('retains known historical creator and audit IDs when a user is now deleted or has a restricted role',()=>{
 setup();seed();store.transaction(meta(),tx=>{tx.sql.run("INSERT INTO wallet_audit VALUES('synthetic-known-audit','synthetic-snapshot-record','user_admin','Synthetic historical write')");const user=tx.legacy.users.find(user=>user.id==='user_admin')!;user.role=UserRole.CHILD;user.isDeleted=true;});const saved=snapshot();store.transaction(meta(),tx=>restoreWalletSnapshot(tx,saved));expect(snapshot()).toEqual(saved);
});
it('accepts a deep valid category graph without changing amounts or requiring parent-first IDs',()=>{
 setup();seed();store.transaction(meta(),tx=>{for(let i=11999;i>=0;i--)tx.sql.run('INSERT INTO wallet_categories VALUES(?,?,?,?,?)','synthetic-deep-'+i,i===11999?null:'synthetic-deep-'+(i+1),'Synthetic deep category '+i,'unspecified',null);});const saved=snapshot();expect(saved.tables.wallet_categories).toHaveLength(12000);store.transaction(meta(),tx=>restoreWalletSnapshot(tx,saved));expect(snapshot()).toEqual(saved);expect(saved.tables.wallet_postings[0].delta_minor).toBe('-9223372036854775808');
});
it.each(['creator','audit-actor'])('does not export an unrestorable snapshot with an unknown stored %s',kind=>{
 setup();seed();store.transaction(meta(),tx=>{if(kind==='creator')tx.sql.run("UPDATE wallet_records SET creator_id='synthetic-orphan-creator'");else tx.sql.run("INSERT INTO wallet_audit VALUES('synthetic-orphan-audit','synthetic-snapshot-record','synthetic-orphan-actor','Synthetic audit')");});const changes=sqliteConnection().prepare('SELECT total_changes()AS n').get(),before=sqliteLoad();expect(()=>snapshot()).toThrow();expect(sqliteConnection().prepare('SELECT total_changes()AS n').get()).toEqual(changes);expect(sqliteLoad()).toEqual(before);
});
