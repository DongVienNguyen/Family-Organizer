import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {it,expect,vi} from 'vitest';
import {createApp} from './app.js';
import {createAuth} from './auth.js';
import {NativeSessionStore} from './authStore.js';
import * as db from './db.js';
import {sqliteLoad,sqliteSave} from './sqlite.js';
import {syntheticDependencies} from '../tests/app-fixture.js';
import {UserRole} from '../src/types.js';
async function fixture(work:(send:(route:string,role:UserRole,payload?:unknown,method?:string,requestId?:string)=>Promise<any>)=>Promise<void>){
 const state=sqliteLoad();state.users=Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic',avatarColor:'blue',createdAt:'2026-10-11T00:00:00Z'}));state.transactions=[];state.budgets=[];state.recurringBills=[];state.savingsGoals=[];state.debts=[];state.assets=[];state.activityLogs=[];state.notifications=[];sqliteSave(state);
 const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-shopping-key'});
 const tokens=Object.fromEntries(state.users.map(user=>[user.role,deps.auth.issue(user)]));const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const send=(route:string,role:UserRole,payload?:unknown,method?:string,requestId=randomUUID())=>new Promise<any>((resolve,reject)=>{const text=payload===undefined?'':JSON.stringify(payload);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false,method:method??(payload===undefined?'GET':'POST'),headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'x-request-id':requestId}},res=>{let body='';res.on('data',part=>{body+=part;});res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(body)});}catch(error){reject(error);}});});req.on('error',reject);req.end(text);});
 try{await work(send);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}

