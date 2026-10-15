import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {expect,it} from 'vitest';
const repo=fileURLToPath(new URL('..',import.meta.url)),sha='a'.repeat(40),tsx=pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const seedDirectories=()=>fs.readdirSync(os.tmpdir()).filter(n=>n.startsWith('family-board-package-seed-')).sort();
it('builds an isolated semantic8/Wallet1 fixture with exact money, board refs and unchanged Task hierarchy',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'family-board-fixture-test-')),before=seedDirectories(),out=path.join(root,'fixture.json');
 let db:Database.Database|undefined;
 try{
  const result=spawnSync(process.execPath,['--import',tsx,path.join(repo,'scripts/ci/write-board-package-fixture.ts'),out],{cwd:root,env:{...process.env,TEST_COMMIT_SHA:sha},encoding:'utf8',timeout:25000,maxBuffer:1024*1024});
  expect(result.error,result.stderr).toBeUndefined();expect(result.signal).toBeNull();expect(result.status,result.stderr).toBe(0);
  const fixture=JSON.parse(fs.readFileSync(out,'utf8'));expect(fixture).toMatchObject({format:1,commitSha:sha,version:8,walletVersion:1,producerPlatform:process.platform,producerArchitecture:process.arch,producerNodeVersion:process.version});
  expect(fixture.migrations.filter((r:any)=>r.namespace==='productivity').map((r:any)=>r.version)).toEqual([1,2,3,4,5,6,7,8]);expect(fixture.migrations.filter((r:any)=>r.namespace==='wallet').map((r:any)=>r.version)).toEqual([1]);
  expect(Object.keys(fixture.tables)).toHaveLength(31);expect(Object.keys(fixture.tables).sort()).toEqual(Object.keys(fixture.columns).sort());
  db=new Database(':memory:');db.pragma('foreign_keys=ON');db.exec(fixture.schemaSql);db.exec('DELETE FROM wallet_currencies');
  for(const [name,columns]of Object.entries(fixture.columns)as [string,string[]][]){const insert=db.prepare('INSERT INTO '+name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')');for(const row of fixture.tables[name])insert.run(...columns.map(key=>fixture.moneyColumns[name]?.includes(key)&&row[key]!==null?BigInt(row[key]):row[key]));}
  expect(db.pragma('foreign_key_check')).toEqual([]);expect(db.pragma('integrity_check',{simple:true})).toBe('ok');
  const config=JSON.parse((db.prepare('SELECT config_json FROM productivity_views WHERE id=?').get(fixture.viewId)as any).config_json);expect(config.boardId).toBe(fixture.boardId);expect(db.prepare('SELECT id FROM productivity_boards WHERE id=?').get(config.boardId)).toEqual({id:fixture.boardId});
  expect(db.prepare('SELECT parent_id FROM productivity_tasks WHERE id=?').get('board-child')).toEqual({parent_id:'board-root'});expect(db.prepare('SELECT COUNT(*) AS n FROM productivity_tasks WHERE parent_id IS NULL').get()).toEqual({n:2});
  expect(db.prepare('SELECT opening_minor FROM wallet_accounts').safeIntegers().get()).toEqual({opening_minor:9223372036854775807n});expect(db.prepare('SELECT delta_minor FROM wallet_postings').safeIntegers().get()).toEqual({delta_minor:-9223372036854775808n});
  expect(db.prepare('SELECT task_id,quadrant FROM productivity_matrix_overrides WHERE view_id=?').get(fixture.matrixViewId)).toEqual({task_id:'board-root',quadrant:'q2'});
  expect(seedDirectories()).toEqual(before);
 }finally{db?.close();fs.rmSync(root,{recursive:true,force:true});}
},30000);
it('refuses an invalid source identity before fixture creation',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'family-board-fixture-refused-')),out=path.join(root,'fixture.json'),before=seedDirectories();
 try{const result=spawnSync(process.execPath,['--import',tsx,path.join(repo,'scripts/ci/write-board-package-fixture.ts'),out],{cwd:root,env:{...process.env,TEST_COMMIT_SHA:'invalid'},encoding:'utf8',timeout:25000});expect(result.error).toBeUndefined();expect(result.signal).toBeNull();expect(result.status).toBe(1);expect(result.stderr).toContain('Synthetic board package fixture identity required');expect(fs.existsSync(out)).toBe(false);expect(seedDirectories()).toEqual(before);}finally{fs.rmSync(root,{recursive:true,force:true});}
},30000);
