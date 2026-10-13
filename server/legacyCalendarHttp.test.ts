import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {createApp} from './app.js';
import {createAuth} from './auth.js';
import {NativeSessionStore} from './authStore.js';
import * as db from './db.js';
import * as ics from './icsFeed.js';
import {sqliteLoad,sqliteSave} from './sqlite.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';
async function fixture(work:(send:(route:string,role?:UserRole,payload?:unknown,method?:string)=>Promise<any>)=>Promise<void>){
 const state=sqliteLoad();state.users=Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic',avatarColor:'blue',createdAt:'2026-10-11T00:00:00Z'}));state.plans=[];state.activityLogs=[];state.notifications=[];sqliteSave(state);
 const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.ics=ics;deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-calendar-key'});
 const tokens=Object.fromEntries(state.users.map(user=>[user.role,deps.auth.issue(user)]));const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const send=(route:string,role?:UserRole,payload?:unknown,method?:string)=>new Promise<any>((resolve,reject)=>{const text=payload===undefined?'':JSON.stringify(payload);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false,method:method??(payload===undefined?'GET':'POST'),headers:{...(role?{Authorization:'Bearer '+tokens[role]}:{}),'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'x-request-id':randomUUID()}},res=>{let body='';res.on('data',part=>{body+=part;});res.on('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,body:res.headers['content-type']?.includes('application/json')?JSON.parse(body):body});}catch(error){reject(error);}});});req.setTimeout(5000,()=>req.destroy(Error('Synthetic HTTP deadline')));req.on('error',reject);req.end(text);});
 try{await work(send);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
it('persists recurring calendar fields through real create, owner edit and delete routes',()=>fixture(async send=>{
 const payload={title:'Synthetic lịch gia đình',description:'Synthetic Unicode ghi chú',startDate:'2026-10-14 09:30',endDate:'',isRecurring:true,recurrenceType:'weekly',recurrenceWeekdays:[1,3,5],isShared:true,color:'sky'};
 const created=await send('/api/plans',UserRole.CHILD,payload);expect(created.status).toBe(200);const first=created.body.plan;expect(first).toMatchObject({...payload,creatorId:UserRole.CHILD});expect((await send('/api/plans',UserRole.CHILD)).body.plans).toEqual([first]);expect(sqliteLoad().plans).toEqual([first]);
 const changed=await send('/api/plans',UserRole.CHILD,{...first,title:'Synthetic sửa lịch',endDate:'2026-12-31 00:00',recurrenceWeekdays:[2,4],isShared:false});expect(changed.status).toBe(200);expect(changed.body.plan).toMatchObject({id:first.id,createdAt:first.createdAt,creatorId:UserRole.CHILD,title:'Synthetic sửa lịch',endDate:'2026-12-31 00:00',recurrenceWeekdays:[2,4],isShared:false});expect(sqliteLoad().plans).toEqual([changed.body.plan]);
 const before=sqliteLoad();expect((await send('/api/plans',UserRole.CHILD,{...changed.body.plan,recurrenceWeekdays:[9]})).status).toBe(400);expect(sqliteLoad()).toEqual(before);
 expect((await send('/api/plans/'+first.id,UserRole.CHILD,undefined,'DELETE')).status).toBe(200);expect(sqliteLoad().plans).toEqual([]);expect((await send('/api/plans',UserRole.CHILD)).body.plans).toEqual([]);
}));
it('filters persisted private plans and refuses unauthorized writes without changing any rows',()=>fixture(async send=>{
 const state=sqliteLoad();const common={description:'',startDate:'2026-10-14 09:00',endDate:'',isRecurring:true,recurrenceType:'daily' as const,color:'sky',createdAt:'2026-10-11T00:00:00Z'};state.plans=[{...common,id:'synthetic-private',title:'Synthetic private',creatorId:UserRole.MEMBER,isShared:false},{...common,id:'synthetic-shared',title:'Synthetic shared',creatorId:UserRole.MEMBER,isShared:true}];sqliteSave(state);const before=sqliteLoad();
 for(const role of [UserRole.ADMIN,UserRole.MEMBER])expect((await send('/api/plans',role)).body.plans).toEqual(before.plans);
 for(const role of [UserRole.CHILD,UserRole.GUEST])expect((await send('/api/plans',role)).body.plans).toEqual([before.plans[1]]);
 for(const method of ['POST','DELETE']){expect((await send(method==='POST'?'/api/plans':'/api/plans/synthetic-private',UserRole.CHILD,method==='POST'?{id:'synthetic-private',title:'Synthetic forbidden'}:undefined,method)).status).toBe(404);expect((await send(method==='POST'?'/api/plans':'/api/plans/synthetic-shared',UserRole.CHILD,method==='POST'?{id:'synthetic-shared',title:'Synthetic forbidden'}:undefined,method)).status).toBe(403);}
 expect((await send('/api/plans',UserRole.GUEST,{title:'Synthetic forbidden'})).status).toBe(403);expect((await send('/api/plans')).status).toBe(401);expect(sqliteLoad()).toEqual(before);
 const edited=await send('/api/plans',UserRole.ADMIN,{...before.plans[0],title:'Synthetic administrator edit'});expect(edited.status).toBe(200);expect(edited.body.plan).toMatchObject({id:'synthetic-private',creatorId:UserRole.MEMBER,isShared:false,title:'Synthetic administrator edit'});expect(sqliteLoad().plans).toEqual([edited.body.plan,before.plans[1]]);
}));
it('serves the existing shared ICS subscription with real recurrence, escaping, headers and token refusals',()=>fixture(async send=>{
 const state=sqliteLoad(),common={description:'Synthetic line1\nline2',startDate:'2026-10-14 09:30',endDate:'2026-12-31 00:00',isRecurring:true,color:'sky',creatorId:UserRole.MEMBER,createdAt:'2026-10-11T00:00:00Z'};state.plans=[{...common,id:'synthetic-weekly',title:'Synthetic comma, semi; slash\\',isShared:true,recurrenceType:'weekly',recurrenceWeekdays:[1,3]},{...common,id:'synthetic-private',title:'Synthetic private secret',isShared:false,recurrenceType:'daily'}];sqliteSave(state);const before=sqliteLoad();
 expect((await send('/api/calendar/feed-info')).status).toBe(401);const info=await send('/api/calendar/feed-info',UserRole.MEMBER);expect(info.status).toBe(200);expect(info.body).toEqual({path:'/api/calendar.ics',token:ics.icsFeedToken()});
 const feed=await send('/api/calendar.ics?token='+info.body.token);expect(feed.status).toBe(200);expect(feed.headers['content-type']).toContain('text/calendar');expect(feed.headers['content-disposition']).toBe('inline; filename="family-calendar.ics"');expect(feed.headers['cache-control']).toBe('no-store');expect(feed.body).toBe(ics.buildIcsFeed());
 expect(feed.body).toContain('X-WR-TIMEZONE:Asia/Ho_Chi_Minh\r\n');expect(feed.body).toContain('DTSTART:20261014T093000\r\nDTEND:20261014T103000');expect(feed.body).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959');expect(feed.body).toContain('SUMMARY:Synthetic comma\\, semi\\; slash\\\\');expect(feed.body).toContain('DESCRIPTION:Synthetic line1\\nline2');expect(feed.body).not.toContain('Synthetic private secret');expect(feed.body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
 for(const query of ['', '?token=synthetic-invalid','?token[]=synthetic-invalid']){const refused=await send('/api/calendar.ics'+query);expect(refused.status).toBe(401);expect(refused.body).toBe('Invalid token');}expect(sqliteLoad()).toEqual(before);
}));
