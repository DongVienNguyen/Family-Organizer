import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { it, expect } from 'vitest';
import { writeSyntheticInstallation } from './synthetic-installation.js';
const repo=fileURLToPath(new URL('..',import.meta.url));
async function run(script:string, malformed=false){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo ownership synthetic ')),data=path.join(root,'data');fs.mkdirSync(data);
  if(!malformed)writeSyntheticInstallation(data);
  if(malformed){const db=new Database(path.join(data,'family.db'));try{db.exec('CREATE TABLE app_meta (key TEXT PRIMARY KEY)');}finally{db.close();}}
  const env:NodeJS.ProcessEnv={};for(const name of ['PATH','SystemRoot','windir','TEMP','TMP','HOME','USERPROFILE'])if(process.env[name])env[name]=process.env[name];
  Object.assign(env,{NODE_ENV:'production',DATA_DIR:data,CONFIG_DIR:data,LOG_DIR:path.join(data,'logs'),PORT:'0',FO_NETWORK_ATTEMPTS:path.join(root,'external.jsonl')});
  const prefix=`import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(path.join(repo,'package.json'))});`;
  const child=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href,'--input-type=module','--eval',prefix+script],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',s=>{output+=s;});child.stderr.on('data',s=>{output+=s;});
  const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
  try{
    const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    expect(result.signal,output).toBeNull();expect(result.code,output).toBe(0);
    expect(fs.existsSync(env.FO_NETWORK_ATTEMPTS!)?fs.readFileSync(env.FO_NETWORK_ATTEMPTS!,'utf8'):'').toBe('');
  }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});}
}
const runtimeUrl=pathToFileURL(path.join(repo,'server/runtime.ts')).href;
const sqliteUrl=pathToFileURL(path.join(repo,'server/sqlite.ts')).href;
it('failed SQLite schema initialization closes the real native connection before rejecting',async()=>{
  await run(`
    const NativeDatabase=require('better-sqlite3');const opened=[];
    const pragma=NativeDatabase.prototype.pragma;NativeDatabase.prototype.pragma=function(...args){if(!opened.includes(this))opened.push(this);return pragma.apply(this,args);};
    const {startApplication}=await import(${JSON.stringify(runtimeUrl)});
    await assert.rejects(startApplication(),/no such column: value/);
    assert.equal(opened.length,1);assert.equal(opened[0].open,false,'failed initializer retained a native SQLite connection');
    const file=path.join(process.env.DATA_DIR,'family.db');fs.renameSync(file,file+'.probe');fs.renameSync(file+'.probe',file);
    fs.rmSync(process.env.DATA_DIR,{recursive:true});assert.equal(fs.existsSync(process.env.DATA_DIR),false);
  `,true);
},15000);
it('duplicate startup cannot close another runtime and restarting requires a fresh process',async()=>{
  await run(`
    const {startApplication}=await import(${JSON.stringify(runtimeUrl)});
    const starting=startApplication();
    await assert.rejects(startApplication(),/already started|fresh process/i);
    const runtime=await starting;
    try{
      process.env.PORT=String(runtime.server.address().port);
      await assert.rejects(startApplication());
      const sqlite=await import(${JSON.stringify(sqliteUrl)});const data=sqlite.sqliteLoad();
      data.tasks.push({id:'synthetic-ownership',title:'Original runtime still owns storage'});sqlite.sqliteSave(data);
      assert.equal(sqlite.sqliteLoad().tasks.at(-1).id,'synthetic-ownership');
      await runtime.close();
      await assert.rejects(startApplication(),/already started|fresh process/i);
    }finally{await runtime.close();}
  `);
},15000);

