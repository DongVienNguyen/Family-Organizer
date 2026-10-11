import http from 'node:http';
import {once} from 'node:events';
import {expect,it,vi,beforeEach} from 'vitest';
import {createApp} from './app.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';
const {generate}=vi.hoisted(()=>({generate:vi.fn(async(_params:any)=>({text:'{"reply":"synthetic","actions":[]}'}))}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{models={generateContent:generate};}}));
beforeEach(()=>generate.mockClear());
const actors=[UserRole.ADMIN,UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST];
const records=(kind:string)=>[...actors.map(role=>({id:kind+'-'+role,creatorId:role,assigneeId:role,ownerId:role,userId:role,childId:role,patientId:role,title:'Synthetic '+kind+' '+role,description:'synthetic search',content:'synthetic search',isShared:false,allowedRolesToEdit:[UserRole.MEMBER],files:[],status:'todo',createdAt:'2026-10-11',updatedAt:'2026-10-11',startDate:'2026-10-11 09:00'})),{id:kind+'-shared',creatorId:UserRole.MEMBER,title:'Synthetic shared '+kind,description:'synthetic search',content:'synthetic search',isShared:true,allowedRolesToEdit:[UserRole.MEMBER],files:[],status:'todo',createdAt:'2026-10-11',updatedAt:'2026-10-11',startDate:'2026-10-11 09:00'}];
async function fixture(work:(f:any)=>Promise<void>){
  const deps=syntheticDependencies({phase:'ready',storageWritable:true});
  const users=actors.map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic'}));
  const notes=records('note'),tasks=records('task'),plans=records('plan'),documents=records('document');
  Object.assign(deps.db.FamilyDB,{
    getUsers:()=>users,getNotes:()=>notes,getTasks:()=>tasks,getPlans:()=>plans,getDocuments:()=>documents,
    getMedications:()=>records('medication').slice(0,4),getVaccinations:()=>records('vaccination').slice(0,4),getGrowthRecords:()=>records('growth').slice(0,4),getHealthProfiles:()=>records('health').slice(0,4),
    getTransactions:()=>[{id:'synthetic-finance-secret',amount:17,description:'synthetic financial private',date:'2026-10-11'}],getShoppingItems:()=>[],
    getNotifications:()=>[{id:'private-notification',userId:UserRole.MEMBER},{id:'shared-notification',userId:'all'}],
    addCommentToTask:vi.fn((id:string)=>tasks.find(row=>row.id===id)),saveTask:vi.fn((body:any)=>({...tasks.find(row=>row.id===body.id),...body})),saveNote:vi.fn((body:any)=>({...notes.find(row=>row.id===body.id),...body})),savePlan:vi.fn((body:any)=>({...plans.find(row=>row.id===body.id),...body})),saveDocument:vi.fn((body:any)=>({...documents.find(row=>row.id===body.id),...body})),deletePlan:vi.fn(),deleteDocument:vi.fn(),markNotificationRead:vi.fn(),
  });
  deps.db.getAppSettings=()=>({geminiApiKey:'synthetic-not-real'});
  const tokens=Object.fromEntries(users.map(user=>[user.id,deps.auth.issue(user)]));
  const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);
  const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
  const send=(route:string,role:UserRole,body?:any,method?:string)=>new Promise<{status:number;body:any}>((resolve,reject)=>{
    const value=body===undefined?undefined:JSON.stringify(body);
    const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,method:method??(value?'POST':'GET'),agent:false,headers:{Authorization:'Bearer '+tokens[role],...(value?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(value)}:{})}},res=>{let text='';res.on('data',chunk=>{text+=String(chunk);});res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(text)}));});req.on('error',reject);req.end(value);
  });
  try{await work({send,deps,notes,tasks,plans,documents,tokens});}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));handle.endStreams();await handle.drainHandlers();await handle.dispose();}
}
for(const role of actors){
  for(const kind of ['task','note','plan','document']){
    it(`filters ${kind} list for ${role} before serialization`,()=>fixture(async({send}:any)=>{
      const result=await send('/api/'+kind+'s',role);
      if(kind==='document'&&(role===UserRole.CHILD||role===UserRole.GUEST)){expect(result.status).toBe(403);return;}
      expect(result.status).toBe(200);
      const all=kind==='task'&&(role===UserRole.ADMIN||role===UserRole.MEMBER)||['note','plan'].includes(kind)&&role===UserRole.ADMIN;
      expect(result.body[kind+'s'].map((row:any)=>row.id).sort()).toEqual((all?records(kind).map(row=>row.id):[kind+'-'+role,kind+'-shared']).sort());
    }));
  }
  it(`filters patient data for ${role}`,()=>fixture(async({send}:any)=>{
    const health=await send('/api/child-health',role),medication=await send('/api/medications',role);expect(health.status).toBe(200);expect(medication.status).toBe(200);
    const visible=role===UserRole.ADMIN||role===UserRole.MEMBER?actors:[role];
    for(const [field,kind] of [['healthProfiles','health'],['growthRecords','growth'],['vaccinations','vaccination']])expect(health.body[field].map((row:any)=>row.id).sort()).toEqual(visible.map((id:string)=>kind+'-'+id).sort());
    expect(medication.body.medications.map((row:any)=>row.id).sort()).toEqual(visible.map((id:string)=>'medication-'+id).sort());
  }));
}
it.each([UserRole.CHILD,UserRole.GUEST])('denies direct finance URLs to %s',role=>fixture(async({send}:any)=>{expect((await send('/api/finance',role)).status).toBe(403);}));
it.each([UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST])('filters search before matching/slicing for %s',role=>fixture(async({send,notes}:any)=>{
  notes.unshift(...Array.from({length:8},(_,i)=>({...records('note')[0],id:'private-before-'+i})));
  const result=await send('/api/search?q=synthetic',role);expect(result.status).toBe(200);
  const results=result.body.results.filter((row:any)=>row.kind==='note');expect(results.map((row:any)=>row.id).sort()).toEqual(['note-'+role,'note-shared'].sort());expect(JSON.stringify(result.body)).not.toContain('private-before');
}));
it.each([UserRole.CHILD,UserRole.GUEST])('does not send finance/private-other context to the assistant for %s',role=>fixture(async({send}:any)=>{
  expect((await send('/api/assistant/chat',role,{message:'synthetic question'})).status).toBe(200);expect(generate).toHaveBeenCalledOnce();
  const prompt=generate.mock.calls[0][0].contents;expect(prompt).not.toContain('synthetic-finance-secret');expect(prompt).not.toContain('plan-admin');expect(prompt).not.toContain('task-admin');expect(prompt).not.toContain('medication-admin');expect(prompt).toContain('task-'+role);expect(prompt).toContain('plan-shared');
}));
it('preserves authorized adult assistant finance and own private schedule context',()=>fixture(async({send}:any)=>{expect((await send('/api/assistant/chat',UserRole.MEMBER,{message:'synthetic question'})).status).toBe(200);const prompt=generate.mock.calls[0][0].contents;expect(prompt).toContain('synthetic-finance-secret');expect(prompt).toContain('plan-member');expect(prompt).not.toContain('plan-admin');}));
it.each(['private','missing'])('rejects %s task comments without leaking or mutating',kind=>fixture(async({send,deps}:any)=>{
  const result=await send('/api/tasks/'+(kind==='private'?'task-admin':'absent')+'/comments',UserRole.CHILD,{content:'synthetic'});expect(result.status).toBe(404);expect(JSON.stringify(result.body)).not.toContain('Synthetic task');expect(deps.db.FamilyDB.addCommentToTask).not.toHaveBeenCalled();
}));
it('preserves authorized shared task comments',()=>fixture(async({send,deps}:any)=>{expect((await send('/api/tasks/task-shared/comments',UserRole.CHILD,{content:'synthetic'})).status).toBe(200);expect(deps.db.FamilyDB.addCommentToTask).toHaveBeenCalledOnce();}));
it('rejects private note updates by invisible role editors',()=>fixture(async({send,deps}:any)=>{const result=await send('/api/notes',UserRole.MEMBER,{id:'note-child',title:'synthetic tamper'});expect(result.status).toBe(404);expect(deps.db.FamilyDB.saveNote).not.toHaveBeenCalled();}));
it('rejects a comments property used to bypass private task update permission',()=>fixture(async({send,deps}:any)=>{const result=await send('/api/tasks',UserRole.CHILD,{id:'task-admin',comments:[],title:'synthetic tamper'});expect(result.status).toBe(404);expect(deps.db.FamilyDB.saveTask).not.toHaveBeenCalled();}));
it('rejects reading another user private notification without mutation',()=>fixture(async({send,deps}:any)=>{expect((await send('/api/notifications/private-notification/read',UserRole.CHILD,{})).status).toBe(404);expect(deps.db.FamilyDB.markNotificationRead).not.toHaveBeenCalled();}));

