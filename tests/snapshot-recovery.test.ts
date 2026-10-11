import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
const repo = fileURLToPath(new URL('..',import.meta.url));
const moduleUrl = (name: string) => JSON.stringify(pathToFileURL(path.join(repo,'server',name+'.ts')).href);
async function child(root: string, script: string, expected: number) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH','SystemRoot','windir','TEMP','TMP','USERPROFILE','HOME']) if (process.env[key]) env[key]=process.env[key];
  Object.assign(env,{NODE_ENV:'production',DATA_DIR:path.join(root,'dữ liệu'),CONFIG_DIR:path.join(root,'config with spaces'),LOG_DIR:path.join(root,'logs'),PORT:'0',FO_NETWORK_ATTEMPTS:path.join(root,'unexpected.jsonl')});
  const processChild=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href,'--input-type=module','--eval',script],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let output='';processChild.stdout.on('data',data=>{output+=data;});processChild.stderr.on('data',data=>{output+=data;});
  const timer=setTimeout(()=>processChild.kill('SIGKILL'),15_000);
  try {
    const result=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{processChild.once('error',reject);processChild.once('exit',(code,signal)=>resolve({code,signal}));});
    expect(result.signal,output).toBeNull();expect(result.code,output).toBe(expected);
    expect(fs.existsSync(env.FO_NETWORK_ATTEMPTS!)?fs.readFileSync(env.FO_NETWORK_ATTEMPTS!,'utf8'):'').toBe('');
  } finally { clearTimeout(timer);if(processChild.exitCode===null&&processChild.signalCode===null)processChild.kill('SIGKILL'); }
}
it.each(['journal-written','media-old-renamed','media-promoted','settings-old-renamed','settings-promoted','sql-committed'])('recovers interrupted %s before runtime readiness in a fresh process',async phase=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo restore crash synthetic '));
  try {
    await child(root,`
      import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
      const db=await import(${moduleUrl('db')});const store=await import(${moduleUrl('appStore')});const snapshots=await import(${moduleUrl('appSnapshot')});
      const meta=()=>({actorId:'synthetic',command:'synthetic:crash',requestId:randomUUID(),payloadHash:'synthetic'});
      const media=path.join(process.env.DATA_DIR,'uploads');fs.mkdirSync(media,{recursive:true});fs.writeFileSync(path.join(media,'synthetic.bin'),'snapshot bytes');
      db.setAppSetting('rewardsEnabled','1');db.setAppSetting('geminiApiKey','synthetic-secret');
      store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'snapshot-task',title:'Synthetic snapshot'}];});
      const captured=store.withAppWriteTransaction(meta(),snapshots.collectAppSnapshot);
      store.withAppWriteTransaction(meta(),tx=>{tx.legacy.tasks=[{id:'current-task',title:'Synthetic current'}];});
      fs.writeFileSync(path.join(media,'synthetic.bin'),'current bytes');db.setAppSetting('rewardsEnabled','0');
      await snapshots.restoreAppSnapshot(snapshots.validateAppSnapshot(captured),{maintenance:async work=>work(),onBoundary:phase=>{if(phase===${JSON.stringify(phase)})process.exit(41);}});
      throw new Error('Synthetic crash boundary was not reached');
    `,41);
    await child(root,`
      import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
      const {startApplication}=await import(${moduleUrl('runtime')});const runtime=await startApplication();
      try {
        assert.equal(runtime.state.phase,'ready');
        const db=await import(${moduleUrl('db')});const sqlite=await import(${moduleUrl('sqlite')});
        assert.equal(sqlite.sqliteLoad().tasks[0].id,${JSON.stringify(phase==='sql-committed'?'snapshot-task':'current-task')});
        assert.equal(fs.readFileSync(path.join(process.env.DATA_DIR,'uploads','synthetic.bin'),'utf8'),${JSON.stringify(phase==='sql-committed'?'snapshot bytes':'current bytes')});
        assert.equal(db.getAppSettings().rewardsEnabled,${JSON.stringify(phase==='sql-committed'?'1':'0')});
        assert.equal(db.getAppSettings().geminiApiKey,'synthetic-secret');
        assert.equal(fs.existsSync(path.join(process.env.DATA_DIR,'restore-journal.json')),false);
      } finally { await runtime.close(); }
    `,0);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
},35_000);
