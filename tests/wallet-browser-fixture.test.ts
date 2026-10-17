import {it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),script=path.join(root,'scripts/ci/write-wallet-browser-fixture.ts');
function environment(attempts:string){const env:NodeJS.ProcessEnv={FO_NETWORK_ATTEMPTS:attempts};for(const[key,value]of Object.entries(process.env))if(['path','systemroot','windir','systemdrive','comspec','pathext','temp','tmp','localappdata','tz'].includes(key.toLowerCase()))env[key]=value;return env;}
const args=['--require',path.join(root,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(require.resolve('tsx')).href,script];
it('builds a closed offline synthetic Wallet4 fixture without changing original Finance',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'wallet browser fixture données ')),data=path.join(folder,'data'),config=path.join(folder,'config'),attempts=path.join(folder,'attempts.jsonl');
 try{
  const raw=execFileSync(process.execPath,[...args,data,config],{cwd:root,env:environment(attempts),encoding:'utf8',stdio:'pipe'}),report=JSON.parse(raw);expect(report).toMatchObject({synthetic:true,walletVersion:4,users:5,accounts:4,legacyPreserved:true,nativeHandlesClosed:true});
  const db=new Database(path.join(data,'family.db'),{readonly:true});try{
   expect(db.pragma('integrity_check',{simple:true})).toBe('ok');expect(db.prepare("SELECT value FROM app_meta WHERE key='wallet_active'").get()).toEqual({value:'1'});
   expect(db.prepare('SELECT CAST(opening_minor AS TEXT) AS minor FROM wallet_accounts WHERE id=?').get(report.exactId)).toEqual({minor:'9007199254740993'});
   expect(db.prepare('SELECT permission FROM wallet_account_grants WHERE account_id=? AND user_id=?').get(report.readId,'wallet-browser-member')).toEqual({permission:'read'});
   const original=JSON.parse(fs.readFileSync(path.join(data,'db.json'),'utf8')).transactions,stored=db.prepare('SELECT data FROM transactions ORDER BY seq').all().map((row:any)=>JSON.parse(row.data));expect(stored).toEqual(original);expect(stored).toHaveLength(1);expect(db.prepare('SELECT count(*) AS n FROM users').get()).toEqual({n:5});
  }finally{db.close();}
  expect(fs.existsSync(attempts)?fs.readFileSync(attempts,'utf8'):'').toBe('');
 }finally{fs.rmSync(folder,{recursive:true});}
 expect(fs.existsSync(folder)).toBe(false);
});
it('refuses missing explicit fixture roots rather than seeding checkout storage',()=>{
 expect(()=>execFileSync(process.execPath,args,{cwd:root,env:environment(path.join(os.tmpdir(),'unused-wallet-browser-network.jsonl')),stdio:'pipe'})).toThrow('Explicit synthetic Wallet data/config roots required');
});
