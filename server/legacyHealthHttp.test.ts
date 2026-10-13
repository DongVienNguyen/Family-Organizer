import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {createApp} from './app.js';
import {createAuth} from './auth.js';
import {NativeSessionStore} from './authStore.js';
import * as db from './db.js';
import {sqliteLoad,sqliteSave} from './sqlite.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';
async function fixture(work:(send:(route:string,role:UserRole,payload?:unknown,method?:string)=>Promise<any>)=>Promise<void>){
 const state=sqliteLoad();state.users=Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic',avatarColor:'blue',createdAt:'2026-10-11T00:00:00Z'}));state.medications=[];state.medicationLogs=[];state.vaccinations=[];state.growthRecords=[];state.healthProfiles=[];state.activityLogs=[];state.notifications=[];sqliteSave(state);
 const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-health-key'});
 const tokens=Object.fromEntries(state.users.map(user=>[user.role,deps.auth.issue(user)]));const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const send=(route:string,role:UserRole,payload?:unknown,method?:string)=>new Promise<any>((resolve,reject)=>{const text=payload===undefined?'':JSON.stringify(payload);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false,method:method??(payload===undefined?'GET':'POST'),headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'x-request-id':randomUUID()}},res=>{let body='';res.on('data',part=>{body+=part;});res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(body)});}catch(error){reject(error);}});});req.setTimeout(5000,()=>req.destroy(Error('Synthetic HTTP deadline')));req.on('error',reject);req.end(text);});
 try{await work(send);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}

