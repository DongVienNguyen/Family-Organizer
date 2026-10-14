import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withAppWriteTransaction} from '../appStore.js';
import {sqliteConnection,sqliteLoad,sqliteSave} from '../sqlite.js';
import {openWalletStore} from './store.js';
import {prepareWalletSchema} from './schema.js';
const meta=(requestId=randomUUID())=>({actorId:'synthetic-wallet-admin',command:'wallet:synthetic:storage',requestId,payloadHash:'synthetic-fixed-payload'});
const store=()=>openWalletStore({write:withAppWriteTransaction});
const account=(id='synthetic-wallet-account')=>({id,name:'Synthetic account',type:'bank' as const,currency:'VND',ownerUserId:'synthetic-wallet-admin',accessMode:'private' as const,openingMinor:'0',openingDate:'2026-10-14',revision:1});
const record=(id='synthetic-wallet-record')=>({id,kind:'expense' as const,effectiveDate:'2026-10-14',timezone:'Asia/Saigon',source:'manual' as const,note:'Synthetic record',settlementStatus:'cleared' as const,creatorId:'synthetic-wallet-admin',revision:1});
const setup=()=>withAppWriteTransaction(meta(),tx=>prepareWalletSchema(tx));
it('foreign-key checks refuse nonexistent posting accounts and roll back the entire record and audit',()=>{
 setup();const before=sqliteConnection().prepare('SELECT count(*) AS n FROM app_commands').get();expect(()=>store().transaction(meta(),tx=>{tx.records.insert(record());tx.audit.append({id:'synthetic-audit',recordId:record().id,actorId:'synthetic-wallet-admin',action:'synthetic-create'});tx.postings.insert({recordId:record().id,accountId:'missing-account',deltaMinor:'-100'});})).toThrow();expect(sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_records').get()).toEqual({n:0});expect(sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_audit').get()).toEqual({n:0});expect(sqliteConnection().prepare('SELECT count(*) AS n FROM app_commands').get()).toEqual(before);
});
it('a failure at the second posting rolls back both postings, record, audit and simultaneous legacy changes',()=>{
 setup();store().transaction(meta(),tx=>tx.accounts.insert(account()));const legacy=sqliteLoad();expect(()=>store().transaction(meta(),tx=>{tx.records.insert(record());tx.postings.insert({recordId:record().id,accountId:account().id,deltaMinor:'-100'});tx.audit.append({id:'synthetic-audit',recordId:record().id,actorId:'synthetic-wallet-admin',action:'synthetic-create'});tx.legacy.notes.push({id:'synthetic-rolled-back-note'} as any);tx.postings.insert({recordId:record().id,accountId:'missing-second-account',deltaMinor:'100'});})).toThrow();for(const table of ['wallet_records','wallet_postings','wallet_audit'])expect(sqliteConnection().prepare('SELECT count(*) AS n FROM '+table).get()).toEqual({n:0});expect(sqliteLoad()).toEqual(legacy);
});
it('signed64 INTEGER bindings and string reads preserve amounts outside JS safe-number range exactly',()=>{
 setup();store().transaction(meta(),tx=>{tx.accounts.insert({...account(),openingMinor:'9223372036854775807'});tx.records.insert(record());tx.postings.insert({recordId:record().id,accountId:account().id,deltaMinor:'-9223372036854775808'});});store().transaction(meta(),tx=>{expect(tx.accounts.get(account().id)?.openingMinor).toBe('9223372036854775807');expect(tx.postings.forRecord(record().id)[0].deltaMinor).toBe('-9223372036854775808');});expect(sqliteConnection().prepare('SELECT typeof(delta_minor) AS kind FROM wallet_postings').get()).toEqual({kind:'integer'});expect(()=>store().transaction(meta(),tx=>tx.accounts.insert({...account('synthetic-overflow'),openingMinor:'9223372036854775808'}))).toThrow();
});
it('legacy sqliteSave preserves Wallet rows; source external key and occurrence uniqueness prevent duplicates',()=>{
 setup();store().transaction(meta(),tx=>{tx.accounts.insert(account());tx.records.insert({...record(),source:'import',externalKey:'synthetic-source-row'});tx.postings.insert({recordId:record().id,accountId:account().id,deltaMinor:'-100'});tx.occurrences.insert({id:'synthetic-occurrence',scheduleId:'synthetic-schedule',dueDate:'2026-10-14'});});const before=sqliteConnection().prepare('SELECT * FROM wallet_postings').all();sqliteSave(sqliteLoad());expect(sqliteConnection().prepare('SELECT * FROM wallet_postings').all()).toEqual(before);expect(()=>store().transaction(meta(),tx=>tx.records.insert({...record('synthetic-duplicate'),source:'import',externalKey:'synthetic-source-row'}))).toThrow();expect(()=>store().transaction(meta(),tx=>tx.occurrences.insert({id:'synthetic-occurrence-duplicate',scheduleId:'synthetic-schedule',dueDate:'2026-10-14'}))).toThrow();
});
it('the shared command owner returns a cached retry without entering a second Wallet callback and refuses payload conflicts',()=>{
 setup();const request=meta();let calls=0;const command=()=>store().transaction(request,tx=>{calls++;tx.accounts.insert(account());return {id:account().id,minor:'0'};});expect(command()).toEqual({id:account().id,minor:'0'});expect(command()).toEqual({id:account().id,minor:'0'});expect(calls).toBe(1);expect(()=>store().transaction({...request,payloadHash:'different'},()=>null)).toThrow();expect(sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_accounts').get()).toEqual({n:1});
});
it('async callbacks and nested public transactions cannot take ownership of the SQLite writer',()=>{
 setup();expect(()=>store().transaction(meta(),(async tx=>{tx.accounts.insert(account());}) as any)).toThrow();expect(sqliteConnection().prepare('SELECT count(*) AS n FROM wallet_accounts').get()).toEqual({n:0});expect(()=>store().transaction(meta(),()=>store().transaction(meta(),()=>null))).toThrow();
});