it('rejects unsupported durable job versions on every bootstrap even after the initialization command was cached', async () => {
  const jobsUrl=pathToFileURL(path.join(repo,'server/jobStore.ts')).href;
  await run(`
    const jobs=await import(${JSON.stringify(jobsUrl)});new jobs.AppJobStore();
    const sqlite=await import(${JSON.stringify(sqliteUrl)});
    sqlite.sqliteConnection().prepare("UPDATE app_meta SET value='2' WHERE key='job_store_version'").run();
    await assert.rejects(import(${JSON.stringify(jobsUrl+'?synthetic-rebootstrap')}),/Unsupported durable job store version/);
    sqlite.sqliteClose();
  `);
},15000);

it('rejects changed snapshot journal schemas on bootstrap even when the initializer command is cached',async()=>{
  const snapshotUrl=pathToFileURL(path.join(repo,'server/appSnapshot.ts')).href;
  await run(`
    await import(${JSON.stringify(snapshotUrl)});const sqlite=await import(${JSON.stringify(sqliteUrl)});
    sqlite.sqliteConnection().exec('ALTER TABLE app_restore_commits ADD COLUMN synthetic_future TEXT');
    await assert.rejects(import(${JSON.stringify(snapshotUrl+'?synthetic-rebootstrap')}),/Unsupported snapshot/);
    sqlite.sqliteClose();
  `);
},15000);

const productivityUrl=(name:string)=>pathToFileURL(path.join(repo,'server/productivity/'+name+'.ts')).href;
const gatewayUrl=pathToFileURL(path.join(repo,'server/appStore.ts')).href;
const migrationsUrl=pathToFileURL(path.join(repo,'server/appMigrations.ts')).href;
const snapshotUrl=pathToFileURL(path.join(repo,'server/appSnapshot.ts')).href;
const dbUrl=pathToFileURL(path.join(repo,'server/db.ts')).href;
const legacyFixtureUrl=pathToFileURL(path.join(repo,'tests/fixtures/productivity.ts')).href;
function seedActiveScript(){return `
 const sqlite=await import(${JSON.stringify(sqliteUrl)}),gateway=await import(${JSON.stringify(gatewayUrl)}),migrations=await import(${JSON.stringify(migrationsUrl)}),snapshot=await import(${JSON.stringify(snapshotUrl)});await import(${JSON.stringify(dbUrl)});
 const bridge=await import(${JSON.stringify(productivityUrl('adapter'))}),store=await import(${JSON.stringify(productivityUrl('store'))}),fixture=await import(${JSON.stringify(legacyFixtureUrl)});
 const meta={actorId:'system:fixture',command:'productivity:runtime-fixture',requestId:crypto.randomUUID(),payloadHash:'synthetic'};
 gateway.withAppWriteTransaction(meta,tx=>{tx.legacy.tasks=[fixture.legacyTask('persisted',{creatorId:'user_admin',assigneeId:'user_admin'})];});
 bridge.configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 gateway.withAppWriteTransaction({...meta,requestId:crypto.randomUUID()},tx=>{bridge.activateCanonicalTasks(tx,bridge.legacyTaskDigest(tx.legacy.tasks));});sqlite.sqliteCheckpoint();sqlite.sqliteClose();
 `;}
