import {convertWalletBackup,convertSharedWalletBackup} from './backupConversion.js';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {it,expect} from 'vitest';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {checksum} from '../snapshotValidation.js';
import {inspectRecoverySnapshot} from '../recoverySnapshotInspection.js';
import {UserRole} from '../../src/types.js';
import {configureWalletStorage,inspectWalletStorage} from './integration.js';
import {walletReceiptChecksum,walletReceiptSql,receiptFromRow} from './receiptSchema.js';
import {openWalletStore} from './store.js';
import {exportWalletSnapshot,restoreWalletSnapshot,walletSnapshotChecksum,walletTablesAt} from './snapshot.js';
import {createReceiptFiles} from './receiptFiles.js';
import {parseReceiptUpload,receiptMediaPath} from './receiptContract.js';
const actor='synthetic-receipt-admin',recordId='synthetic-receipt-record',at='2026-10-17T00:00:00.000Z';
const meta=()=>({actorId:actor,command:'wallet:synthetic:receipt-integration',requestId:randomUUID(),payloadHash:'synthetic'});
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction(meta(),fn);
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const store=openWalletStore({write:gateway.withAppWriteTransaction}),files=createReceiptFiles({dataRoot:process.env.DATA_DIR!}),png=Buffer.from([137,80,78,71,13,10,26,10]);
let initialized=false;
function setup(){
 if(!initialized){
  write(tx=>{tx.legacy.users=[{id:actor,username:'synthetic-receipt-admin',fullName:'Synthetic receipt admin',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:at}];});
  configureWalletStorage({migrations,snapshot,version:5});
  expect(migrations.getDomainVersions().wallet).toBe(0);
  expect(reader.get("SELECT name FROM sqlite_master WHERE name='wallet_receipts'")).toBeUndefined();
  expect(()=>migrations.applyDomainMigrations({enabled:['wallet'],pilot:false})).toThrow(/explicit pilot/);
  migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});
  store.transaction(meta(),tx=>{tx.accounts.insert({id:'synthetic-receipt-account',name:'Synthetic receipt account',type:'bank',currency:'VND',ownerUserId:actor,accessMode:'private',openingMinor:'9223372036854775807',openingDate:'2026-10-17',revision:1});tx.records.insert({id:recordId,kind:'expense',effectiveDate:'2026-10-17',timezone:'Asia/Saigon',source:'manual',note:'Synthetic receipt record',settlementStatus:'cleared',creatorId:actor,revision:1});tx.postings.insert({recordId,accountId:'synthetic-receipt-account',deltaMinor:'-9223372036854775808'});});
  initialized=true;
 }
 write(tx=>tx.run('DELETE FROM wallet_receipts'));
 const staged=files.stage(parseReceiptUpload({fileName:'Hóa đơn synthetic.png',dataUrl:'data:image/png;base64,'+png.toString('base64')}));
 write(tx=>tx.run('INSERT INTO wallet_receipts VALUES(?,?,?,?,?,?,?,?,?)',staged.id,recordId,staged.fileKey,staged.fileName,staged.mime,staged.size,staged.sha256,at,actor));files.commit(staged);
 return {...staged,recordId,createdAt:at,createdBy:actor};
}
const capture=()=>write(tx=>snapshot.collectAppSnapshot(tx));
it('explicit version5 retains its DDL checksum, exact money and private receipt bytes in shared restore',async()=>{
 const metadata=setup();expect(migrations.getDomainVersions().wallet).toBe(5);expect(inspectWalletStorage(reader)).toBe(true);
 expect(reader.get("SELECT checksum FROM app_migrations WHERE namespace='wallet' AND version=5")).toEqual({checksum:walletReceiptChecksum});
 const saved=capture();expect(saved.manifest.domains.wallet).toBe(5);expect(saved.media[receiptMediaPath(metadata.fileKey)]).toBe(png.toString('base64'));
 write(tx=>{tx.run('DELETE FROM wallet_receipts');tx.run('DELETE FROM wallet_postings');});
 fs.writeFileSync(path.join(process.env.DATA_DIR!,'uploads',receiptMediaPath(metadata.fileKey)),Buffer.from('synthetic tampered bytes'));
 await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});
 expect(receiptFromRow(reader.get('SELECT * FROM wallet_receipts'))).toEqual(metadata);
 expect(files.read(metadata).bytes).toEqual(png);expect(capture().tables.wallet_postings[0].delta_minor).toBe('-9223372036854775808');expect(reader.all('PRAGMA foreign_key_check')).toEqual([]);
});
it.each(['missing-file','tampered-file','wrong-mime','wrong-size','wrong-hash','unsafe-key','orphan-record','orphan-actor','bad-time','duplicate-file-key','unknown-column'])('rejects a checksummed receipt %s before maintenance or SQL mutation',async kind=>{
 const metadata=setup(),bad=structuredClone(capture()),row=bad.tables.wallet_receipts[0],key=receiptMediaPath(metadata.fileKey);
 if(kind==='missing-file')delete bad.media[key];
 if(kind==='tampered-file')bad.media[key]=Buffer.from('synthetic corruption').toString('base64');
 if(kind==='wrong-mime')row.mime='application/pdf';
 if(kind==='wrong-size')row.size=1;
 if(kind==='wrong-hash')row.sha256='0'.repeat(64);
 if(kind==='unsafe-key')row.file_key='../synthetic.png';
 if(kind==='orphan-record')row.record_id='synthetic-missing-record';
 if(kind==='orphan-actor')row.created_by='synthetic-missing-user';
 if(kind==='bad-time')row.created_at='2026-02-30T00:00:00.000Z';
 if(kind==='duplicate-file-key')bad.tables.wallet_receipts.push({...row,id:randomUUID()});
 if(kind==='unknown-column')row.synthetic_extra='not admitted';
 bad.manifest.checksum=checksum(bad);const changes=reader.get('SELECT total_changes() AS n'),legacy=sqlite.sqliteLoad(),boundaries:string[]=[];
 await expect((async()=>snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(bad),{maintenance:async fn=>{boundaries.push('maintenance');return fn();}}))()).rejects.toThrow();
 expect(boundaries).toEqual([]);expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);expect(sqlite.sqliteLoad()).toEqual(legacy);expect(files.read(metadata).bytes).toEqual(png);
});
it('exports protocol6 metadata and restores it atomically; a data-only snapshot makes no media claim',()=>{
 const metadata=setup(),saved=store.transaction(meta(),tx=>exportWalletSnapshot(tx,gateway.markSnapshotReadResult));
 expect(saved.schemaVersion).toBe(6);expect(saved.tables.wallet_receipts).toHaveLength(1);expect(saved.checksum).toBe(walletSnapshotChecksum(saved));
 store.transaction(meta(),tx=>{tx.sql.run('DELETE FROM wallet_receipts');restoreWalletSnapshot(tx,saved);});
 expect(receiptFromRow(reader.get('SELECT * FROM wallet_receipts'))).toEqual(metadata);expect(files.read(metadata).bytes).toEqual(png);
 const old={schemaVersion:5,tables:Object.fromEntries(Object.entries(saved.tables).filter(([name])=>name!=='wallet_receipts')),checksum:''};old.checksum=walletSnapshotChecksum(old);
 expect(()=>store.transaction(meta(),tx=>restoreWalletSnapshot(tx,old))).toThrow(/version mismatch/);
});
it('read-only recovery accepts matching receipt media and rejects corruption without changing the database',()=>{
 setup();const saved=capture(),changes=reader.get('SELECT total_changes() AS n');expect(()=>inspectRecoverySnapshot(saved,sqlite.sqliteConnection().name)).not.toThrow();
 const bad=structuredClone(saved);delete bad.media[receiptMediaPath(String(bad.tables.wallet_receipts[0].file_key))];bad.manifest.checksum=checksum(bad);
 expect(()=>inspectRecoverySnapshot(bad,sqlite.sqliteConnection().name)).toThrow();expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);
});
it.each(['index','migration-checksum'])('cold inspector refuses receipt %s drift without mutation',kind=>{
 setup();if(kind==='index')write(tx=>tx.run('DROP INDEX wallet_receipt_record'));else write(tx=>tx.run("UPDATE app_migrations SET checksum='synthetic-drift' WHERE namespace='wallet' AND version=5"));
 try{const before=reader.all('SELECT name,sql FROM sqlite_master ORDER BY name');expect(()=>inspectWalletStorage(reader)).toThrow(/Unsupported/);expect(reader.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(before);}
 finally{if(kind==='index')write(tx=>tx.exec(walletReceiptSql));else write(tx=>tx.run("UPDATE app_migrations SET checksum=? WHERE namespace='wallet' AND version=5",walletReceiptChecksum));}
 expect(inspectWalletStorage(reader)).toBe(true);
});
it('fresh source bootstrap retains version5 without activation or automatic migration',()=>{
 setup();const loader=new URL('../../node_modules/tsx/dist/loader.mjs',import.meta.url).href,sqliteUrl=new URL('../sqlite.ts',import.meta.url).href,bootstrapUrl=new URL('../productivity/bootstrap.ts',import.meta.url).href;
 const code=`const sqlite=await import(${JSON.stringify(sqliteUrl)});try{const {configureTaskStorage}=await import(${JSON.stringify(bootstrapUrl)});await configureTaskStorage(sqlite);const db=sqlite.sqliteConnection();console.log(JSON.stringify({wallet:db.prepare("SELECT max(version) AS n FROM app_migrations WHERE namespace='wallet'").get().n,receipts:db.prepare('SELECT count(*) AS n FROM wallet_receipts').get().n,active:db.prepare("SELECT value FROM app_meta WHERE key='wallet_active'").get()?.value??null}));}finally{sqlite.sqliteClose();}`;
 const output=execFileSync(process.execPath,['--import',loader,'--input-type=module','--eval',code],{env:process.env,encoding:'utf8',timeout:15000});expect(JSON.parse(output.trim().split('\n').at(-1)!)).toEqual({wallet:5,receipts:1,active:null});
});

it.each([2,3,4,5])('explicit standalone%s conversion adds the receipt manifest without rewriting old money or source bytes',protocol=>{
 setup();const current=store.transaction(meta(),tx=>exportWalletSnapshot(tx,gateway.markSnapshotReadResult));
 const old={schemaVersion:protocol,tables:Object.fromEntries(Object.keys(walletTablesAt(protocol-1)).map(name=>[name,current.tables[name]])),checksum:''};old.checksum=walletSnapshotChecksum(old);const original=structuredClone(old);
 const result=convertWalletBackup(old,new Set([actor]),5);
 expect(old).toEqual(original);expect(result.schemaVersion).toBe(6);expect(result.tables.wallet_receipts).toEqual([]);expect(result.tables.wallet_postings).toEqual(old.tables.wallet_postings);expect(result.tables.wallet_accounts).toEqual(old.tables.wallet_accounts);
 expect(convertWalletBackup(result,new Set([actor]),5)).toEqual(result);expect(()=>convertWalletBackup(result,new Set([actor]),4)).toThrow();
});
it.each([0,1,2,3,4])('explicit shared%s conversion passes full target validation without changing live storage',version=>{
 setup();const source=structuredClone(capture());source.manifest.domains.wallet=version;
 const allowed=new Set(version===0?[]:Object.keys(walletTablesAt(version)));
 for(const name of Object.keys(source.tables))if(name.startsWith('wallet_')&&!allowed.has(name))delete source.tables[name];
 source.tables.app_migrations=source.tables.app_migrations.filter(row=>row.namespace!=='wallet'||Number(row.version)<=version);
 source.manifest.checksum=checksum(source);const original=structuredClone(source),changes=reader.get('SELECT total_changes() AS n');
 const result=convertSharedWalletBackup(source,{installedVersion:5,migrations:reader.all("SELECT version,checksum,applied_at FROM app_migrations WHERE namespace='wallet' ORDER BY version") as any,inspectHistorical:snapshot.inspectHistoricalDomainSnapshot,validateTarget:snapshot.validateAppSnapshot},at,{ownerUserId:actor,timezone:'Asia/Saigon'});
 expect(reader.get('SELECT total_changes() AS n')).toEqual(changes);expect(source).toEqual(original);
 expect(result.conversion).toMatchObject({fromVersion:version,toVersion:5,converted:true});expect(result.snapshot.tables.wallet_receipts).toEqual([]);expect(result.snapshot.media).toEqual(source.media);expect(result.snapshot.legacy).toEqual(source.legacy);expect(result.snapshot.tables.app_meta.find(row=>row.key==='wallet_active')?.value).toBe('0');
 expect(result.snapshot.tables.app_migrations.filter(row=>row.namespace==='wallet').map(row=>row.version)).toEqual([1,2,3,4,5]);
 if(version>0)expect(result.snapshot.tables.wallet_postings).toEqual(source.tables.wallet_postings);
 expect(reader.all('PRAGMA foreign_key_check')).toEqual([]);
});

it('freezes the first accepted receipt DDL identity without changing migrations1–4',()=>{expect(walletReceiptChecksum).toBe('63ddfb05d49c13a59544be8e9fe93ff42b7bf0c0af80047eca5fbb9a60c69354');});

it('an explicit legacy pilot still works after installing receipt schema5, preserving pending remote media and a version-matched safety backup',async()=>{
 setup();const original=capture(),backupFile=path.join(process.env.DATA_DIR!,'synthetic-wallet5-safety.json');
 try{
  write(tx=>{for(const name of Object.keys(walletTablesAt(5)).reverse().filter(name=>name!=='wallet_currencies'))tx.run('DELETE FROM '+name);tx.run("INSERT OR REPLACE INTO app_meta VALUES('wallet_active','0')");tx.legacy.transactions=[{id:'synthetic-wallet5-legacy-record',type:'expense',amount:123,date:'2026-10-17',category:'food',account:'cash',description:'Synthetic original receipt migration',creatorId:actor,createdAt:at,receiptImage:'https://synthetic.invalid/unfetched.png'} as any];tx.legacy.customCategories=[];tx.legacy.hiddenBuiltinCategories=[];tx.legacy.debts=[];tx.legacy.savingsGoals=[];});
  const {createWalletLegacyMigration,legacyFinanceSource}=await import('./migrationService.js'),source=()=>legacyFinanceSource(sqlite.sqliteLoad()),before=source(),request={actor:{userId:actor,role:UserRole.ADMIN},expectedRevision:0,idempotencyKey:randomUUID()};
  const service=createWalletLegacyMigration({reader,write:gateway.withAppWriteTransaction,readSource:source,now:()=>Date.parse(at),validateBackup:snapshot.validateAppSnapshot,backup:async()=>{const saved=capture();fs.writeFileSync(backupFile,JSON.stringify(saved));return {id:'synthetic-wallet5-safety',snapshot:JSON.parse(fs.readFileSync(backupFile,'utf8'))};}});
  const result=await service.migrate(request,{timezone:'Asia/Saigon'});expect(result.created).toMatchObject({records:1,pendingReceipts:1,quarantined:0});expect(source()).toEqual(before);expect(reader.all('SELECT * FROM wallet_receipts')).toEqual([]);expect(reader.get('SELECT status FROM wallet_legacy_runs')).toEqual({status:'pending_receipts'});expect(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")).toEqual({value:'0'});
  expect(JSON.parse(fs.readFileSync(backupFile,'utf8')).manifest.domains.wallet).toBe(5);expect(await service.migrate(request,{timezone:'Asia/Saigon'})).toEqual(result);expect(reader.get('SELECT count(*) AS n FROM wallet_records')).toEqual({n:1});expect(()=>snapshot.validateAppSnapshot(capture())).not.toThrow();
 }finally{await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(original),{maintenance:async fn=>fn()});if(fs.existsSync(backupFile))fs.unlinkSync(backupFile);}
});