// These use actual HTTP/auth/SQLite. Removing adult guards, changing creator
// ownership, losing payment/contribution history, or timestamp ID collisions
// breaks the assertions. Providers/jobs never start in this fixture.
it('keeps two separately accepted financial entries created in the same millisecond',()=>fixture(async send=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now());
 try{const one=await send('/api/finance',UserRole.ADMIN,{type:'income',amount:100,description:'Synthetic income',date:'2026-10-12'});const two=await send('/api/finance',UserRole.MEMBER,{type:'expense',amount:30,description:'Synthetic expense',date:'2026-10-12'});expect(one.status).toBe(200);expect(two.status,JSON.stringify(two.body)).toBe(200);expect(one.body.transaction.id).not.toBe(two.body.transaction.id);expect((await send('/api/finance',UserRole.ADMIN)).body.transactions).toEqual(expect.arrayContaining([one.body.transaction,two.body.transaction]));}finally{clock.mockRestore();}
}));
it('keeps distinct same-millisecond budgets',()=>fixture(async send=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now());
 try{for(const category of ['food','utilities']){const result=await send('/api/finance/budgets',UserRole.ADMIN,{month:'2026-10',category,limit:100});expect(result.status,JSON.stringify(result.body)).toBe(200);}expect((await send('/api/finance/budgets',UserRole.ADMIN)).body.budgets).toHaveLength(2);}finally{clock.mockRestore();}
}));
it('keeps distinct same-millisecond recurring bills',()=>fixture(async send=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now());
 try{for(const title of ['Synthetic electricity','Synthetic water']){const result=await send('/api/finance/recurring-bills',UserRole.MEMBER,{title,amount:10,nextDueDate:'2026-10-12'});expect(result.status,JSON.stringify(result.body)).toBe(200);}expect((await send('/api/finance/recurring-bills',UserRole.ADMIN)).body.recurringBills).toHaveLength(2);}finally{clock.mockRestore();}
}));
it('preserves creator and original creation timestamp when another adult edits an entry',()=>fixture(async send=>{
 const created=await send('/api/finance',UserRole.MEMBER,{type:'expense',amount:100,description:'Synthetic rice',date:'2026-10-11'});expect(created.status).toBe(200);const old=created.body.transaction;
 const edited=await send('/api/finance',UserRole.ADMIN,{...old,amount:120,description:'Synthetic edited rice',creatorId:UserRole.ADMIN,createdAt:'2000-01-01'});expect(edited.status).toBe(200);expect(edited.body.transaction).toMatchObject({id:old.id,creatorId:UserRole.MEMBER,createdAt:old.createdAt,amount:120});expect((await send('/api/finance',UserRole.MEMBER)).body.transactions).toEqual([edited.body.transaction]);
 expect((await send('/api/finance/'+old.id,UserRole.ADMIN,undefined,'DELETE')).status).toBe(200);expect((await send('/api/finance',UserRole.MEMBER)).body.transactions).toEqual([]);
}));
it('updates one month/category budget and carries it forward without duplicating stored limits',()=>fixture(async send=>{
 const old=await send('/api/finance/budgets',UserRole.ADMIN,{month:'2026-10',category:'food',limit:100});expect(old.status).toBe(200);const updated=await send('/api/finance/budgets',UserRole.MEMBER,{month:'2026-10',category:'food',limit:150});expect(updated.status).toBe(200);expect(updated.body.budget.id).toBe(old.body.budget.id);
 for(let attempt=0;attempt<2;attempt++)expect((await send('/api/finance/budgets/carry-forward',UserRole.ADMIN,{month:'2026-11'})).status).toBe(200);
 expect((await send('/api/finance/budgets',UserRole.MEMBER)).body.budgets).toEqual(expect.arrayContaining([expect.objectContaining({month:'2026-10',category:'food',limit:150}),expect.objectContaining({month:'2026-11',category:'food',limit:150})]));expect(sqliteLoad().budgets).toHaveLength(2);
}));
it('pays a recurring bill beside another same-millisecond transaction without overwriting it',()=>fixture(async send=>{
 const created=await send('/api/finance/recurring-bills',UserRole.ADMIN,{title:'Synthetic monthly bill',amount:25,nextDueDate:'2026-10-12',frequency:'monthly'});expect(created.status).toBe(200);const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now());
 try{expect((await send('/api/finance',UserRole.ADMIN,{type:'income',amount:100,description:'Synthetic wages'})).status).toBe(200);const paymentCommand=randomUUID();const paymentRoute='/api/finance/recurring-bills/'+created.body.bill.id+'/pay';const paid=await send(paymentRoute,UserRole.MEMBER,{},'POST',paymentCommand);expect(paid.status,JSON.stringify(paid.body)).toBe(200);expect(paid.body.bill).toMatchObject({id:created.body.bill.id,nextDueDate:'2026-11-12'});expect(paid.body.transaction).toMatchObject({amount:25,type:'expense',creatorId:UserRole.MEMBER});expect((await send('/api/finance',UserRole.ADMIN)).body.transactions).toHaveLength(2);const after=sqliteLoad();expect(await send(paymentRoute,UserRole.MEMBER,{},'POST',paymentCommand)).toEqual(paid);expect(sqliteLoad()).toEqual(after);expect(sqliteLoad().recurringBills[0].nextDueDate).toBe('2026-11-12');expect(await send(paymentRoute,UserRole.MEMBER,{note:'Synthetic ignored metadata'},'POST',paymentCommand)).toEqual(paid);expect((await send(paymentRoute.replace(created.body.bill.id,'synthetic-different-bill'),UserRole.MEMBER,{},'POST',paymentCommand)).status).toBe(409);expect(sqliteLoad()).toEqual(after);}finally{clock.mockRestore();}
}));
it('retains debt payments on edit and reopens settlement when the full payment is removed',()=>fixture(async send=>{
 const created=await send('/api/finance/debts',UserRole.ADMIN,{counterparty:'Synthetic lender',amount:100,direction:'borrowed'});expect(created.status).toBe(200);const id=created.body.debt.id;
 const paid=await send('/api/finance/debts/'+id+'/payments',UserRole.MEMBER,{amount:100,date:'2026-10-12'});expect(paid.status,JSON.stringify(paid.body)).toBe(200);expect(paid.body.debt.isSettled).toBe(true);const payment=paid.body.debt.payments[0];expect(payment).toMatchObject({amount:100,byId:UserRole.MEMBER});
 const edit=await send('/api/finance/debts',UserRole.MEMBER,{id,counterparty:'Synthetic updated lender',amount:100,direction:'borrowed',payments:[]});expect(edit.status).toBe(200);expect(edit.body.debt.payments).toEqual([payment]);
 const removed=await send('/api/finance/debts/'+id+'/payments/'+payment.id,UserRole.ADMIN,undefined,'DELETE');expect(removed.status).toBe(200);expect(removed.body.debt).toMatchObject({isSettled:false,payments:[]});expect(sqliteLoad().transactions).toEqual([]);
 expect((await send('/api/finance/debts/'+id,UserRole.MEMBER,undefined,'DELETE')).status).toBe(200);expect((await send('/api/finance/debts',UserRole.ADMIN)).body.debts).toEqual([]);
}));
it('shares savings contributions without treating them as financial transaction postings',()=>fixture(async send=>{
 const created=await send('/api/finance/savings-goals',UserRole.ADMIN,{name:'Synthetic school',targetAmount:1000,isShared:true});expect(created.status).toBe(200);const id=created.body.goal.id;
 const added=await send('/api/finance/savings-goals/'+id+'/contributions',UserRole.MEMBER,{amount:200,date:'2026-10-12'});expect(added.status).toBe(200);const contribution=added.body.goal.contributions[0];expect(contribution).toMatchObject({amount:200,byId:UserRole.MEMBER});
 const edit=await send('/api/finance/savings-goals',UserRole.ADMIN,{id,name:'Synthetic edited school',targetAmount:1500,contributions:[]});expect(edit.status).toBe(200);expect(edit.body.goal.contributions).toEqual([contribution]);expect((await send('/api/finance/savings-goals',UserRole.MEMBER)).body.savingsGoals).toEqual([edit.body.goal]);
 expect((await send('/api/finance/savings-goals/'+id+'/contributions/'+contribution.id,UserRole.MEMBER,undefined,'DELETE')).body.goal.contributions).toEqual([]);expect(sqliteLoad().transactions).toEqual([]);
}));
it('preserves asset creator on adult edits and supports deletion',()=>fixture(async send=>{
 const created=await send('/api/finance/assets',UserRole.MEMBER,{name:'Synthetic family bicycle',type:'vehicle',quantity:1,estimatedValue:500,currency:'VND'});expect(created.status).toBe(200);const old=created.body.asset;
 const edited=await send('/api/finance/assets',UserRole.ADMIN,{...old,name:'Synthetic updated bicycle',estimatedValue:450,createdById:UserRole.ADMIN,createdAt:'2000-01-01'});expect(edited.status).toBe(200);expect(edited.body.asset).toMatchObject({id:old.id,createdById:UserRole.MEMBER,createdAt:old.createdAt,estimatedValue:450});expect((await send('/api/finance/assets',UserRole.MEMBER)).body.assets).toEqual([edited.body.asset]);
 expect((await send('/api/finance/assets/'+old.id,UserRole.MEMBER,undefined,'DELETE')).status).toBe(200);expect((await send('/api/finance/assets',UserRole.ADMIN)).body.assets).toEqual([]);
}));
for(const role of [UserRole.CHILD,UserRole.GUEST])it('denies every legacy financial collection to '+role,()=>fixture(async send=>{
 for(const route of ['/api/finance','/api/finance/budgets','/api/finance/recurring-bills','/api/finance/savings-goals','/api/finance/debts','/api/finance/assets'])expect((await send(route,role)).status,route).toBe(403);
 const before=sqliteLoad();for(const route of ['/api/finance','/api/finance/budgets','/api/finance/recurring-bills','/api/finance/savings-goals','/api/finance/debts','/api/finance/assets'])expect((await send(route,role,{description:'Synthetic forbidden',amount:100})).status,route).toBe(403);expect(sqliteLoad()).toEqual(before);
}));

for(const [route,payload,collection] of [
 ['/api/finance',{type:'income',amount:100,description:'Synthetic replay'},'transactions'],
 ['/api/finance/budgets',{month:'2026-10',category:'food',limit:100},'budgets'],
 ['/api/finance/recurring-bills',{title:'Synthetic replay bill',amount:100,nextDueDate:'2026-10-12'},'recurringBills'],
] as const)it('replays '+route+' without new IDs, duplicate records or logs',()=>fixture(async send=>{
 const command=randomUUID();const first=await send(route,UserRole.ADMIN,payload,'POST',command);expect(first.status).toBe(200);const before=sqliteLoad();expect(await send(route,UserRole.ADMIN,payload,'POST',command)).toEqual(first);expect(sqliteLoad()).toEqual(before);expect((sqliteLoad()[collection] as any[])).toHaveLength(1);
 expect((await send(route,UserRole.ADMIN,{...payload,amount:999,limit:999},'POST',command)).status).toBe(409);expect(sqliteLoad()).toEqual(before);
}));
