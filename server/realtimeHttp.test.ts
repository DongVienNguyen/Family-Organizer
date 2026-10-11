import http from 'node:http';
import {once} from 'node:events';
import {expect,it} from 'vitest';
import {createApp} from './app.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';
async function fixture(work:(f:any)=>Promise<void>){
  const users=[{id:'adult',username:'synthetic-adult',fullName:'Synthetic adult',role:UserRole.ADMIN,passwordHash:'synthetic'},{id:'child',username:'synthetic-child',fullName:'Synthetic child',role:UserRole.CHILD,passwordHash:'synthetic'},{id:'peer',username:'synthetic-peer',fullName:'Synthetic peer',role:UserRole.MEMBER,passwordHash:'synthetic'}];
  const deps=syntheticDependencies({phase:'ready',storageWritable:true});let transaction:any,notes:any[]=[],plans:any[]=[],documents:any[]=[],tasks:any[]=[],goals:any[]=[],profiles:any[]=[],medications:any[]=[];
  deps.db.FamilyDB.getUsers=()=>users;deps.db.FamilyDB.saveTransaction=(body:any)=>transaction={...body,id:'synthetic-private-finance'};deps.db.FamilyDB.getTransactions=()=>transaction?[transaction]:[];
  deps.db.FamilyDB.getSavingsGoals=()=>goals;deps.db.FamilyDB.saveSavingsGoal=(body:any,actor:string)=>{const row={...body,id:'synthetic-goal',creatorId:actor};goals=[row];return row;};
  deps.db.FamilyDB.getHealthProfiles=()=>profiles;deps.db.FamilyDB.saveHealthProfile=(body:any)=>{const row={...body,id:'synthetic-health'};profiles=[row];return row;};
  deps.db.FamilyDB.deleteMedication=(id:string)=>{medications=medications.filter(row=>row.id!==id);};
  deps.db.FamilyDB.getMedications=()=>medications;deps.db.FamilyDB.saveMedication=(body:any)=>{const row={...body,id:'synthetic-medication'};medications=[row];return row;};
  for(const [kind,read,write] of [['note','getNotes','saveNote'],['plan','getPlans','savePlan'],['document','getDocuments','saveDocument'],['task','getTasks','saveTask']]){
    deps.db.FamilyDB[read]=()=>kind==='note'?notes:kind==='plan'?plans:kind==='task'?tasks:documents;
    deps.db.FamilyDB['delete'+kind[0].toUpperCase()+kind.slice(1)]=(id:string)=>{if(kind==='note')notes=notes.filter(row=>row.id!==id);};
    deps.db.FamilyDB[write]=(body:any,actor:string)=>{const row={...body,id:'synthetic-'+kind,creatorId:actor,allowedRolesToEdit:[],files:[]};if(kind==='note')notes=[row];else if(kind==='plan')plans=[row];else if(kind==='task')tasks=[row];else documents=[row];return row;};
  }
  const tokens=Object.fromEntries(users.map(user=>[user.id,deps.auth.issue(user)]));
  const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
  const pending:http.IncomingMessage[]=[];
  const open=(route:string,token?:string)=>new Promise<any>((resolve,reject)=>{
    const req=http.get({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false,headers:token?{Authorization:'Bearer '+token}:{}},res=>{
      const stream={response:res,text:'',status:res.statusCode,headers:res.headers};pending.push(res);res.on('data',bytes=>{stream.text+=String(bytes);});resolve(stream);
    });req.on('error',reject);
  });
  const post=(route:string,body:any,token:string,method='POST')=>new Promise<number>((resolve,reject)=>{const value=JSON.stringify(body);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,method,agent:false,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Content-Length':Buffer.byteLength(value)}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode!));});req.on('error',reject);req.end(value);});
  try{await work({open,post,tokens,deps});}finally{for(const res of pending)res.destroy();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));handle.endStreams();await handle.drainHandlers();await handle.dispose();}
}
it.each(['/api/realtime','/api/realtime?token=synthetic'])('rejects anonymous or URL-token realtime %s',route=>fixture(async({open,tokens}:any)=>{
  const stream=await open(route.includes('?')?'/api/realtime?token='+encodeURIComponent(tokens.adult):route);expect(stream.status).toBe(401);expect(stream.headers['cache-control']).toBe('no-store');
}));

it.each([['/api/child-health/emergency','userId','CHILD_HEALTH_UPDATE'],['/api/medications','patientId','MEDICATIONS_UPDATE']])('preserves a child own patient invalidation for %s',(route,field,type)=>fixture(async({open,post,tokens}:any)=>{
  const child=await open('/api/realtime',tokens.child);expect(await post(route,{[field]:'child',name:'synthetic',times:['08:00']},tokens.adult)).toBe(200);await new Promise(resolve=>setTimeout(resolve,30));expect(child.text).toContain(type);
}));