const freshLoader=pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href;
it('fresh runtime installs the canonical bridge before legacy reads, writes and common snapshots',async()=>{
 await run(`const {spawnSync}=await import('node:child_process');const seed=spawnSync(process.execPath,['--require',${JSON.stringify(path.join(repo,'scripts/ci/block-network.cjs'))},'--import',${JSON.stringify(freshLoader)},'--input-type=module','--eval',${JSON.stringify(seedActiveScript())}],{env:process.env,encoding:'utf8',timeout:10000});assert.equal(seed.status,0,seed.stderr);
 const {startApplication}=await import(${JSON.stringify(runtimeUrl)});const runtime=await startApplication();try{
 const {FamilyDB}=await import(${JSON.stringify(dbUrl)});assert.equal(FamilyDB.getTasks()[0].id,'persisted');FamilyDB.saveTask({id:'persisted',title:'Runtime canonical edit'},'user_admin','admin');
 const sqlite=await import(${JSON.stringify(sqliteUrl)});assert.equal(sqlite.sqliteConnection().prepare('SELECT title FROM productivity_tasks WHERE id=?').get('persisted').title,'Runtime canonical edit');assert.equal(sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM tasks').get().n,0);
 const gateway=await import(${JSON.stringify(gatewayUrl)}),snapshot=await import(${JSON.stringify(snapshotUrl)});const saved=gateway.withAppWriteTransaction({actorId:'system:fixture',command:'core:snapshot:runtime-fixture',requestId:crypto.randomUUID(),payloadHash:'synthetic'},tx=>snapshot.collectAppSnapshot(tx));assert.equal(saved.manifest.domains.productivity,5);assert.deepEqual(saved.tables.productivity_task_pins,[]);assert.equal(saved.legacy.tasks[0].title,'Runtime canonical edit');
 }finally{await runtime.close();}
 `);
},15000);
it.each(['changed-checksum','unknown-namespace'])('fresh runtime rejects unsupported domain identity %s and releases its native handle',async kind=>{
 await run(`const {spawnSync}=await import('node:child_process');const seed=spawnSync(process.execPath,['--require',${JSON.stringify(path.join(repo,'scripts/ci/block-network.cjs'))},'--import',${JSON.stringify(freshLoader)},'--input-type=module','--eval',${JSON.stringify(seedActiveScript())}],{env:process.env,encoding:'utf8',timeout:10000});assert.equal(seed.status,0,seed.stderr);
 const NativeDatabase=require('better-sqlite3');const file=path.join(process.env.DATA_DIR,'family.db');const damaged=new NativeDatabase(file);try{damaged.exec(${JSON.stringify(kind==='changed-checksum'?"UPDATE app_migrations SET checksum='unsupported' WHERE namespace='productivity'":"INSERT INTO app_migrations VALUES('unknown_domain',1,'future-wallet','2026-10-14T00:00:00Z')")});damaged.pragma('journal_mode=DELETE');}finally{damaged.close();}const before=fs.readFileSync(file);
 const opened=[];const pragma=NativeDatabase.prototype.pragma;NativeDatabase.prototype.pragma=function(...args){if(!opened.includes(this))opened.push(this);return pragma.apply(this,args);};const {startApplication}=await import(${JSON.stringify(runtimeUrl)});await assert.rejects(startApplication(),/domain|migration/i);assert.equal(opened.length,1);assert.equal(opened[0].open,false);assert.equal(Buffer.compare(fs.readFileSync(file),before),0,'refused identity must preserve DELETE-journal bytes');fs.renameSync(file,file+'.closed');fs.renameSync(file+'.closed',file);
 `);
},15000);

it('refuses an unsupported sparse domain installation before adding legacy tables or switching its journal',async()=>{
 await run(`const NativeDatabase=require('better-sqlite3'),file=path.join(process.env.DATA_DIR,'family.db'),seed=new NativeDatabase(file);try{seed.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','1');CREATE TABLE app_migrations(namespace TEXT,version INTEGER,checksum TEXT,applied_at TEXT);INSERT INTO app_migrations VALUES('unknown_domain',1,'future','2026-10-14T00:00:00Z')");}finally{seed.close();}const before=fs.readFileSync(file);const {startApplication}=await import(${JSON.stringify(runtimeUrl)});await assert.rejects(startApplication(),/Unsupported domain/);assert.equal(Buffer.compare(fs.readFileSync(file),before),0,'sparse refusal must preserve exact bytes');const checked=new NativeDatabase(file,{readonly:true});try{assert.equal(checked.pragma('journal_mode',{simple:true}),'delete');assert.equal(checked.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,2);}finally{checked.close();}fs.renameSync(file,file+'.closed');fs.renameSync(file+'.closed',file);`);
},15000);