it('keeps guest task editing read-only while preserving guest shared comments',()=>fixture(async({send,deps}:any)=>{expect((await send('/api/tasks',UserRole.GUEST,{id:'task-guest',title:'synthetic tamper'})).status).toBe(403);expect(deps.db.FamilyDB.saveTask).not.toHaveBeenCalled();expect((await send('/api/tasks/task-shared/comments',UserRole.GUEST,{content:'synthetic'})).status).toBe(200);}));
for(const kind of ['plan','document'])for(const method of ['POST','DELETE'])for(const target of ['private','missing'])it(`rejects ${target} ${kind} ${method} without mutation`,()=>fixture(async({send,deps}:any)=>{
  const id=target==='private'?kind+'-child':'absent';const result=await send('/api/'+kind+'s'+(method==='DELETE'?'/'+id:''),UserRole.MEMBER,method==='POST'?{id,title:'synthetic tamper'}:undefined,method);expect(result.status).toBe(404);expect(deps.db.FamilyDB[method==='POST'?'save'+kind[0].toUpperCase()+kind.slice(1):'delete'+kind[0].toUpperCase()+kind.slice(1)]).not.toHaveBeenCalled();
}));
it('preserves own task editing and authorized shared note editing',()=>fixture(async({send,deps}:any)=>{expect((await send('/api/tasks',UserRole.CHILD,{id:'task-child',title:'synthetic own'})).status).toBe(200);expect((await send('/api/notes',UserRole.MEMBER,{id:'note-shared',title:'synthetic shared'})).status).toBe(200);expect(deps.db.FamilyDB.saveTask).toHaveBeenCalledOnce();expect(deps.db.FamilyDB.saveNote).toHaveBeenCalledOnce();}));
it('preserves authorized notification read membership',()=>fixture(async({send,deps}:any)=>{expect((await send('/api/notifications/shared-notification/read',UserRole.CHILD,{})).status).toBe(200);expect((await send('/api/notifications/private-notification/read',UserRole.MEMBER,{})).status).toBe(200);expect(deps.db.FamilyDB.markNotificationRead).toHaveBeenCalledTimes(2);}));

