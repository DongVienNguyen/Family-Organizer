import {it,expect,beforeAll,afterAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {checksum} from '../snapshotValidation.js';
import {inspectRecoverySnapshot} from '../recoverySnapshotInspection.js';
import {configureWalletStorage,inspectWalletStorage} from './integration.js';
import {openWalletStore} from './store.js';
import {UserRole} from '../../src/types.js';
import {walletCoreSql,walletCoreChecksum,walletMetadataSql,walletMetadataChecksum,walletFinancialSql,walletFinancialChecksum} from './schema.js';
const repo=fileURLToPath(new URL('../..',import.meta.url));let compiledRoot='',compiledSqlite='';
beforeAll(()=>{
 compiledRoot=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-financial-startup-'));compiledSqlite=path.join(compiledRoot,'sqlite.cjs');const options={entryPoints:[path.join(repo,'server/sqlite.ts')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.dirname':'__dirname'}};
 const built=spawnSync(process.execPath,['-e',"process.stdout.write(require('esbuild').buildSync("+JSON.stringify(options)+").outputFiles[0].text)"],{cwd:repo,env:{...process.env,ESBUILD_WORKER_THREADS:'0'},encoding:'utf8',timeout:5000,maxBuffer:4*1024*1024});expect(built.error,built.stderr).toBeUndefined();expect(built.signal).toBeNull();expect(built.status,built.stderr).toBe(0);fs.writeFileSync(compiledSqlite,built.stdout);
});
afterAll(()=>{if(compiledRoot){fs.rmSync(compiledRoot,{recursive:true,force:true});expect(fs.existsSync(compiledRoot)).toBe(false);}});
const meta=()=>({actorId:'synthetic-shared-financial-owner',command:'wallet:synthetic:financial-shared',requestId:randomUUID(),payloadHash:'synthetic'}),write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction(meta(),fn),store=openWalletStore({write:gateway.withAppWriteTransaction});
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const fx={recordId:'synthetic-shared-fx-transfer',fromCurrency:'USD',toCurrency:'VND',debitMinor:'10000',creditMinor:'2500000',numerator:'25000',denominator:'1',asOf:'2026-10-17',source:'synthetic-manual'};
let initialized=false;
function setup(){
 if(!initialized){write(tx=>{tx.legacy.users=[{id:meta().actorId,username:'synthetic-shared-financial',fullName:'Synthetic shared financial',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-17T00:00:00.000Z'}];});configureWalletStorage({migrations,snapshot,version:3});expect(migrations.getDomainVersions().wallet).toBe(0);migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});expect(migrations.getDomainVersions().wallet).toBe(3);initialized=true;}
 write(tx=>{for(const name of ['wallet_transfer_fees','wallet_record_fx','wallet_audit_metadata','wallet_label_metadata','wallet_category_metadata','wallet_record_metadata','wallet_account_metadata','wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+name);});
 store.transaction(meta(),tx=>{for(const currency of ['USD','VND'])tx.accounts.insert({id:'synthetic-shared-fx-'+currency,name:'Synthetic '+currency,type:'bank',currency,ownerUserId:meta().actorId,accessMode:'private',openingMinor:'0',openingDate:'2026-10-17',revision:1});for(const [id,kind]of [[fx.recordId,'transfer'],['synthetic-shared-fx-fee','expense']] as const)tx.records.insert({id,kind,effectiveDate:'2026-10-17',timezone:'Asia/Saigon',source:'manual',note:'Synthetic',settlementStatus:'cleared',creatorId:meta().actorId,revision:1});for(const [id,currency,minor]of [[fx.recordId,'USD','-10000'],[fx.recordId,'VND','2500000'],['synthetic-shared-fx-fee','VND','-10000']])tx.postings.insert({recordId:id,accountId:'synthetic-shared-fx-'+currency,deltaMinor:minor});tx.financial.fx.insert(fx);tx.financial.fees.link(fx.recordId,'synthetic-shared-fx-fee');});
}
const capture=()=>write(tx=>snapshot.collectAppSnapshot(tx));
it('registers version3 explicitly and restores FX, fees, metadata and legacy through the one coordinator',async()=>{
 setup();expect(inspectWalletStorage(reader)).toBe(true);const saved=capture();expect(saved.manifest.domains.wallet).toBe(3);expect(saved.tables.wallet_record_fx[0].credit_minor).toBe('2500000');store.transaction(meta(),tx=>tx.sql.run('DELETE FROM wallet_transfer_fees'));await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});const after=capture();for(const name of Object.keys(saved.tables).filter(n=>n.startsWith('wallet_')))expect(after.tables[name]).toEqual(saved.tables[name]);expect(sqlite.sqliteLoad()).toEqual(saved.legacy);expect(reader.all('PRAGMA foreign_key_check')).toEqual([]);
});
it.each(['missing-fx','wrong-rate','orphan-fee','void-parent'])('shared restore rejects financial %s before maintenance or any SQL/legacy change',async kind=>{
 setup();const bad=structuredClone(capture());if(kind==='missing-fx')bad.tables.wallet_record_fx=[];if(kind==='wrong-rate')bad.tables.wallet_record_fx[0].rate_numerator='24999';if(kind==='orphan-fee')bad.tables.wallet_transfer_fees[0].fee_record_id='synthetic-missing';if(kind==='void-parent')bad.tables.wallet_records.find(r=>r.id===fx.recordId)!.settlement_status='voided';bad.manifest.checksum=checksum(bad);const changes=reader.get('SELECT total_changes() AS n'),legacy=sqlite.sqliteLoad(),boundaries:string[]=[];await expect((async()=>snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(bad),{maintenance:async fn=>{boundaries.push('maintenance');return fn();},onBoundary:b=>boundaries.push(b)}))()).rejects.toThrow();expect(boundaries).toEqual([]);expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);expect(sqlite.sqliteLoad()).toEqual(legacy);
});
it('read-only recovery accepts the same financial relations without modifying the selected database',()=>{
 setup();const saved=capture(),changes=reader.get('SELECT total_changes() AS n');expect(()=>inspectRecoverySnapshot(saved,sqlite.sqliteConnection().name)).not.toThrow();expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
it('retains version3 and FX/fee values at fresh source bootstrap without activation',()=>{
 setup();const loader=new URL('../../node_modules/tsx/dist/loader.mjs',import.meta.url).href,sqliteUrl=new URL('../sqlite.ts',import.meta.url).href,bootstrapUrl=new URL('../productivity/bootstrap.ts',import.meta.url).href;
 const code=`const sqlite=await import(${JSON.stringify(sqliteUrl)});try{const {configureTaskStorage}=await import(${JSON.stringify(bootstrapUrl)});await configureTaskStorage(sqlite);const db=sqlite.sqliteConnection();console.log(JSON.stringify({wallet:db.prepare("SELECT max(version) AS n FROM app_migrations WHERE namespace='wallet'").get().n,productivity:db.prepare("SELECT count(*) AS n FROM app_migrations WHERE namespace='productivity'").get().n,active:db.prepare("SELECT value FROM app_meta WHERE key='wallet_active'").get()?.value??null,fx:db.prepare('SELECT CAST(credit_minor AS TEXT) AS minor FROM wallet_record_fx').get().minor,fee:db.prepare('SELECT fee_record_id AS id FROM wallet_transfer_fees').get().id}));}finally{sqlite.sqliteClose();}`;
 const output=execFileSync(process.execPath,['--import',loader,'--input-type=module','--eval',code],{env:process.env,encoding:'utf8',timeout:15000});expect(JSON.parse(output.trim().split('\n').at(-1)!)).toEqual({wallet:3,productivity:0,active:null,fx:'2500000',fee:'synthetic-shared-fx-fee'});
});
it('refuses genuinely future4 and an incorrect migration3 checksum without changing trusted schema',()=>{
 expect(walletFinancialChecksum).toBe('62dc673e1c18834975ff8477266d39a59d07641f5985a914488b3b7ef1acebf8');
 setup();write(tx=>tx.run("INSERT INTO app_migrations VALUES('wallet',4,'synthetic-future','2026-10-17T00:00:00.000Z')"));try{expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported.*[Ww]allet/);}finally{write(tx=>tx.run("DELETE FROM app_migrations WHERE namespace='wallet' AND version=4"));}write(tx=>tx.run("UPDATE app_migrations SET checksum='synthetic-drift' WHERE namespace='wallet' AND version=3"));try{const before=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported.*[Ww]allet/);expect(()=>migrations.applyDomainMigrations({enabled:['wallet'],pilot:true})).toThrow(/checksum changed/);expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(before);}finally{write(tx=>tx.run("UPDATE app_migrations SET checksum=? WHERE namespace='wallet' AND version=3",walletFinancialChecksum));}
});
it.each([
 ['FX affinity',(sql:string)=>sql.replace("debit_minor INTEGER NOT NULL CHECK(typeof(debit_minor)='integer' AND debit_minor>0)",'debit_minor REAL NOT NULL')],
 ['fee foreign key',(sql:string)=>sql.replace('fee_record_id TEXT NOT NULL UNIQUE REFERENCES wallet_records(id)','fee_record_id TEXT NOT NULL UNIQUE')],
 ['fee uniqueness',(sql:string)=>sql.replace('fee_record_id TEXT NOT NULL UNIQUE REFERENCES wallet_records(id)','fee_record_id TEXT NOT NULL REFERENCES wallet_records(id)')],
] as const)('cold startup refuses financial %s drift without changing file bytes and closes native handles',async(_name,drift)=>{
 const {default:Database}=await import('better-sqlite3');const root=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-financial-drift-')),data=path.join(root,'data'),file=path.join(data,'family.db');fs.mkdirSync(data);
 try{const db=new Database(file);try{db.exec("PRAGMA journal_mode=DELETE;CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','1');CREATE TABLE app_migrations(namespace TEXT,version INTEGER,checksum TEXT,applied_at TEXT,PRIMARY KEY(namespace,version));");db.exec(walletCoreSql+walletMetadataSql+drift(walletFinancialSql));for(const [version,hash]of [[1,walletCoreChecksum],[2,walletMetadataChecksum],[3,walletFinancialChecksum]])db.prepare('INSERT INTO app_migrations VALUES(?,?,?,?)').run('wallet',version,hash,'2026-10-17T00:00:00.000Z');}finally{db.close();}
  const before=fs.readFileSync(file),code=`try{const sqlite=require(${JSON.stringify(compiledSqlite)});sqlite.sqliteClose();console.log('admitted');}catch(error){console.error(error.message);process.exitCode=1;}`;
  const result=spawnSync(process.execPath,['--input-type=commonjs','--eval',code],{env:{...process.env,NODE_PATH:path.join(repo,'node_modules'),DATA_DIR:data,CONFIG_DIR:path.join(root,'config'),LOG_DIR:path.join(root,'logs')},encoding:'utf8',timeout:5000,stdio:['pipe','pipe','pipe']});expect(result.error,result.stderr).toBeUndefined();expect(result.signal,result.stderr).toBeNull();expect(result.status,result.stderr).toBe(1);expect(result.stderr).toMatch(/Unsupported Wallet storage schema/);expect(result.stdout).not.toContain('admitted');expect(fs.readFileSync(file)).toEqual(before);for(const suffix of ['-wal','-shm','-journal'])expect(fs.existsSync(file+suffix)).toBe(false);fs.renameSync(file,file+'.closed');expect(fs.existsSync(file+'.closed')).toBe(true);
 }finally{fs.rmSync(root,{recursive:true,force:true});expect(fs.existsSync(root)).toBe(false);}
});
