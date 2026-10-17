import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as conversion from './backupConversion.js';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {configureWalletStorage} from './integration.js';
import {walletTablesAt} from './snapshot.js';
import {openWalletStore} from './store.js';
import {checksum,type AppSnapshot} from '../snapshotValidation.js';
import {UserRole,TransactionType,AccountType} from '../../src/types.js';
const actor={userId:'synthetic-backup-conversion-admin',role:UserRole.ADMIN},at='2026-10-17T02:00:00.000Z';
const meta=()=>({actorId:actor.userId,command:'wallet:synthetic:backup-conversion',requestId:randomUUID(),payloadHash:'synthetic'}),write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction(meta(),fn),store=openWalletStore({write:gateway.withAppWriteTransaction});
const reader={get:(sql:string,...args:any[]):any=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[]):any[]=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const saved=new Map<number,AppSnapshot>();let initialized=false;
const capture=()=>write(tx=>snapshot.collectAppSnapshot(tx));
function setup(){
 if(!initialized){
  write(tx=>{tx.legacy.users=[{id:actor.userId,role:UserRole.ADMIN,username:'synthetic-backup-conversion-admin',fullName:'Synthetic converter',passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:at}];tx.legacy.transactions=[{id:'synthetic-original-source',type:TransactionType.EXPENSE,amount:123,category:'food',account:AccountType.CASH,description:'Synthetic original legacy collection',date:'2026-10-11',creatorId:actor.userId,createdAt:at}];tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','1')");});
  for(const version of [1,2,3,4] as const){configureWalletStorage({migrations,snapshot,version});migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});if(version===1)store.transaction(meta(),tx=>{tx.accounts.insert({id:'synthetic-old-native-account',name:'Synthetic old native account',type:'bank',currency:'VND',ownerUserId:actor.userId,accessMode:'private',openingMinor:'9223372036854775807',openingDate:'2026-10-11',revision:1});tx.records.insert({id:'synthetic-old-native-record',kind:'expense',effectiveDate:'2026-10-11',timezone:'Asia/Saigon',source:'manual',note:'Synthetic old native note',settlementStatus:'cleared',creatorId:actor.userId,revision:3});tx.postings.insert({recordId:'synthetic-old-native-record',accountId:'synthetic-old-native-account',deltaMinor:'-9223372036854775808'});});if(version===2)write(tx=>tx.run("UPDATE wallet_account_metadata SET credit_limit_minor=?,created_at=?,created_by=?",9007199254740993n,at,actor.userId));saved.set(version,capture());}initialized=true;
 }
 write(tx=>{for(const name of Object.keys(walletTablesAt(4)).reverse().filter(name=>name!=='wallet_currencies'))tx.run('DELETE FROM '+name);tx.run("UPDATE app_meta SET value='0' WHERE key='wallet_active'");});
}
const ports=()=>({installedVersion:migrations.getDomainVersions().wallet,migrations:reader.all("SELECT version,checksum,applied_at FROM app_migrations WHERE namespace='wallet' ORDER BY version"),inspectHistorical:snapshot.inspectHistoricalDomainSnapshot,validateTarget:snapshot.validateAppSnapshot});
it.each([1,2,3])('old native Wallet%s backup converts and restores through I01 while preserving legacy, UUID receipts and exact money',async version=>{
 setup();const source=saved.get(version)!,original=structuredClone(source),changes=reader.get('SELECT total_changes() AS n'),result=conversion.convertSharedWalletBackup(source,ports(),at);expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);expect(source).toEqual(original);expect(result.conversion).toMatchObject({fromVersion:version,toVersion:4,sourceChecksum:source.manifest.checksum,resultChecksum:result.snapshot.manifest.checksum,at,converted:true});expect(result.snapshot.manifest.domains).toEqual({...source.manifest.domains,wallet:4});expect(result.snapshot.tables.app_commands).toEqual(source.tables.app_commands);expect(result.snapshot.legacy).toEqual(source.legacy);expect(result.snapshot.media).toEqual(source.media);expect(result.snapshot.settings).toEqual(source.settings);expect(result.snapshot.tables.app_meta.find(row=>row.key==='wallet_active')?.value).toBe('0');expect(result.snapshot.tables.app_migrations.filter(row=>row.namespace==='wallet').map(row=>row.version)).toEqual([1,2,3,4]);await snapshot.restoreAppSnapshot(result.snapshot,{maintenance:async fn=>fn()});const after=capture();expect(after.tables.wallet_accounts[0].opening_minor).toBe('9223372036854775807');expect(after.tables.wallet_postings[0].delta_minor).toBe('-9223372036854775808');expect(after.tables.wallet_record_metadata[0].created_at).toBeNull();expect(after.tables.wallet_legacy_runs).toEqual([]);if(version>=2)expect(after.tables.wallet_account_metadata[0].credit_limit_minor).toBe('9007199254740993');for(const row of source.tables.app_commands)expect(after.tables.app_commands.find(r=>r.command===row.command&&r.request_id===row.request_id)).toEqual(row);expect(sqlite.sqliteLoad()).toEqual(source.legacy);expect(reader.all('PRAGMA foreign_key_check')).toEqual([]);
});
it('inspection alone never brands an old snapshot as restoreable or weakens the normal version-exact gate',async()=>{
 setup();const source=saved.get(1)!,changes=reader.get('SELECT total_changes() AS n');expect(()=>snapshot.validateAppSnapshot(source)).toThrow();const inspected=snapshot.inspectHistoricalDomainSnapshot(source,{namespace:'wallet',version:1,tables:Object.keys(walletTablesAt(1))});const boundaries:string[]=[];await expect(snapshot.restoreAppSnapshot(inspected as any,{maintenance:async fn=>{boundaries.push('maintenance');return fn();}})).rejects.toThrow(/validated/);expect(boundaries).toEqual([]);expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
it.each(['checksum','future','wallet0','migration-drift','other-domain','hidden-table','orphan-owner','claims','media'])('refuses shared source %s before staging, maintenance or SQL changes',kind=>{
 setup();const source=structuredClone(saved.get(1)!);if(kind==='checksum')source.manifest.checksum='0'.repeat(64);if(kind==='future')source.manifest.domains.wallet=5;if(kind==='wallet0')source.manifest.domains.wallet=0;if(kind==='migration-drift')source.tables.app_migrations.find(row=>row.namespace==='wallet')!.checksum='synthetic-drift';if(kind==='other-domain')source.manifest.domains.productivity=1;if(kind==='hidden-table')source.tables.wallet_future=[];if(kind==='orphan-owner')source.tables.wallet_accounts[0].owner_user_id='synthetic-missing';if(kind==='claims')source.tables.app_reward_claims.push({claim_id:'synthetic-orphan-claim',payload_hash:'synthetic',grant_entry_id:'synthetic-no-reward',reverse_entry_id:null});if(kind==='media')source.media['../synthetic-bad.png']='c3ludGhldGlj';if(kind!=='checksum')source.manifest.checksum=checksum(source);const changes=reader.get('SELECT total_changes() AS n'),legacy=sqlite.sqliteLoad();expect(()=>conversion.convertSharedWalletBackup(source,ports(),at)).toThrow();expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);expect(sqlite.sqliteLoad()).toEqual(legacy);
});
it('current4 shared backup remains unchanged and conversion is deterministic for a fixed explicit clock',()=>{
 setup();const current=saved.get(4)!,result=conversion.convertSharedWalletBackup(current,ports(),at);expect(result.snapshot).toEqual(current);expect(result.conversion.converted).toBe(false);const source=saved.get(1)!;expect(conversion.convertSharedWalletBackup(source,ports(),at)).toEqual(conversion.convertSharedWalletBackup(source,ports(),at));
});
it('conversion refuses uninstalled target, altered trusted migration chain or invalid conversion clock',()=>{
 setup();const source=saved.get(1)!,p=ports();expect(()=>conversion.convertSharedWalletBackup(source,{...p,installedVersion:3},at)).toThrow();const altered=structuredClone(p.migrations);altered[3].checksum='synthetic-drift';expect(()=>conversion.convertSharedWalletBackup(source,{...p,migrations:altered},at)).toThrow();expect(()=>conversion.convertSharedWalletBackup(source,p,'2026-02-30T00:00:00.000Z')).toThrow();
});
it.each([
 {namespace:'wallet',version:0,tables:[]},
 {namespace:'wallet',version:4,tables:Object.keys(walletTablesAt(4))},
 {namespace:'wallet',version:1,tables:['wallet_accounts','wallet_accounts']},
 {namespace:'wallet',version:1,tables:['users']},
 {namespace:'wallet',version:1,tables:['wallet_synthetic_unknown']},
 {namespace:'wallet',version:2,tables:Object.keys(walletTablesAt(1))},
] as const)('historical inspection refuses invalid trusted registration %j without a write',registration=>{
 setup();const changes=reader.get('SELECT total_changes() AS n');expect(()=>snapshot.inspectHistoricalDomainSnapshot(saved.get(1),registration)).toThrow();expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
