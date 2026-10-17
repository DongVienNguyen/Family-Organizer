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
import {walletCoreSql,walletCoreChecksum,walletMetadataSql,walletMetadataChecksum} from './schema.js';
import {openWalletStore} from './store.js';
import {UserRole} from '../../src/types.js';
const meta=()=>({actorId:'synthetic-shared-metadata-owner',command:'wallet:synthetic:metadata-integration',requestId:randomUUID(),payloadHash:'synthetic'});
const repo=fileURLToPath(new URL('../..',import.meta.url));let compiledRoot='',compiledSqlite='';
beforeAll(()=>{
 compiledRoot=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-metadata-startup-'));compiledSqlite=path.join(compiledRoot,'sqlite.cjs');
 const options={entryPoints:[path.join(repo,'server/sqlite.ts')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.dirname':'__dirname'}};
 const built=spawnSync(process.execPath,['-e',"process.stdout.write(require('esbuild').buildSync("+JSON.stringify(options)+").outputFiles[0].text)"],{cwd:repo,env:{...process.env,ESBUILD_WORKER_THREADS:'0'},encoding:'utf8',timeout:5000,maxBuffer:4*1024*1024});
 expect(built.error,built.stderr).toBeUndefined();expect(built.signal).toBeNull();expect(built.status,built.stderr).toBe(0);fs.writeFileSync(compiledSqlite,built.stdout);
});
afterAll(()=>{if(compiledRoot){fs.rmSync(compiledRoot,{recursive:true,force:true});expect(fs.existsSync(compiledRoot)).toBe(false);}});
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction(meta(),fn);
const store=openWalletStore({write:gateway.withAppWriteTransaction}),reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
let initialized=false;
function setup(){
 if(!initialized){
  write(tx=>{tx.legacy.users=[{id:meta().actorId,username:'synthetic-metadata-shared',fullName:'Synthetic metadata',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-17T00:00:00.000Z'}];});
  configureWalletStorage({migrations,snapshot,version:2});expect(migrations.getDomainVersions().wallet).toBe(0);expect(reader.get("SELECT name FROM sqlite_master WHERE name='wallet_accounts'")).toBeUndefined();
  expect(()=>migrations.applyDomainMigrations({enabled:['wallet'],pilot:false})).toThrow(/explicit pilot/);expect(migrations.getDomainVersions().wallet).toBe(0);
  migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});initialized=true;
 }
 write(tx=>{for(const name of ['wallet_audit_metadata','wallet_label_metadata','wallet_category_metadata','wallet_record_metadata','wallet_account_metadata','wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+name);});
 store.transaction(meta(),tx=>{tx.accounts.insert({id:'synthetic-shared-metadata-account',name:'Synthetic shared credit',type:'credit',currency:'VND',ownerUserId:meta().actorId,accessMode:'private',openingMinor:'9223372036854775807',openingDate:'2026-10-17',revision:1});tx.records.insert({id:'synthetic-shared-metadata-record',kind:'expense',effectiveDate:'2026-10-17',timezone:'Asia/Saigon',source:'legacy',note:'Synthetic',settlementStatus:'uncleared',creatorId:meta().actorId,revision:1});tx.postings.insert({recordId:'synthetic-shared-metadata-record',accountId:'synthetic-shared-metadata-account',deltaMinor:'-9223372036854775808'});});
}
const capture=()=>write(tx=>snapshot.collectAppSnapshot(tx));
it('registers migration2 only for an explicit pilot and restores nullable metadata through the one I01 coordinator',async()=>{
 setup();expect(migrations.getDomainVersions().wallet).toBe(2);expect(inspectWalletStorage(reader)).toBe(true);const saved=capture();expect(saved.tables.wallet_account_metadata[0].credit_limit_minor).toBeNull();
 store.transaction(meta(),tx=>{const value=tx.metadata.accounts.get('synthetic-shared-metadata-account')!;tx.metadata.accounts.set({...value,creditLimitMinor:'9223372036854775807'});tx.sql.run('DELETE FROM wallet_postings');});
 await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});const after=capture();for(const name of Object.keys(saved.tables).filter(name=>name.startsWith('wallet_')))expect(after.tables[name]).toEqual(saved.tables[name]);expect(after.tables.wallet_account_metadata[0].credit_limit_minor).toBeNull();expect(after.tables.wallet_postings[0].delta_minor).toBe('-9223372036854775808');expect(reader.all('PRAGMA foreign_key_check')).toEqual([]);
});
it.each(['orphan','missing','unknown-actor','bad-time','bad-json','credit-overflow'])('shared validation rejects metadata %s before maintenance and SQL writes',async kind=>{
 setup();const bad=structuredClone(capture());if(kind==='orphan')bad.tables.wallet_account_metadata[0].account_id='synthetic-orphan-account';if(kind==='missing')bad.tables.wallet_record_metadata=[];if(kind==='unknown-actor')bad.tables.wallet_account_metadata[0].updated_by='synthetic-unknown';if(kind==='bad-time')bad.tables.wallet_record_metadata[0].occurred_at='2026-02-30T00:00:00.000Z';if(kind==='bad-json'){store.transaction(meta(),tx=>tx.audit.append({id:'synthetic-shared-audit',recordId:'synthetic-shared-metadata-record',actorId:meta().actorId,action:'Synthetic audit'}));bad.tables.wallet_audit=capture().tables.wallet_audit;bad.tables.wallet_audit_metadata=capture().tables.wallet_audit_metadata;bad.tables.wallet_audit_metadata[0].before_json='[]';}if(kind==='credit-overflow')bad.tables.wallet_account_metadata[0].credit_limit_minor='9223372036854775808';
 bad.manifest.checksum=checksum(bad);const changes=reader.get('SELECT total_changes() AS n'),legacy=sqlite.sqliteLoad(),boundaries:string[]=[];await expect((async()=>snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(bad),{maintenance:async fn=>{boundaries.push('maintenance');return fn();},onBoundary:b=>boundaries.push(b)}))()).rejects.toThrow();expect(boundaries).toEqual([]);expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);expect(sqlite.sqliteLoad()).toEqual(legacy);
});
it('admits matching version2 read-only recovery without altering the database',()=>{
 setup();const saved=capture(),changes=reader.get('SELECT total_changes() AS n');expect(()=>inspectRecoverySnapshot(saved,sqlite.sqliteConnection().name)).not.toThrow();expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
it('refuses genuinely future migration and metadata DDL drift without writing schema',()=>{
 setup();write(tx=>tx.run("INSERT INTO app_migrations VALUES('wallet',4,'synthetic-future','2026-10-17T00:00:00.000Z')"));try{const before=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported.*[Ww]allet/);expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(before);}finally{write(tx=>tx.run("DELETE FROM app_migrations WHERE namespace='wallet' AND version=4"));}
 write(tx=>tx.run('CREATE INDEX wallet_synthetic_untrusted ON wallet_record_metadata(payee)'));try{expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported Wallet storage schema/);}finally{write(tx=>tx.run('DROP INDEX wallet_synthetic_untrusted'));}expect(inspectWalletStorage(reader)).toBe(true);
});
it('retains version2 at fresh source bootstrap without migration, activation or money loss',()=>{
 setup();const loader=new URL('../../node_modules/tsx/dist/loader.mjs',import.meta.url).href,sqliteUrl=new URL('../sqlite.ts',import.meta.url).href,bootstrapUrl=new URL('../productivity/bootstrap.ts',import.meta.url).href;
 const code=`const sqlite=await import(${JSON.stringify(sqliteUrl)});try{const {configureTaskStorage}=await import(${JSON.stringify(bootstrapUrl)});await configureTaskStorage(sqlite);const db=sqlite.sqliteConnection();console.log(JSON.stringify({wallet:db.prepare("SELECT max(version) AS n FROM app_migrations WHERE namespace='wallet'").get().n,productivity:db.prepare("SELECT count(*) AS n FROM app_migrations WHERE namespace='productivity'").get().n,metadata:db.prepare('SELECT credit_limit_minor AS credit FROM wallet_account_metadata').get().credit,money:db.prepare('SELECT CAST(delta_minor AS TEXT) AS money FROM wallet_postings').get().money}));}finally{sqlite.sqliteClose();}`;
 const output=execFileSync(process.execPath,['--import',loader,'--input-type=module','--eval',code],{env:process.env,encoding:'utf8',timeout:15000});expect(JSON.parse(output.trim().split('\n').at(-1)!)).toEqual({wallet:2,productivity:0,metadata:null,money:'-9223372036854775808'});
});
it('applies the migration2 checksum once and refuses a modified recorded checksum',()=>{
 expect(walletMetadataChecksum).toBe('4692c682ac0f19185de4a85bb02d9ca667441d4b355cbd6b10d446b1e332dcea');
 setup();expect(reader.all("SELECT checksum FROM app_migrations WHERE namespace='wallet' AND version=2")).toEqual([{checksum:walletMetadataChecksum}]);const before=capture();migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});expect(capture().tables.wallet_accounts).toEqual(before.tables.wallet_accounts);write(tx=>tx.run("UPDATE app_migrations SET checksum='synthetic-drift' WHERE namespace='wallet' AND version=2"));try{expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported.*[Ww]allet/);expect(()=>migrations.applyDomainMigrations({enabled:['wallet'],pilot:true})).toThrow(/checksum changed/);}finally{write(tx=>tx.run("UPDATE app_migrations SET checksum=? WHERE namespace='wallet' AND version=2",walletMetadataChecksum));}
});
it.each([
 ['credit affinity',(sql:string)=>sql.replace("credit_limit_minor INTEGER CHECK(credit_limit_minor IS NULL OR (typeof(credit_limit_minor)='integer' AND credit_limit_minor>=0))",'credit_limit_minor REAL')],
 ['record foreign key',(sql:string)=>sql.replace('record_id TEXT PRIMARY KEY REFERENCES wallet_records(id)','record_id TEXT PRIMARY KEY')],
 ['hidden constraint',(sql:string)=>sql.replace('hidden IN(0,1)','hidden IN(0,1,2)')],
 ['category parent index',(sql:string)=>sql.replace(/CREATE INDEX IF NOT EXISTS wallet_category_parent[^;]+;/,'')],
] as const)('cold startup rejects metadata %s drift with unchanged database bytes and closed native handles',async(_name,drift)=>{
 const {default:Database}=await import('better-sqlite3');const root=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-metadata-drift-')),data=path.join(root,'data'),file=path.join(data,'family.db');fs.mkdirSync(data);
 try{
  const db=new Database(file);try{db.exec("PRAGMA journal_mode=DELETE;CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','1');CREATE TABLE app_migrations(namespace TEXT,version INTEGER,checksum TEXT,applied_at TEXT,PRIMARY KEY(namespace,version));");db.exec(walletCoreSql+drift(walletMetadataSql));for(const [version,hash]of [[1,walletCoreChecksum],[2,walletMetadataChecksum]])db.prepare('INSERT INTO app_migrations VALUES(?,?,?,?)').run('wallet',version,hash,'2026-10-17T00:00:00.000Z');}finally{db.close();}
  const before=fs.readFileSync(file),code=`try{const sqlite=require(${JSON.stringify(compiledSqlite)});sqlite.sqliteClose();console.log('admitted');}catch(error){console.error(error.message);process.exitCode=1;}`;
  const result=spawnSync(process.execPath,['--input-type=commonjs','--eval',code],{env:{...process.env,NODE_PATH:path.join(repo,'node_modules'),DATA_DIR:data,CONFIG_DIR:path.join(root,'config'),LOG_DIR:path.join(root,'logs')},encoding:'utf8',timeout:5000,stdio:['pipe','pipe','pipe']});
  expect(result.error,result.stderr).toBeUndefined();expect(result.signal,result.stderr).toBeNull();expect(result.status,result.stderr).toBe(1);expect(result.stderr).toMatch(/Unsupported Wallet storage schema/);expect(result.stdout).not.toContain('admitted');expect(fs.readFileSync(file)).toEqual(before);for(const suffix of ['-wal','-shm','-journal'])expect(fs.existsSync(file+suffix)).toBe(false);
  fs.renameSync(file,file+'.closed');expect(fs.existsSync(file+'.closed')).toBe(true);
 }finally{fs.rmSync(root,{recursive:true,force:true});expect(fs.existsSync(root)).toBe(false);}
});