// Characterize existing real HTTP/SQLite care flows. No provider delivery or job start.
it('persists medication edits and one dose record through taken, skipped and clear',()=>fixture(async send=>{
 const created=await send('/api/medications',UserRole.ADMIN,{name:' Synthetic medicine ',patientId:UserRole.CHILD,dosage:'Synthetic dose',times:['08:00','20:00'],startDate:'2026-10-11',isActive:true});expect(created.status).toBe(200);const first=created.body.medication;expect(first).toMatchObject({name:'Synthetic medicine',patientId:UserRole.CHILD,times:['08:00','20:00'],isActive:true});
 const edited=await send('/api/medications',UserRole.MEMBER,{...first,dosage:'Synthetic revised dose',isActive:false});expect(edited.status).toBe(200);expect(edited.body.medication).toMatchObject({id:first.id,createdAt:first.createdAt,dosage:'Synthetic revised dose',isActive:false});expect(sqliteLoad().medications).toEqual([edited.body.medication]);
 const dose={medicationId:first.id,date:'2026-10-12',time:'08:00',status:'taken',notes:'Synthetic log'};const taken=await send('/api/medications/logs',UserRole.ADMIN,dose);expect(taken.status).toBe(200);expect(taken.body).toMatchObject({cleared:false,log:{medicationId:first.id,patientId:UserRole.CHILD,date:dose.date,time:dose.time,status:'taken',loggedById:UserRole.ADMIN}});
 const skipped=await send('/api/medications/logs',UserRole.MEMBER,{...dose,status:'skipped'});expect(skipped.status).toBe(200);expect(skipped.body.log).toMatchObject({id:taken.body.log.id,status:'skipped',loggedById:UserRole.MEMBER});expect((await send('/api/medications/logs?since=2026-10-12',UserRole.ADMIN)).body.logs).toEqual([skipped.body.log]);expect(sqliteLoad().medicationLogs).toEqual([skipped.body.log]);expect((await send('/api/medications/logs?since=2026-10-13',UserRole.ADMIN)).body.logs).toEqual([]);
 const before=sqliteLoad();expect((await send('/api/medications/logs',UserRole.ADMIN,{...dose,status:'foreign'})).status).toBe(400);expect(sqliteLoad()).toEqual(before);
 expect((await send('/api/medications/logs',UserRole.ADMIN,{...dose,status:'none'})).body).toEqual({log:null,cleared:true});expect(sqliteLoad().medicationLogs).toEqual([]);expect((await send('/api/medications/logs',UserRole.ADMIN,{...dose,status:'none'})).body).toEqual({log:null,cleared:false});expect((await send('/api/medications/'+first.id,UserRole.ADMIN,undefined,'DELETE')).status).toBe(200);expect(sqliteLoad().medications).toEqual([]);
}));
it('preserves vaccination state changes and growth measurements through real SQLite',()=>fixture(async send=>{
 const created=await send('/api/child-health/vaccinations',UserRole.ADMIN,{childId:UserRole.CHILD,name:' Synthetic vaccine ',doseLabel:'Synthetic first',scheduledDate:'2026-10-15',status:'scheduled'});expect(created.status).toBe(200);const first=created.body.vaccination;expect(first).toMatchObject({childId:UserRole.CHILD,name:'Synthetic vaccine',status:'scheduled',scheduledDate:'2026-10-15'});
 const done=await send('/api/child-health/vaccinations',UserRole.MEMBER,{...first,status:'done',doneDate:'2026-10-15'});expect(done.status).toBe(200);expect(done.body.vaccination).toMatchObject({id:first.id,createdAt:first.createdAt,status:'done',doneDate:'2026-10-15'});
 const skipped=await send('/api/child-health/vaccinations',UserRole.ADMIN,{...done.body.vaccination,status:'skipped',note:'Synthetic change'});expect(skipped.status).toBe(200);expect(skipped.body.vaccination).toMatchObject({id:first.id,status:'skipped',note:'Synthetic change'});expect(sqliteLoad().vaccinations).toEqual([skipped.body.vaccination]);
 const growth=await send('/api/child-health/growth',UserRole.ADMIN,{childId:UserRole.CHILD,date:'2026-10-12',heightCm:'150',weightKg:'45',note:'Synthetic measurement'});expect(growth.status).toBe(200);expect(growth.body.record).toMatchObject({heightCm:150,weightKg:45,date:'2026-10-12',childId:UserRole.CHILD});
 const updated=await send('/api/child-health/growth',UserRole.MEMBER,{...growth.body.record,weightKg:46});expect(updated.status).toBe(200);expect(updated.body.record).toMatchObject({id:growth.body.record.id,createdAt:growth.body.record.createdAt,heightCm:150,weightKg:46});expect(sqliteLoad().growthRecords).toEqual([updated.body.record]);
 expect((await send('/api/child-health',UserRole.ADMIN)).body).toEqual({vaccinations:[skipped.body.vaccination],growthRecords:[updated.body.record],healthProfiles:[]});
 for(const value of [0,-1,'foreign']){const before=sqliteLoad();expect((await send('/api/child-health/growth',UserRole.ADMIN,{childId:UserRole.CHILD,date:'2026-10-12',heightCm:value})).status).toBe(400);expect(sqliteLoad()).toEqual(before);}
 expect((await send('/api/child-health/growth/'+growth.body.record.id,UserRole.ADMIN,undefined,'DELETE')).status).toBe(200);expect((await send('/api/child-health/vaccinations/'+first.id,UserRole.ADMIN,undefined,'DELETE')).status).toBe(200);expect(sqliteLoad().growthRecords).toEqual([]);expect(sqliteLoad().vaccinations).toEqual([]);
}));
it('keeps one emergency profile per member with trimmed bounded contacts',()=>fixture(async send=>{
 const first=await send('/api/child-health/emergency',UserRole.ADMIN,{userId:UserRole.CHILD,bloodType:' O+ ',allergies:' Synthetic allergy ',emergencyContacts:[{name:' Synthetic contact ',phone:' 0000000000 ',relation:' Synthetic guardian '},{name:'',phone:'0000'}]});expect(first.status).toBe(200);expect(first.body.profile).toMatchObject({id:'hp_'+UserRole.CHILD,userId:UserRole.CHILD,bloodType:'O+',allergies:'Synthetic allergy',emergencyContacts:[{name:'Synthetic contact',phone:'0000000000',relation:'Synthetic guardian'}]});
 const updated=await send('/api/child-health/emergency',UserRole.MEMBER,{userId:UserRole.CHILD,allergies:'Synthetic edited',emergencyContacts:Array.from({length:7},(_,i)=>({name:'Synthetic '+i,phone:'0000000000'}))});expect(updated.status).toBe(200);expect(updated.body.profile).toMatchObject({id:first.body.profile.id,createdAt:first.body.profile.createdAt,allergies:'Synthetic edited'});expect(updated.body.profile.emergencyContacts).toHaveLength(5);expect(sqliteLoad().healthProfiles).toEqual([updated.body.profile]);
 const before=sqliteLoad();expect((await send('/api/child-health/emergency',UserRole.ADMIN,{userId:'synthetic-missing-patient'})).status).toBe(400);expect(sqliteLoad()).toEqual(before);
}));
for(const role of [UserRole.CHILD,UserRole.GUEST])it('limits actual patient reads and rejects care writes for '+role,()=>fixture(async send=>{
 for(const patient of [role,UserRole.MEMBER]){
  expect((await send('/api/medications',UserRole.ADMIN,{name:'Synthetic '+patient,patientId:patient,times:['08:00']})).status).toBe(200);
  expect((await send('/api/child-health/vaccinations',UserRole.ADMIN,{childId:patient,name:'Synthetic '+patient,status:'scheduled'})).status).toBe(200);
  expect((await send('/api/child-health/growth',UserRole.ADMIN,{childId:patient,date:'2026-10-12',weightKg:45})).status).toBe(200);
  expect((await send('/api/child-health/emergency',UserRole.ADMIN,{userId:patient,allergies:'Synthetic '+patient})).status).toBe(200);
 }
 const state=sqliteLoad();expect(state.medications).toHaveLength(2);const own=(rows:any[],key:string)=>rows.filter(row=>row[key]===role);
 expect((await send('/api/medications',role)).body.medications).toEqual(own(state.medications,'patientId'));expect((await send('/api/child-health',role)).body).toEqual({vaccinations:own(state.vaccinations,'childId'),growthRecords:own(state.growthRecords,'childId'),healthProfiles:own(state.healthProfiles,'userId')});
 expect((await send('/api/medications/logs',role)).status).toBe(403);
 for(const route of ['/api/medications','/api/medications/logs','/api/child-health/emergency','/api/child-health/vaccinations','/api/child-health/growth'])expect((await send(route,role,{id:state.medications[0].id,patientId:role,childId:role,userId:role,name:'Synthetic forbidden'})).status,route).toBe(403);
 for(const route of ['/api/medications/'+state.medications[0].id,'/api/child-health/vaccinations/'+state.vaccinations[0].id,'/api/child-health/growth/'+state.growthRecords[0].id])expect((await send(route,role,undefined,'DELETE')).status,route).toBe(403);
 expect(sqliteLoad()).toEqual(state);
}));
