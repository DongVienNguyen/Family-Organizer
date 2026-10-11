import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { it,expect } from 'vitest';
const repo=fileURLToPath(new URL('..',import.meta.url));
function call(port:number,route:string,body?:unknown,token?:string):Promise<any>{
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path:route,method:body?'POST':'GET',agent:false,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}},res=>{
      let text='';res.on('data',v=>{text+=v;});res.on('end',()=>{let body:unknown;try{body=JSON.parse(text);}catch{body=text;}resolve({status:res.statusCode,body});});
    });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });
}
async function scenario(crash:boolean,rotateKey=false){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo lifecycle dữ liệu ')), data=path.join(root,'data');fs.mkdirSync(data);
  const legacy={users:[{id:'synthetic-user',username:'synthetic',role:'admin',fullName:'Synthetic',passwordHash:crypto.pbkdf2Sync('synthetic','family_organizer_salt_2026',1000,64,'sha512').toString('hex')}],tasks:[]};
  fs.writeFileSync(path.join(data,'db.json'),JSON.stringify(legacy));fs.writeFileSync(path.join(data,'session_secret.key'),'synthetic-key');
  let child:ChildProcess|undefined, output='';
  const networkFile=path.join(root,'external.jsonl');
  const env:NodeJS.ProcessEnv={};for(const name of ['PATH','SystemRoot','windir','TEMP','TMP','HOME','USERPROFILE']) if(process.env[name])env[name]=process.env[name];
  Object.assign(env,{NODE_ENV:'production',DATA_DIR:data,CONFIG_DIR:data,LOG_DIR:path.join(data,'logs'),PORT:'0',FO_NETWORK_ATTEMPTS:networkFile});
  async function launch(){
    output=''; child=spawn(process.execPath,['--require',path.join(repo,'scripts/ci/block-network.cjs'),'--import',pathToFileURL(createRequire(path.join(repo,'package.json')).resolve('tsx')).href,path.join(repo,'server.ts')],{cwd:root,env,stdio:['pipe','pipe','pipe']});
    child.stdout!.on('data',s=>{output+=s;});child.stderr!.on('data',s=>{output+=s;});
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){if(child.exitCode!==null||child.signalCode!==null)throw new Error(output);const match=output.match(/Server is running at http:\/\/[^:]+:(\d+)/);if(match)return Number(match[1]);await new Promise(resolve=>setTimeout(resolve,30));}
    throw new Error('Startup timeout: '+output);
  }
  async function stop(){
    if(!child||child.exitCode!==null||child.signalCode!==null)return;
    const exited=once(child,'exit');child.stdin!.write('stop\n');
    const timer=setTimeout(()=>child!.kill('SIGKILL'),5000);
    const [code,signal]=await exited;clearTimeout(timer);expect(signal,output).toBeNull();expect(code,output).toBe(0);expect(output).toContain('Shutdown complete');
  }
  try{
    let port=await launch();const ready=await call(port,'/api/ready');expect(ready.status).toBe(200);expect(ready.body.ready).toBe(true);
    const login=await call(port,'/api/auth/login',{username:'synthetic',password:'synthetic'});expect(login.status).toBe(200);const token=login.body.token;
    if(rotateKey){
      await stop();
      fs.writeFileSync(path.join(data,'session_secret.key'),'synthetic-replacement-key');
      port=await launch();expect((await call(port,'/api/ready')).status).toBe(200);
      await stop(); // No authentication request under the replacement key.
      fs.writeFileSync(path.join(data,'session_secret.key'),'synthetic-key');
      port=await launch();expect((await call(port,'/api/auth/me',undefined,token)).status).toBe(401);
      await stop();
      expect(fs.existsSync(networkFile)?fs.readFileSync(networkFile,'utf8'):'').toBe('');
      return;
    }
    const saved=await call(port,'/api/tasks',{title:'Synthetic persisted task',assigneeId:'synthetic-user',status:'todo'},token);expect(saved.status,JSON.stringify(saved)).toBe(200);
    if(crash){const exited=once(child!,'exit');child!.kill('SIGKILL');await exited;}else await stop();
    const dbPath=path.join(data,'family.db');fs.renameSync(dbPath,dbPath+'.probe');fs.renameSync(dbPath+'.probe',dbPath);
    port=await launch();const rows=await call(port,'/api/tasks',undefined,token);expect(rows.status).toBe(200);expect(JSON.stringify(rows.body)).toContain('Synthetic persisted task');expect(rows.body.tasks.find((task:any)=>task.id===saved.body.task.id).assigneeId).toBe('synthetic-user');await stop();
    const db=new Database(dbPath);try{expect(db.pragma('integrity_check',{simple:true})).toBe('ok');}finally{db.close();}
    expect(JSON.parse(fs.readFileSync(path.join(data,'db.json'),'utf8'))).toEqual(legacy);
    expect(fs.existsSync(networkFile)?fs.readFileSync(networkFile,'utf8'):'').toBe('');
  }finally{
    if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}
    fs.rmSync(root,{recursive:true,force:true});expect(fs.existsSync(root)).toBe(false);
  }
}
it('graceful stdin stop releases native files and restart retains HTTP writes',()=>scenario(false),20000);
it('crash/restart recovers committed WAL writes without overwriting legacy input',()=>scenario(true),20000);
it('idle startup persists signing-key rotation so reverting the key cannot revive sessions',()=>scenario(false,true),30000);
