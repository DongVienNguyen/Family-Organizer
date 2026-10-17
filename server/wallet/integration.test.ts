import {it,expect,beforeAll,afterAll} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {checksum} from '../snapshotValidation.js';
import {inspectRecoverySnapshot} from '../recoverySnapshotInspection.js';
import {UserRole} from '../../src/types.js';
import {openWalletStore} from './store.js';
import {walletCoreSql,walletCoreChecksum} from './schema.js';
import {configureWalletStorage,inspectWalletStorage} from './integration.js';
// Compile the fresh-process refusal fixture once. Repeated TSX loader/transpile
// startup is unrelated to each index/constraint assertion and exhausted the fixed
// Windows test deadline. The ordinary source-bootstrap case below stays separate.
const repo=fileURLToPath(new URL('../..',import.meta.url));let compiledRoot='',compiledSqlite='';
beforeAll(()=>{
 compiledRoot=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-startup-module-'));compiledSqlite=path.join(compiledRoot,'sqlite.cjs');
 const options={entryPoints:[path.join(repo,'server/sqlite.ts')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.dirname':'__dirname'}};
 const built=spawnSync(process.execPath,['-e',"process.stdout.write(require('esbuild').buildSync("+JSON.stringify(options)+").outputFiles[0].text)"],{cwd:repo,env:{...process.env,ESBUILD_WORKER_THREADS:'0'},encoding:'utf8',timeout:5000,maxBuffer:4*1024*1024});
 expect(built.error,built.stderr).toBeUndefined();expect(built.signal).toBeNull();expect(built.status,built.stderr).toBe(0);fs.writeFileSync(compiledSqlite,built.stdout);
});
afterAll(()=>{if(compiledRoot){fs.rmSync(compiledRoot,{recursive:true,force:true});expect(fs.existsSync(compiledRoot)).toBe(false);}});
const meta=()=>({actorId:'synthetic-wallet-owner',command:'wallet:synthetic:shared',requestId:randomUUID(),payloadHash:'synthetic'}),write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction(meta(),fn),store=openWalletStore({write:gateway.withAppWriteTransaction});
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
let initialized=false;
function setup(){if(!initialized){write(tx=>{tx.legacy.users=[{id:'synthetic-wallet-owner',role:UserRole.ADMIN,username:'synthetic-wallet',fullName:'Synthetic Wallet',passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}];});configureWalletStorage({migrations,snapshot});expect(migrations.getDomainVersions().wallet).toBe(0);migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});initialized=true;}write(tx=>{for(const table of ['wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+table);});}
function seed(){store.transaction(meta(),tx=>{tx.accounts.insert({id:'synthetic-shared-account',name:'Synthetic shared account',type:'bank',currency:'VND',ownerUserId:'synthetic-wallet-owner',accessMode:'private',openingMinor:'9223372036854775807',openingDate:'2026-10-15',revision:1});tx.records.insert({id:'synthetic-shared-record',kind:'expense',effectiveDate:'2026-10-15',timezone:'Asia/Saigon',source:'manual',note:'',settlementStatus:'cleared',creatorId:'synthetic-wallet-owner',revision:1});tx.postings.insert({recordId:'synthetic-shared-record',accountId:'synthetic-shared-account',deltaMinor:'-9223372036854775808'});});}
const capture=()=>write(tx=>snapshot.collectAppSnapshot(tx));
it('shared snapshot exports exact signed64 money and restores Wallet and legacy atomically',async()=>{
 setup();seed();const saved=capture();expect(saved.manifest.domains.wallet).toBe(1);expect(saved.tables.wallet_accounts[0].opening_minor).toBe('9223372036854775807');expect(saved.tables.wallet_postings[0].delta_minor).toBe('-9223372036854775808');
 store.transaction(meta(),tx=>tx.sql.run('DELETE FROM wallet_postings'));await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});
 expect(capture().tables.wallet_postings).toEqual(saved.tables.wallet_postings);expect(sqlite.sqliteConnection().prepare('SELECT typeof(delta_minor) AS type FROM wallet_postings').get()).toEqual({type:'integer'});expect(sqlite.sqliteLoad().transactions).toEqual(saved.legacy.transactions);
});
it('shared Wallet snapshot rejects out-of-range money before maintenance or any SQL changes',async()=>{
 setup();seed();const bad=structuredClone(capture());bad.tables.wallet_postings[0].delta_minor='-9223372036854775809';bad.manifest.checksum=checksum(bad);const changes=reader.get('SELECT total_changes() AS n'),boundaries:string[]=[];
 await expect((async()=>snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(bad),{maintenance:async fn=>{boundaries.push('maintenance');return fn();},onBoundary:boundary=>boundaries.push(boundary)}))()).rejects.toThrow();expect(boundaries).toEqual([]);expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
it('read-only recovery inspection admits the same registered Wallet schema and exact money strings',()=>{
 setup();seed();expect(inspectWalletStorage(reader)).toBe(true);const saved=capture();expect(()=>inspectRecoverySnapshot(saved,sqlite.sqliteConnection().name)).not.toThrow();sqlite.sqliteSave(sqlite.sqliteLoad());expect(capture().tables.wallet_postings).toEqual(saved.tables.wallet_postings);
});
it('future Wallet migration is refused by the pure inspector without schema changes',()=>{
 setup();sqlite.sqliteConnection().prepare("INSERT INTO app_migrations VALUES('wallet',3,'future','2026-10-15T00:00:00Z')").run();
 try{const schema=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported.*[Ww]allet/);expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(schema);}finally{sqlite.sqliteConnection().prepare("DELETE FROM app_migrations WHERE namespace='wallet' AND version=3").run();}
});
it('registered Wallet storage survives a fresh source bootstrap without automatic migration or activation',async()=>{
 setup();seed();const {execFileSync}=await import('node:child_process');
 const loader=new URL('../../node_modules/tsx/dist/loader.mjs',import.meta.url).href,sqliteUrl=new URL('../sqlite.ts',import.meta.url).href,bootstrapUrl=new URL('../productivity/bootstrap.ts',import.meta.url).href;
 const code=`const sqlite=await import(${JSON.stringify(sqliteUrl)});try{const {configureTaskStorage}=await import(${JSON.stringify(bootstrapUrl)});await configureTaskStorage(sqlite);const db=sqlite.sqliteConnection();console.log(JSON.stringify({wallet:db.prepare("SELECT max(version) AS version FROM app_migrations WHERE namespace='wallet'").get().version,productivity:db.prepare("SELECT count(*) AS n FROM app_migrations WHERE namespace='productivity'").get().n,money:db.prepare('SELECT CAST(delta_minor AS TEXT) AS money FROM wallet_postings').get().money}));}finally{sqlite.sqliteClose();}`;
 const output=execFileSync(process.execPath,['--import',loader,'--input-type=module','--eval',code],{env:process.env,encoding:'utf8',timeout:15000});expect(JSON.parse(output.trim().split('\n').at(-1)!)).toEqual({wallet:1,productivity:0,money:'-9223372036854775808'});
});

it('freezes the accepted Wallet core DDL identity before registering migration1',()=>{expect(walletCoreChecksum).toBe('5386132badbf4a5fee4331cbf0a133bd2a106ed284f80ee479ff31df4bcb1e6a');});

it.each([
 ['money affinity',(sql:string)=>sql.replace("opening_minor INTEGER NOT NULL CHECK(typeof(opening_minor)='integer')",'opening_minor REAL NOT NULL')],
 ['foreign key',(sql:string)=>sql.replace('account_id TEXT NOT NULL REFERENCES wallet_accounts(id)','account_id TEXT NOT NULL')],
 ['unique constraint',(sql:string)=>sql.replace(',UNIQUE(schedule_id,due_date)','')],
 ['unique index',(sql:string)=>sql.replace(/CREATE UNIQUE INDEX IF NOT EXISTS wallet_record_external_key[^;]+;/,'')],
] as const)('refuses drifted Wallet %s before native startup mutation and closes handles',async(_name,drift)=>{
 const {default:Database}=await import('better-sqlite3');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-drift-')),data=path.join(root,'data'),file=path.join(data,'family.db');fs.mkdirSync(data);
 try{
  const db=new Database(file);try{db.exec("PRAGMA journal_mode=DELETE;CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','1');CREATE TABLE app_migrations(namespace TEXT,version INTEGER,checksum TEXT,applied_at TEXT,PRIMARY KEY(namespace,version));");db.exec(drift(walletCoreSql));db.prepare('INSERT INTO app_migrations VALUES(?,?,?,?)').run('wallet',1,walletCoreChecksum,'2026-10-15T00:00:00Z');}finally{db.close();}
  const before=fs.readFileSync(file),code=`try{const sqlite=require(${JSON.stringify(compiledSqlite)});sqlite.sqliteClose();console.log('admitted');}catch(error){console.error(error.message);process.exitCode=1;}`;
  const result=spawnSync(process.execPath,['--input-type=commonjs','--eval',code],{env:{...process.env,NODE_PATH:path.join(repo,'node_modules'),DATA_DIR:data,CONFIG_DIR:path.join(root,'config'),LOG_DIR:path.join(root,'logs')},encoding:'utf8',timeout:5000,stdio:['pipe','pipe','pipe']});
  expect(result.error,result.stderr).toBeUndefined();expect(result.signal,result.stderr).toBeNull();const codeValue=result.status,errors=result.stderr;
  expect(codeValue).toBe(1);expect(errors).toMatch(/Unsupported Wallet storage schema/);expect(fs.readFileSync(file)).toEqual(before);expect(fs.readdirSync(data)).toEqual(['family.db']);fs.renameSync(file,file+'.closed');fs.renameSync(file+'.closed',file);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

it.each(['creator','audit-actor','category-cycle'])('shared coordinator rejects Wallet %s before maintenance or any SQL/legacy write',async kind=>{
 setup();seed();const saved=capture(),bad=structuredClone(saved);
 if(kind==='creator')bad.tables.wallet_records[0].creator_id='synthetic-unknown-creator';
 if(kind==='audit-actor')bad.tables.wallet_audit.push({id:'synthetic-orphan-audit',record_id:'synthetic-shared-record',actor_id:'synthetic-unknown-actor',action:'Synthetic audit'});
 if(kind==='category-cycle')bad.tables.wallet_categories.push({id:'synthetic-cycle-a',parent_id:'synthetic-cycle-b',name:'Synthetic A',nature:'need',archived_at:null},{id:'synthetic-cycle-b',parent_id:'synthetic-cycle-a',name:'Synthetic B',nature:'want',archived_at:null});
 bad.manifest.checksum=checksum(bad);const before=sqlite.sqliteLoad(),changes=reader.get('SELECT total_changes()AS n'),boundaries:string[]=[];
 await expect((async()=>snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(bad),{maintenance:async fn=>{boundaries.push('maintenance');return fn();},onBoundary:b=>boundaries.push(b)}))()).rejects.toThrow();
 expect(boundaries).toEqual([]);expect(reader.get('SELECT total_changes()AS n')).toEqual(changes);expect(sqlite.sqliteLoad()).toEqual(before);const after=capture();for(const table of ['wallet_records','wallet_audit','wallet_categories','wallet_postings'])expect(after.tables[table]).toEqual(saved.tables[table]);
});
