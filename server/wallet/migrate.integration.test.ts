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
import {migrateLegacyFinance} from './migrate.js';
import {UserRole} from '../../src/types.js';
import {walletCoreSql,walletCoreChecksum,walletMetadataSql,walletMetadataChecksum,walletFinancialSql,walletFinancialChecksum,walletLegacyMigrationSql,walletLegacyMigrationChecksum} from './schema.js';
const repo=fileURLToPath(new URL('../..',import.meta.url));let compiledRoot='',compiledSqlite='';
beforeAll(()=>{
 compiledRoot=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-legacy-startup-'));compiledSqlite=path.join(compiledRoot,'sqlite.cjs');const options={entryPoints:[path.join(repo,'server/sqlite.ts')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.dirname':'__dirname'}};
 const built=spawnSync(process.execPath,['-e',"process.stdout.write(require('esbuild').buildSync("+JSON.stringify(options)+").outputFiles[0].text)"],{cwd:repo,env:{...process.env,ESBUILD_WORKER_THREADS:'0'},encoding:'utf8',timeout:5000,maxBuffer:4*1024*1024});expect(built.error,built.stderr).toBeUndefined();expect(built.signal).toBeNull();expect(built.status,built.stderr).toBe(0);fs.writeFileSync(compiledSqlite,built.stdout);
});
afterAll(()=>{if(compiledRoot){fs.rmSync(compiledRoot,{recursive:true,force:true});expect(fs.existsSync(compiledRoot)).toBe(false);}});
const actor={userId:'synthetic-shared-migration-admin',role:UserRole.ADMIN},now='2026-10-17T02:00:00.000Z';
const meta=()=>({actorId:actor.userId,command:'wallet:synthetic:legacy-shared',requestId:randomUUID(),payloadHash:'synthetic'}),write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction(meta(),fn),store=openWalletStore({write:gateway.withAppWriteTransaction});
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const input=()=>({transactions:[{id:'synthetic-shared-legacy-record',type:'income',amount:123456,category:'food',account:'cash',description:'Synthetic original',date:'2026-10-11',creatorId:actor.userId,createdAt:'2026-10-11T00:00:00Z'},{id:'synthetic-shared-quarantine',type:'expense',amount:0.5,category:'food',account:'cash',description:'Synthetic invalid',date:'2026-10-11',creatorId:actor.userId}]});
let initialized=false;
function setup(){
 if(!initialized){write(tx=>{tx.legacy.users=[{id:actor.userId,role:UserRole.ADMIN,username:'synthetic-shared-migration-admin',fullName:'Synthetic migration administrator',passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:now}];});configureWalletStorage({migrations,snapshot,version:4});expect(migrations.getDomainVersions().wallet).toBe(0);expect(reader.get("SELECT name FROM sqlite_master WHERE name='wallet_legacy_runs'")).toBeUndefined();migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});expect(migrations.getDomainVersions().wallet).toBe(4);initialized=true;}
 write(tx=>{for(const name of ['wallet_legacy_links','wallet_legacy_runs','wallet_transfer_fees','wallet_record_fx','wallet_audit_metadata','wallet_label_metadata','wallet_category_metadata','wallet_record_metadata','wallet_account_metadata','wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+name);tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','0')");tx.legacy.transactions=input().transactions as any;});
}
const migrate=()=>store.transaction(meta(),tx=>migrateLegacyFinance(tx,input(),{actor,timezone:'Asia/Saigon',now}));
const capture=()=>write(tx=>snapshot.collectAppSnapshot(tx));
it('registers storage4 explicitly and restores migration mappings, quarantine and command receipts through I01',async()=>{
 setup();const first=migrate(),saved=capture();expect(inspectWalletStorage(reader)).toBe(true);expect(saved.manifest.domains.wallet).toBe(4);expect(saved.tables.wallet_legacy_runs[0].records_count).toBe(1);expect(saved.tables.wallet_legacy_links.filter(r=>r.state==='quarantined')).toHaveLength(1);expect(saved.tables.app_commands.some(row=>JSON.parse(row.result).value?.runId===first.runId)).toBe(true);const original=sqlite.sqliteLoad();write(tx=>tx.run("UPDATE wallet_records SET note='Synthetic changed after backup'"));await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});const after=capture();for(const name of Object.keys(saved.tables).filter(n=>n.startsWith('wallet_')))expect(after.tables[name]).toEqual(saved.tables[name]);for(const row of saved.tables.app_commands)expect(after.tables.app_commands.find(r=>r.command===row.command&&r.request_id===row.request_id)).toEqual(row);const extra=after.tables.app_commands.filter(r=>!saved.tables.app_commands.some(old=>old.command===r.command&&old.request_id===r.request_id));expect(extra).toHaveLength(1);expect(extra[0].command).toBe('core:snapshot:restore');expect(sqlite.sqliteLoad()).toEqual(original);expect(migrate().created.records).toBe(0);expect(reader.all('PRAGMA foreign_key_check')).toEqual([]);
});
it.each(['run-user','mapped-record-identity','link-run','counts','detail','status'])('shared restore rejects migration %s before maintenance or SQL/legacy mutation',async kind=>{
 setup();migrate();const bad=structuredClone(capture());if(kind==='run-user')bad.tables.wallet_legacy_runs[0].owner_user_id='synthetic-missing';if(kind==='mapped-record-identity')bad.tables.wallet_records[0].external_key='synthetic-forged';if(kind==='link-run')bad.tables.wallet_legacy_links[0].run_id='synthetic-missing';if(kind==='counts')bad.tables.wallet_legacy_runs[0].quarantined_count=0;if(kind==='detail')bad.tables.wallet_legacy_links[0].detail_json='[]';if(kind==='status')bad.tables.wallet_legacy_runs[0].status='ready';bad.manifest.checksum=checksum(bad);const changes=reader.get('SELECT total_changes() AS n'),legacy=sqlite.sqliteLoad(),boundaries:string[]=[];await expect((async()=>snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(bad),{maintenance:async fn=>{boundaries.push('maintenance');return fn();},onBoundary:b=>boundaries.push(b)}))()).rejects.toThrow();expect(boundaries).toEqual([]);expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);expect(sqlite.sqliteLoad()).toEqual(legacy);
});
it('a legitimate postmigration record change remains backup-restorable without pretending the initial pilot digest describes current money',async()=>{
 setup();migrate();write(tx=>tx.run("UPDATE wallet_records SET note='Synthetic later canonical edit',revision=2"));const saved=capture();await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});expect(reader.get('SELECT note,revision FROM wallet_records')).toEqual({note:'Synthetic later canonical edit',revision:2});expect(()=>migrate()).toThrow(expect.objectContaining({status:409}));
});
it('read-only recovery inspects durable migration without modifying the selected database',()=>{
 setup();migrate();const saved=capture(),changes=reader.get('SELECT total_changes() AS n');expect(()=>inspectRecoverySnapshot(saved,sqlite.sqliteConnection().name)).not.toThrow();expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
it('fresh source bootstrap retains installed4, legacy source, quarantine and inactive flag without importing twice',()=>{
 setup();const first=migrate(),loader=new URL('../../node_modules/tsx/dist/loader.mjs',import.meta.url).href,sqliteUrl=new URL('../sqlite.ts',import.meta.url).href,bootstrapUrl=new URL('../productivity/bootstrap.ts',import.meta.url).href;
 const code=`const sqlite=await import(${JSON.stringify(sqliteUrl)});try{const {configureTaskStorage}=await import(${JSON.stringify(bootstrapUrl)});await configureTaskStorage(sqlite);const db=sqlite.sqliteConnection();console.log(JSON.stringify({wallet:db.prepare("SELECT max(version) AS n FROM app_migrations WHERE namespace='wallet'").get().n,active:db.prepare("SELECT value FROM app_meta WHERE key='wallet_active'").get().value,records:db.prepare('SELECT count(*) AS n FROM wallet_records').get().n,run:db.prepare('SELECT id,status FROM wallet_legacy_runs').get(),legacy:sqlite.sqliteLoad().transactions.length}));}finally{sqlite.sqliteClose();}`;
 const output=execFileSync(process.execPath,['--import',loader,'--input-type=module','--eval',code],{env:process.env,encoding:'utf8',timeout:15000});expect(JSON.parse(output.trim().split('\n').at(-1)!)).toEqual({wallet:4,active:'0',records:1,run:{id:first.runId,status:'quarantined'},legacy:2});
});
it('refuses genuinely future migration and changed storage4 checksum without changing trusted schema',()=>{
 expect(walletLegacyMigrationChecksum).toBe('e555f82adb9fae84134835f7603d7f7ceeb567e41606a1834f963a69de3b8d39');setup();write(tx=>tx.run("INSERT INTO app_migrations VALUES('wallet',5,'synthetic-future','2026-10-17T00:00:00.000Z')"));try{const before=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported.*[Ww]allet/);expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(before);}finally{write(tx=>tx.run("DELETE FROM app_migrations WHERE namespace='wallet' AND version=5"));}write(tx=>tx.run("UPDATE app_migrations SET checksum='synthetic-drift' WHERE namespace='wallet' AND version=4"));try{expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported.*[Ww]allet/);expect(()=>migrations.applyDomainMigrations({enabled:['wallet'],pilot:true})).toThrow(/checksum changed/);}finally{write(tx=>tx.run("UPDATE app_migrations SET checksum=? WHERE namespace='wallet' AND version=4",walletLegacyMigrationChecksum));}
});
it.each([
 ['link foreign key',(sql:string)=>sql.replace('run_id TEXT NOT NULL REFERENCES wallet_legacy_runs(id)','run_id TEXT NOT NULL')],
 ['source identity',(sql:string)=>sql.replace('source_checksum TEXT NOT NULL UNIQUE','source_checksum TEXT NOT NULL')],
 ['detail constraint',(sql:string)=>sql.replace(" CHECK(json_valid(detail_json) AND json_type(detail_json)='object')",'')],
] as const)('cold startup rejects migration %s drift without altering native file bytes',async(_name,drift)=>{
 const {default:Database}=await import('better-sqlite3');const root=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-legacy-drift-')),data=path.join(root,'data'),file=path.join(data,'family.db');fs.mkdirSync(data);
 try{const db=new Database(file);try{db.exec("PRAGMA journal_mode=DELETE;CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','1');CREATE TABLE app_migrations(namespace TEXT,version INTEGER,checksum TEXT,applied_at TEXT,PRIMARY KEY(namespace,version));");db.exec(walletCoreSql+walletMetadataSql+walletFinancialSql+drift(walletLegacyMigrationSql));for(const [version,hash]of [[1,walletCoreChecksum],[2,walletMetadataChecksum],[3,walletFinancialChecksum],[4,walletLegacyMigrationChecksum]])db.prepare('INSERT INTO app_migrations VALUES(?,?,?,?)').run('wallet',version,hash,now);}finally{db.close();}
  const before=fs.readFileSync(file),code=`try{const sqlite=require(${JSON.stringify(compiledSqlite)});sqlite.sqliteClose();console.log('admitted');}catch(error){console.error(error.message);process.exitCode=1;}`;
  const result=spawnSync(process.execPath,['--input-type=commonjs','--eval',code],{env:{...process.env,NODE_PATH:path.join(repo,'node_modules'),DATA_DIR:data,CONFIG_DIR:path.join(root,'config'),LOG_DIR:path.join(root,'logs')},encoding:'utf8',timeout:5000,stdio:['pipe','pipe','pipe']});expect(result.error,result.stderr).toBeUndefined();expect(result.signal,result.stderr).toBeNull();expect(result.status,result.stderr).toBe(1);expect(result.stderr).toMatch(/Unsupported Wallet storage schema/);expect(result.stdout).not.toContain('admitted');expect(fs.readFileSync(file)).toEqual(before);for(const suffix of ['-wal','-shm','-journal'])expect(fs.existsSync(file+suffix)).toBe(false);fs.renameSync(file,file+'.closed');expect(fs.existsSync(file+'.closed')).toBe(true);
 }finally{fs.rmSync(root,{recursive:true,force:true});expect(fs.existsSync(root)).toBe(false);}
});