it('rechecks revocation before private context and provider access after SDK loading',()=>fixture(async({send,deps}:any)=>{
  const verify=deps.auth.verify.bind(deps.auth);let first=true;
  vi.spyOn(deps.auth,'verify').mockImplementation((token:any)=>{const user=verify(token);if(first){first=false;deps.auth.logout(token);}return user;});
  expect((await send('/api/assistant/chat',UserRole.MEMBER,{message:'synthetic'})).status).toBe(401);expect(generate).not.toHaveBeenCalled();
}));
it('rejects an assistant result if its session was revoked during the provider wait',()=>fixture(async({send,deps,tokens}:any)=>{
  let finish!:(value:any)=>void;generate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const pending=send('/api/assistant/chat',UserRole.MEMBER,{message:'synthetic'});
  await vi.waitFor(()=>expect(generate).toHaveBeenCalledOnce());deps.auth.logout(tokens[UserRole.MEMBER]);finish({text:'{"reply":"synthetic private reply","actions":[]}'});
  const result=await pending;expect(result.status).toBe(401);expect(JSON.stringify(result.body)).not.toContain('private reply');
}));
it('does not widen the existing note write-role grant for a nonauthor admin',()=>fixture(async({send,deps}:any)=>{expect((await send('/api/notes',UserRole.ADMIN,{id:'note-child',title:'synthetic'})).status).toBe(403);expect(deps.db.FamilyDB.saveNote).not.toHaveBeenCalled();}));

it('does not redispatch captured context after session revocation during provider backoff',()=>fixture(async({send,deps,tokens}:any)=>{
  generate.mockRejectedValueOnce(new Error('429 synthetic overload'));
  const pending=send('/api/assistant/chat',UserRole.MEMBER,{message:'synthetic'});
  await vi.waitFor(()=>expect(generate).toHaveBeenCalledOnce());deps.auth.logout(tokens[UserRole.MEMBER]);
  const result=await pending;expect(result.status).toBe(401);expect(generate).toHaveBeenCalledOnce();expect(JSON.stringify(result.body)).not.toContain('synthetic private');
}));
it('does not redispatch a shared plan after visibility revocation during provider backoff',()=>fixture(async({send,plans}:any)=>{
  const plan=plans.find((row:any)=>row.id==='plan-shared');plan.creatorId=UserRole.ADMIN;
  generate.mockRejectedValueOnce(new Error('429 synthetic overload'));
  const pending=send('/api/assistant/chat',UserRole.MEMBER,{message:'synthetic'});
  await vi.waitFor(()=>expect(generate).toHaveBeenCalledOnce());plan.isShared=false;
  const result=await pending;expect(result.status).toBe(409);expect(generate).toHaveBeenCalledOnce();expect(JSON.stringify(result.body)).not.toContain('Synthetic shared plan');
}));
it.each(['plan','task'])('discards assistant replies after captured %s loses visibility while the session stays valid',kind=>fixture(async({send,plans,tasks,deps,tokens}:any)=>{
  const role=kind==='plan'?UserRole.MEMBER:UserRole.CHILD;
  const row=(kind==='plan'?plans:tasks).find((item:any)=>item.id===kind+'-shared');row.creatorId=UserRole.ADMIN;row.isShared=kind==='plan';row.assigneeId=role;
  let finish!:(value:any)=>void;generate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=send('/api/assistant/chat',role,{message:'synthetic'});await vi.waitFor(()=>expect(generate).toHaveBeenCalledOnce());
  expect(generate.mock.calls[0][0].contents).toContain(kind+'-shared');row.isShared=false;row.assigneeId=UserRole.ADMIN;
  expect(deps.auth.verify(tokens[role])).toBeTruthy();finish({text:'{"reply":"synthetic private reply","actions":[]}'});
  const result=await pending;expect(result.status).toBe(409);expect(JSON.stringify(result.body)).not.toContain('private reply');
}));
it('preserves assistant overload retry when the captured context remains authorized',()=>fixture(async({send}:any)=>{
  generate.mockRejectedValueOnce(new Error('429 synthetic overload'));
  expect((await send('/api/assistant/chat',UserRole.MEMBER,{message:'synthetic'})).status).toBe(200);expect(generate).toHaveBeenCalledTimes(2);
}));
