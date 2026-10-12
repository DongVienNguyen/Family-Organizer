import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { expect,it,vi } from 'vitest';
vi.setConfig({testTimeout:45_000});

const repo=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(path.join(repo,'package.json'));
const tsx=pathToFileURL(require.resolve('tsx')).href;
const identity={username:'synthetic-guardian',fullName:'Synthetic Guardian',password:'Synthetic first account passphrase'};
type Fixture={root:string;env:NodeJS.ProcessEnv};
async function fixture(work:(value:Fixture)=>Promise<void>){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo first account synthetic '));
  const env:NodeJS.ProcessEnv={};
  for(const name of ['PATH','SystemRoot','windir','TEMP','TMP','HOME','USERPROFILE'])if(process.env[name])env[name]=process.env[name];
  Object.assign(env,{NODE_ENV:'production',APP_CODE_ROOT:repo,DATA_DIR:path.join(root,'dữ liệu with spaces'),CONFIG_DIR:path.join(root,'config riêng'),LOG_DIR:path.join(root,'logs'),PORT:'0',FO_NETWORK_ATTEMPTS:path.join(root,'network.jsonl')});
  try{await work({root,env});expect(fs.existsSync(env.FO_NETWORK_ATTEMPTS!)?fs.readFileSync(env.FO_NETWORK_ATTEMPTS!,'utf8'):'').toBe('');}
  finally{fs.rmSync(root,{recursive:true,force:true});}
}
async function child(f:Fixture,args:string[],input?:string,keepInputOpen=false){
  const processHandle=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',tsx,...args],{cwd:f.root,env:f.env,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';processHandle.stdout.on('data',bytes=>{stdout+=bytes;});processHandle.stderr.on('data',bytes=>{stderr+=bytes;});
  // A rejected operator may close before the parent finishes writing synthetic input.
  processHandle.stdin.on('error',error=>{if((error as NodeJS.ErrnoException).code!=='EPIPE')stderr+='stdin transport failed';});
  if(keepInputOpen){if(input)processHandle.stdin.write(input);}else processHandle.stdin.end(input);
  const deadline=setTimeout(()=>processHandle.kill('SIGKILL'),15000);
  try{
    const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{processHandle.once('error',reject);processHandle.once('close',(code,signal)=>resolve({code,signal}));});
    expect(result.signal,stdout+stderr).toBeNull();
    let response:any;
    for(const line of stdout.trim().split(/\r?\n/)){try{response=JSON.parse(line);}catch{/* Runtime diagnostics are not the operator response. */}}
    return {...result,stdout,stderr,response};
  }finally{clearTimeout(deadline);if(processHandle.exitCode===null&&processHandle.signalCode===null)processHandle.kill('SIGKILL');}
}
const operator=(f:Fixture,value:unknown=identity)=>child(f,[path.join(repo,'server/operator.ts')],JSON.stringify(value));
const runtimeUrl=pathToFileURL(path.join(repo,'server/runtime.ts')).href;
const runtimeScript=`const {startApplication}=await import(${JSON.stringify(runtimeUrl)});try{const runtime=await startApplication();await runtime.close();console.log(JSON.stringify({started:true}));}catch{console.log(JSON.stringify({error:'INITIALIZATION_REQUIRED'}));process.exitCode=1;}`;
function database(f:Fixture){return path.join(f.env.DATA_DIR!,'family.db');}
function rows(f:Fixture){
  const sql=new Database(database(f),{readonly:true});
  try{return Object.fromEntries((sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all() as {name:string}[]).map(({name})=>[name,sql.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all()]));}
  finally{sql.close();}
}
function assertNoPlaintext(f:Fixture){
  const walk=(folder:string)=>{if(!fs.existsSync(folder))return;for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else expect(fs.readFileSync(file).includes(Buffer.from(identity.password)),file).toBe(false);}};
  for(const name of ['DATA_DIR','CONFIG_DIR','LOG_DIR'])walk(f.env[name]!);
}

