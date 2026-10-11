import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { it, expect } from 'vitest';
const repo=fileURLToPath(new URL('..',import.meta.url));
async function run(script:string, malformed=false){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo ownership synthetic ')),data=path.join(root,'data');fs.mkdirSync(data);
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
