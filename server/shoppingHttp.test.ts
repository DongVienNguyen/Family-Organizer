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
 const state=sqliteLoad();state.users=Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic',avatarColor:'blue',createdAt:'2026-10-11T00:00:00Z'}));state.shoppingItems=[];state.mealPlan=null;state.dishLibrary=[];state.activityLogs=[];state.notifications=[];sqliteSave(state);
 const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-shopping-key'});
 const tokens=Object.fromEntries(state.users.map(user=>[user.role,deps.auth.issue(user)]));const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const send=(route:string,role:UserRole,payload?:unknown,method?:string)=>new Promise<any>((resolve,reject)=>{const text=payload===undefined?'':JSON.stringify(payload);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false,method:method??(payload===undefined?'GET':'POST'),headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'x-request-id':randomUUID()}},res=>{let body='';res.on('data',part=>{body+=part;});res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(body)});}catch(error){reject(error);}});});req.on('error',reject);req.end(text);});
 try{await work(send);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
for(const payload of [{name:42},{name:'Synthetic item',quantity:42},{name:'Synthetic item',note:42},{name:'Synthetic item',cat:42},{id:42,name:'Synthetic item'}])it('rejects malformed shopping payload without changing data '+JSON.stringify(payload),()=>fixture(async send=>{const before=sqliteLoad();expect((await send('/api/shopping',UserRole.ADMIN,payload)).status).toBe(400);expect(sqliteLoad()).toEqual(before);}));
for(const role of Object.values(UserRole))it('preserves shared shopping create/edit/purchase/delete for '+role,()=>fixture(async send=>{
 const created=await send('/api/shopping',role,{name:'Synthetic HTTP rice',quantity:'1 kg'});expect(created.status).toBe(200);expect(created.body.item).toMatchObject({name:'Synthetic HTTP rice',creatorId:role,isPurchased:false});const id=created.body.item.id;
 expect((await send('/api/shopping',role,{id,quantity:'2 kg'})).status).toBe(200);
 const purchased=await send('/api/shopping/'+id+'/toggle',role,{});expect(purchased.status).toBe(200);expect(purchased.body.item).toMatchObject({id,quantity:'2 kg',isPurchased:true,purchasedById:role});
 expect((await send('/api/shopping',role)).body.shoppingItems).toHaveLength(1);
 expect((await send('/api/shopping/purchased',role,undefined,'DELETE')).body.removed).toBe(1);expect((await send('/api/shopping',role)).body.shoppingItems).toEqual([]);
}));
it('persists an offline random shared meal plan and supports preview without replacing it',()=>fixture(async send=>{
 const saved=await send('/api/shopping/meal-plan/random',UserRole.ADMIN,{adults:2,children:1,days:3,save:true});expect(saved.status).toBe(200);expect(saved.body.days).toHaveLength(3);expect(saved.body.groceries.length).toBeGreaterThan(0);
 const current=await send('/api/shopping/meal-plan/current',UserRole.CHILD);expect(current.status).toBe(200);expect(current.body.mealPlan).toMatchObject({adults:2,children:1,updatedById:UserRole.ADMIN,days:saved.body.days,groceries:saved.body.groceries});
 expect((await send('/api/shopping/meal-plan/random',UserRole.GUEST,{adults:1,children:0,days:1,save:false})).status).toBe(200);expect((await send('/api/shopping/meal-plan/current',UserRole.MEMBER)).body.mealPlan).toEqual(current.body.mealPlan);
 const before=sqliteLoad();expect((await send('/api/shopping/meal-plan/random',UserRole.ADMIN,{adults:0,children:0,save:true})).status).toBe(400);expect(sqliteLoad()).toEqual(before);
}));