it('refuses blank runtime startup before creating SQLite or a default account',()=>fixture(async f=>{
  const result=await child(f,['--input-type=module','--eval',runtimeScript]);
  expect(result.code,result.stdout+result.stderr).toBe(1);expect(result.response).toEqual({error:'INITIALIZATION_REQUIRED'});
  expect(fs.existsSync(database(f))).toBe(false);
}));
it('initializes one explicit Admin and permits login and restart without persisting plaintext',()=>fixture(async f=>{
  const initialized=await operator(f);expect(initialized.code,initialized.stdout+initialized.stderr).toBe(0);
  expect(initialized.response).toEqual({initialized:true,username:identity.username});expect(initialized.stdout+initialized.stderr).not.toContain(identity.password);
  const before=rows(f);expect((before.users as any[]).map(row=>JSON.parse(row.data))).toMatchObject([{id:'user_admin',username:identity.username,fullName:identity.fullName,role:'admin'}]);
  const loginScript=`import http from 'node:http';const {startApplication}=await import(${JSON.stringify(runtimeUrl)});const runtime=await startApplication();try{const body=JSON.stringify(${JSON.stringify({username:identity.username,password:identity.password})});const status=await new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:runtime.server.address().port,path:'/api/auth/login',method:'POST',agent:false,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',reject);req.end(body);});console.log(JSON.stringify({status}));}finally{await runtime.close();}`;
  const login=await child(f,['--input-type=module','--eval',loginScript]);expect(login.code,login.stdout+login.stderr).toBe(0);expect(login.response).toEqual({status:200});
  const restarted=await child(f,['--input-type=module','--eval',runtimeScript]);expect(restarted.code,restarted.stdout+restarted.stderr).toBe(0);expect(restarted.response).toEqual({started:true});
  expect(rows(f).users).toEqual(before.users);assertNoPlaintext(f);
}));
it('refuses duplicate initialization without changing any canonical rows',()=>fixture(async f=>{
  expect((await operator(f)).code).toBe(0);const before=rows(f);
  const result=await operator(f,{...identity,username:'synthetic-replacement'});
  expect(result.code).toBe(1);expect(result.response).toEqual({error:'INSTALLATION_NOT_PRISTINE'});expect(rows(f)).toEqual(before);assertNoPlaintext(f);
}));
it('refuses a selected legacy JSON input and leaves its exact bytes untouched',()=>fixture(async f=>{
  fs.mkdirSync(f.env.DATA_DIR!,{recursive:true});const selected=path.join(f.env.DATA_DIR!,'db.json');const contents=JSON.stringify({users:[{id:'synthetic-legacy',passwordHash:'synthetic-hash'}],tasks:[{id:'synthetic-task',title:'Preserve original input'}]});fs.writeFileSync(selected,contents);
  const result=await operator(f);expect(result.code).toBe(1);expect(result.response).toEqual({error:'LEGACY_DATA_PRESENT'});
  expect(fs.readFileSync(selected,'utf8')).toBe(contents);expect(fs.existsSync(database(f))).toBe(false);
}));
it('refuses a partial store with no users and never reseeds over existing business data',()=>fixture(async f=>{
  expect((await operator(f)).code).toBe(0);
  const sql=new Database(database(f));try{sql.exec('DELETE FROM users');sql.prepare('INSERT INTO tasks(id,seq,data) VALUES(?,?,?)').run('synthetic-partial',0,JSON.stringify({id:'synthetic-partial',title:'Preserve partial business data'}));}finally{sql.close();}
  const before=rows(f);const result=await operator(f);expect(result.code).toBe(1);expect(result.response).toEqual({error:'INSTALLATION_NOT_PRISTINE'});expect(rows(f)).toEqual(before);
  const started=await child(f,['--input-type=module','--eval',runtimeScript]);expect(started.code).toBe(1);
  expect(rows(f).users).toEqual(before.users);expect(rows(f).tasks).toEqual(before.tasks);assertNoPlaintext(f);
}));
it.each([
  {...identity,username:42}, {...identity,password:['synthetic']}, {...identity,password:'admin123'},
  {...identity,password:'x'.repeat(4097)}, {...identity,fullName:{}}, {...identity,role:'admin'},
])('rejects invalid first Admin payload %# without creating SQLite or logging credentials',value=>fixture(async f=>{
  const result=await operator(f,value);expect(result.code).toBe(1);expect(result.response).toEqual({error:'INITIALIZATION_INPUT_INVALID'});
  expect(fs.existsSync(database(f))).toBe(false);expect(result.stdout+result.stderr).not.toContain(identity.password);assertNoPlaintext(f);
}));
it('bounds malformed and oversize operator stdin without echoing its contents',()=>fixture(async f=>{
  for(const [input,error] of [[`{"password":"${identity.password}`, 'INITIALIZATION_INPUT_INVALID'],['x'.repeat(17000),'INITIALIZATION_INPUT_LIMIT']]){
    const result=await child(f,[path.join(repo,'server/operator.ts')],input);expect(result.code).toBe(1);expect(result.response).toEqual({error});
    expect(result.stdout+result.stderr).not.toContain(identity.password);expect(fs.existsSync(database(f))).toBe(false);
  }
}));
it('bounds waiting for operator EOF and permits a valid retry in the same pristine root',()=>fixture(async f=>{
  f.env.FIRST_ADMIN_INPUT_TIMEOUT_MS='200';
  const result=await child(f,[path.join(repo,'server/operator.ts')],'{',true);expect(result.code).toBe(1);expect(result.response).toEqual({error:'INITIALIZATION_INPUT_TIMEOUT'});
  delete f.env.FIRST_ADMIN_INPUT_TIMEOUT_MS;
  expect((await operator(f)).code).toBe(0);assertNoPlaintext(f);
}));

