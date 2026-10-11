import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Credentials travel only through owned stdin; this is an offline synthetic probe.
export async function probeFirstAccount({ packageRoot, fixtureRoot, foreignCwd, blockNetwork, env, Database }) {
  const root=path.join(fixtureRoot,'khởi tạo tài khoản first account');
  const dataRoot=path.join(root,'dữ liệu');
  const configRoot=path.join(root,'cấu hình');
  const logRoot=path.join(root,'nhật ký');
  const probeEnv={...env,DATA_DIR:dataRoot,CONFIG_DIR:configRoot,LOG_DIR:logRoot,PORT:'0'};
  const password='synthetic-initializer-password-2026';
  const identity={username:'first-admin',fullName:'Synthetic first admin',password};
  const run=(entry,input)=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--require',blockNetwork,path.join(packageRoot,'dist',entry)],{cwd:foreignCwd,env:probeEnv,stdio:['pipe','pipe','pipe']});
    let output='',failure;
    const timer=setTimeout(()=>{failure=new Error('Compiled initialization probe deadline');child.kill('SIGKILL');},15000);
    const collect=chunk=>{output+=chunk;if(Buffer.byteLength(output)>65536){failure=new Error('Compiled initialization probe output limit');child.kill('SIGKILL');}};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.stdin.on('error',error=>{if(error.code!=='EPIPE')failure=error;});
    child.on('error',error=>{failure=error;});
    child.once('close',(code,signal)=>{clearTimeout(timer);if(failure)reject(failure);else resolve({code,signal,output});});
    child.stdin.end(input);
  });
  const blank=await run('server.cjs','');
  assert.equal(blank.code,1);assert.equal(blank.signal,null);
  assert.equal(fs.existsSync(path.join(dataRoot,'family.db')),false,'Blank startup must not write a default account');
  assert.doesNotMatch(blank.output,/admin123/);
  const initialized=await run('operator.cjs',JSON.stringify(identity));
  assert.equal(initialized.code,0,initialized.output);assert.equal(initialized.signal,null);
  assert.deepEqual(JSON.parse(initialized.output.trim()),{initialized:true,username:identity.username});
  const databaseFile=path.join(dataRoot,'family.db');
  const rows=()=>{const db=new Database(databaseFile,{readonly:true});try{return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>({name,rows:db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()}));}finally{db.close();}};
  const before=rows();
  const users=before.find(table=>table.name==='users').rows.map(row=>JSON.parse(row.data));
  assert.equal(users.length,1);assert.equal(users[0].role,'admin');assert.equal(users[0].username,identity.username);
  assert.match(users[0].passwordHash,/^[a-f0-9]{32}\$[a-f0-9]{128}$/);
  const duplicate=await run('operator.cjs',JSON.stringify({...identity,password:'synthetic-other-password-2026'}));
  assert.equal(duplicate.code,1);assert.equal(duplicate.signal,null);
  assert.deepEqual(JSON.parse(duplicate.output.trim()),{error:'INSTALLATION_NOT_PRISTINE'});
  assert.deepEqual(rows(),before,'Duplicate initialization must preserve every table');
  const malformed=await run('operator.cjs',JSON.stringify({...identity,password:['invalid'],role:'admin'}));
  assert.equal(malformed.code,1);assert.equal(malformed.signal,null);
  assert.deepEqual(JSON.parse(malformed.output.trim()),{error:'INITIALIZATION_INPUT_INVALID'});
  assert.deepEqual(rows(),before);
  for(const result of [initialized,duplicate,malformed])assert.equal(result.output.includes(password),false);
  const inspect=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())inspect(file);else assert.equal(fs.readFileSync(file).includes(Buffer.from(password)),false,'Plaintext must not enter selected roots');}};
  for(const directory of [dataRoot,configRoot,logRoot])inspect(directory);
  assert.equal(JSON.stringify(before).includes(password),false);
  const moved=databaseFile+'.closed';fs.renameSync(databaseFile,moved);fs.renameSync(moved,databaseFile);
}