it.each([['/api/child-health/emergency','userId','CHILD_HEALTH_UPDATE','synthetic-health'],['/api/medications','patientId','MEDICATIONS_UPDATE','synthetic-medication']])('invalidates the prior patient only once after reassignment for %s',(route,field,type,id)=>fixture(async({open,post,tokens}:any)=>{
  const child=await open('/api/realtime',tokens.child);
  expect(await post(route,{[field]:'child',name:'synthetic'},tokens.adult)).toBe(200);
  expect(await post(route,{id,[field]:'peer',name:'synthetic-reassigned'},tokens.adult)).toBe(200);
  expect(await post(route,{id,[field]:'peer',name:'synthetic-private'},tokens.adult)).toBe(200);
  await new Promise(resolve=>setTimeout(resolve,30));expect(child.text.match(new RegExp(type,'g'))).toHaveLength(2);expect(child.text).not.toContain(id);
}));
it.each([['/api/child-health/emergency','userId','CHILD_HEALTH_UPDATE'],['/api/medications','patientId','MEDICATIONS_UPDATE']])('does not invalidate another patient for %s',(route,field,type)=>fixture(async({open,post,tokens}:any)=>{
  const child=await open('/api/realtime',tokens.child);expect(await post(route,{[field]:'peer',name:'synthetic'},tokens.adult)).toBe(200);await new Promise(resolve=>setTimeout(resolve,30));expect(child.text).not.toContain(type);
}));
it.each([['notes',{isShared:true},'NOTES_UPDATE','synthetic-note'],['medications',{patientId:'child'},'MEDICATIONS_UPDATE','synthetic-medication']])('invalidates a prior viewer after deleting %s',(kind,body,type,id)=>fixture(async({open,post,tokens}:any)=>{
  const child=await open('/api/realtime',tokens.child);expect(await post('/api/'+kind,body,tokens.adult)).toBe(200);expect(await post('/api/'+kind+'/'+id,{},tokens.adult,'DELETE')).toBe(200);await new Promise(resolve=>setTimeout(resolve,30));expect(child.text.match(new RegExp(type,'g'))).toHaveLength(2);expect(child.text).not.toContain(id);
}));

it('does not notify another adult about a private savings goal',()=>fixture(async({open,post,tokens}:any)=>{
  const owner=await open('/api/realtime',tokens.peer),other=await open('/api/realtime',tokens.adult);expect(await post('/api/finance/savings-goals',{name:'synthetic-private-goal',isShared:false,targetAmount:17},tokens.peer)).toBe(200);await new Promise(resolve=>setTimeout(resolve,30));expect(owner.text).toContain('FINANCE_UPDATE');expect(other.text).not.toContain('FINANCE_UPDATE');
}));

it.each(['notes','plans','documents','tasks'])('sends private %s invalidation only to authorized recipients',kind=>fixture(async({open,post,tokens}:any)=>{
  const owner=await open('/api/realtime',tokens.peer),child=await open('/api/realtime',tokens.child);
  expect(await post('/api/'+kind,{title:'synthetic-private',isShared:false},tokens.peer)).toBe(200);
  await new Promise(resolve=>setTimeout(resolve,30));const type=kind.toUpperCase()+'_UPDATE';expect(owner.text).toContain(type);expect(child.text).not.toContain(type);
}));

it('invalidates prior note viewers when sharing is revoked without revealing subsequent private changes',()=>fixture(async({open,post,tokens}:any)=>{
  const child=await open('/api/realtime',tokens.child),owner=await open('/api/realtime',tokens.peer);
  expect(await post('/api/notes',{title:'synthetic-shared',isShared:true},tokens.peer)).toBe(200);
  expect(await post('/api/notes',{id:'synthetic-note',title:'synthetic-now-private',isShared:false},tokens.peer)).toBe(200);
  expect(await post('/api/notes',{id:'synthetic-note',title:'synthetic-next-private',isShared:false},tokens.peer)).toBe(200);
  await new Promise(resolve=>setTimeout(resolve,30));expect(child.text.match(/NOTES_UPDATE/g)).toHaveLength(2);expect(owner.text.match(/NOTES_UPDATE/g)).toHaveLength(3);expect(child.text).not.toContain('synthetic-note');
}));
it('preserves authenticated realtime initialization without caching it',()=>fixture(async({open,tokens}:any)=>{
  const stream=await open('/api/realtime',tokens.adult);expect(stream.status).toBe(200);expect(stream.headers['content-type']).toContain('text/event-stream');expect(stream.headers['cache-control']).toBe('no-store');
}));
it('does not broadcast adult financial events or private object IDs to a child',()=>fixture(async({open,post,tokens}:any)=>{
  const adult=await open('/api/realtime',tokens.adult),child=await open('/api/realtime',tokens.child);
  expect(await post('/api/finance',{amount:17,type:'expense',description:'synthetic-private'},tokens.adult)).toBe(200);
  await new Promise(resolve=>setTimeout(resolve,30));
  expect(adult.text).toContain('FINANCE_UPDATE');expect(adult.text).not.toContain('synthetic-private-finance');expect(child.text).not.toContain('FINANCE_UPDATE');expect(child.text).not.toContain('synthetic-private-finance');
}));
it('ends an already-open stream when its session is revoked',()=>fixture(async({open,post,tokens}:any)=>{
  const stream=await open('/api/realtime',tokens.adult);let ended=false;stream.response.once('end',()=>{ended=true;});
  expect(await post('/api/auth/logout',{},tokens.adult)).toBe(200);
  await new Promise(resolve=>setTimeout(resolve,50));expect(ended).toBe(true);
}));