it('does not reimport stale legacy JSON over a partial initialized business store',()=>fixture(async f=>{
  fs.mkdirSync(f.env.DATA_DIR!,{recursive:true});
  const sql=new Database(database(f));
  const original={id:'synthetic-retained',title:'Retain exact partial business data'};
  try{sql.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE users(id TEXT PRIMARY KEY,seq INTEGER,data TEXT);CREATE TABLE tasks(id TEXT PRIMARY KEY,seq INTEGER,data TEXT)');sql.prepare('INSERT INTO app_meta VALUES(?,?)').run('schema_version','1');sql.prepare('INSERT INTO tasks VALUES(?,?,?)').run(original.id,0,JSON.stringify(original));}finally{sql.close();}
  const legacyFile=path.join(f.env.DATA_DIR!,'db.json');const legacy=JSON.stringify({users:[{id:'synthetic-stale',username:'stale',role:'admin'}],tasks:[{id:'synthetic-stale-task',title:'Obsolete legacy data'}]});fs.writeFileSync(legacyFile,legacy);
  const before=rows(f);
  const result=await child(f,['--input-type=module','--eval',runtimeScript]);
  expect(result.code,result.stdout+result.stderr).toBe(1);
  expect(rows(f).tasks).toEqual(before.tasks);expect(rows(f).users).toEqual(before.users);
  expect(fs.readFileSync(legacyFile,'utf8')).toBe(legacy);
}));

it.each(['unrelated','incomplete','unsupported-version','sqliteX','sqliteData'])('refuses %s SQLite without writing schema, metadata, journal mode or records',kind=>fixture(async f=>{
  fs.mkdirSync(f.env.DATA_DIR!,{recursive:true});
  const sql=new Database(database(f));
  try{
    if(kind==='sqliteX'||kind==='sqliteData')sql.exec('CREATE TABLE '+kind+'(value TEXT);INSERT INTO '+kind+" VALUES('preserve-me');");
    if(kind==='unrelated')sql.exec("CREATE TABLE synthetic_external(id TEXT PRIMARY KEY,data TEXT);INSERT INTO synthetic_external VALUES('synthetic-sentinel','retained');");
    if(kind==='incomplete')sql.exec("CREATE TABLE users(id TEXT PRIMARY KEY,seq INTEGER NOT NULL,data TEXT NOT NULL);INSERT INTO users VALUES('synthetic-sentinel',0,'{\"id\":\"synthetic-sentinel\"}');");
    if(kind==='unsupported-version')sql.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','999');");
  }finally{sql.close();}
  const inspect=()=>{const owned=new Database(database(f),{readonly:true});try{return {sha256:createHash('sha256').update(fs.readFileSync(database(f))).digest('hex'),schema:owned.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name").all(),mode:owned.pragma('journal_mode',{simple:true}),rows:rows(f)};}finally{owned.close();}};
  const before=inspect(),result=await operator(f);
  expect(result.code).toBe(1);expect(inspect()).toEqual(before);
  expect(result.response).toEqual({error:'INSTALLATION_NOT_PRISTINE'});
  const moved=database(f)+'.closed';fs.renameSync(database(f),moved);fs.renameSync(moved,database(f));
  assertNoPlaintext(f);
}));

it('explicit offline credential reentry retains existing IDs/roles and never creates a replacement admin',()=>fixture(async f=>{
  expect((await operator(f)).code).toBe(0);
  const removeScript=`const {withAppWriteTransaction}=await import(${JSON.stringify(pathToFileURL(path.join(repo,'server/appStore.ts')).href)});const sqlite=await import(${JSON.stringify(pathToFileURL(path.join(repo,'server/sqlite.ts')).href)});try{withAppWriteTransaction({actorId:'synthetic',command:'synthetic:ordinary-restore',requestId:crypto.randomUUID(),payloadHash:'fixture'},tx=>{delete tx.legacy.users[0].passwordHash;});}finally{sqlite.sqliteClose();}`;
  expect((await child(f,['--input-type=module','--eval',removeScript])).code).toBe(0);
  const before=rows(f);const restored=JSON.parse((before.users as any[])[0].data);
  const password='Synthetic khôi phục mật khẩu 2026';
  const result=await child(f,[path.join(repo,'server/operator.ts'),'--reset-credentials'],JSON.stringify({users:[{id:restored.id,password}]}));
  expect(result.code,result.stdout+result.stderr).toBe(0);
  expect(result.response).toEqual({resetUserIds:[restored.id],sessionsRevoked:true});
  expect(result.stdout+result.stderr).not.toContain(password);
  const after=rows(f);const user=JSON.parse((after.users as any[])[0].data);const {passwordHash,...safe}=user;
  expect(safe).toEqual(restored);expect(passwordHash).toMatch(/^[a-f0-9]+\$[a-f0-9]+$/);
  for(const [table,values] of Object.entries(before))if(!['users','app_commands','auth_user_versions','auth_sessions'].includes(table))expect(after[table]).toEqual(values);
  expect(JSON.stringify(after)).not.toContain(password);
}));

it('credential reentry refuses a missing store without creating an installation',()=>fixture(async f=>{
  const result=await child(f,[path.join(repo,'server/operator.ts'),'--reset-credentials'],JSON.stringify({users:[{id:'user_admin',password:identity.password}]}));
  expect(result.code).toBe(1);expect(result.response).toEqual({error:'CREDENTIAL_REENTRY_STORE_REQUIRED'});expect(fs.existsSync(database(f))).toBe(false);
}));
it.each([
  {users:[]}, {users:[{id:'user_admin',password:'short'}]},
  {users:[{id:'user_admin',password:identity.password,role:'admin'}]},
  {users:[{id:'user_admin',password:identity.password},{id:'user_admin',password:identity.password}]},
  {users:[{id:'missing-user',password:identity.password}]},
  {users:[{id:'user_admin',password:identity.password}]},
])('rejects invalid credential reentry batch %# without changing canonical rows',value=>fixture(async f=>{
  expect((await operator(f)).code).toBe(0);const before=rows(f);
  const result=await child(f,[path.join(repo,'server/operator.ts'),'--reset-credentials'],JSON.stringify(value));
  expect(result.code).toBe(1);expect(result.response).toEqual({error:'CREDENTIAL_REENTRY_INVALID'});expect(rows(f)).toEqual(before);expect(result.stdout+result.stderr).not.toContain(identity.password);
}));
it('validates the entire reentry batch before changing any user or session',()=>fixture(async f=>{
  expect((await operator(f)).code).toBe(0);
  const sql=new Database(database(f));try{const row=sql.prepare('SELECT data FROM users WHERE id=?').get('user_admin') as any;const user=JSON.parse(row.data);delete user.passwordHash;sql.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(user),user.id);}finally{sql.close();}
  const before=rows(f);const result=await child(f,[path.join(repo,'server/operator.ts'),'--reset-credentials'],JSON.stringify({users:[{id:'user_admin',password:identity.password},{id:'missing-user',password:identity.password}]}));
  expect(result.code).toBe(1);expect(result.response).toEqual({error:'CREDENTIAL_REENTRY_INVALID'});expect(rows(f)).toEqual(before);
}));

it.each(['deleted','unsupported-role'])('refuses credential reentry for a %s restored user',kind=>fixture(async f=>{
  expect((await operator(f)).code).toBe(0);
  const sql=new Database(database(f));try{const user=JSON.parse((sql.prepare('SELECT data FROM users WHERE id=?').get('user_admin') as any).data);delete user.passwordHash;if(kind==='deleted')user.isDeleted=true;else user.role='unsupported-role';sql.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(user),user.id);}finally{sql.close();}
  const before=rows(f);const result=await child(f,[path.join(repo,'server/operator.ts'),'--reset-credentials'],JSON.stringify({users:[{id:'user_admin',password:identity.password}]}));
  expect(result.code).toBe(1);expect(result.response).toEqual({error:'CREDENTIAL_REENTRY_INVALID'});expect(rows(f)).toEqual(before);
}));
