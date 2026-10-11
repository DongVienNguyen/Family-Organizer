import http from 'node:http';
import { once } from 'node:events';
import { createHmac,randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createApp } from './app.js';
import { createAuth,SESSION_TTL_MS } from './auth.js';
import { NativeSessionStore } from './authStore.js';
import * as db from './db.js';
import { syntheticDependencies } from '../tests/app-fixture.js';
import { withAppWriteTransaction } from './appStore.js';
import { UserRole } from '../src/types.js';
async function serve(work:(send:(route:string,body?:any,token?:string,extra?:Record<string,string>)=>Promise<any>,clock:{now:number},key:{value:string})=>Promise<void>){
  withAppWriteTransaction({actorId:'synthetic-auth',command:'synthetic:http-auth-reset',requestId:randomUUID(),payloadHash:'fixture'},tx=>{tx.legacy.users[0].passwordHash=db.hashPassword('admin123');tx.legacy.users[0].role=UserRole.ADMIN;tx.legacy.users[0].isDeleted=false;});
  const clock={now:Date.now()},key={value:'synthetic-http-key'},deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;
  deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=>key.value,now:()=>clock.now});
  const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);
  const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
  const send=(route:string,body?:any,token?:string,extra?:Record<string,string>)=>new Promise<any>((resolve,reject)=>{
    const text=body===undefined?undefined:JSON.stringify(body);const req=http.request({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,method:text?'POST':'GET',agent:false,headers:{...(text?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)}:{}),...(token?{Authorization:'Bearer '+token}:{}),...extra}},res=>{let content='';res.on('data',bytes=>{content+=bytes;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(content),headers:res.headers}));});req.on('error',reject);req.end(text);
  });
  try{await work(send,clock,key);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
const credentials={username:'admin',password:'admin123'};
it('requires one-time re-login instead of accepting a previously signed stateless token',()=>serve(async send=>{
  const user=db.FamilyDB.getUsers()[0],token=`${user.id}.${createHmac('sha256',db.getSessionSecret()).update(user.id).digest('hex')}`;
  expect((await send('/api/auth/me',undefined,token)).status).toBe(401);
}));
it('issues new opaque tokens, serves auth responses no-store and persists logout',()=>serve(async send=>{
  const login=await send('/api/auth/login',credentials);expect(login.status).toBe(200);expect(login.body.token).toMatch(/^fo1\./);expect(login.headers['cache-control']).toBe('no-store');
  expect((await send('/api/auth/me',undefined,login.body.token)).status).toBe(200);
  expect((await send('/api/auth/logout',{},login.body.token)).status).toBe(200);
  expect((await send('/api/auth/me',undefined,login.body.token)).status).toBe(401);
}));
it('rejects the same Bearer at its absolute expiry boundary',()=>serve(async(send,clock)=>{
  const login=await send('/api/auth/login',credentials);expect(login.status).toBe(200);clock.now+=SESSION_TTL_MS;
  expect((await send('/api/auth/me',undefined,login.body.token)).status).toBe(401);
}));
it('implements authenticated logout rather than retaining a revoked token',()=>serve(async send=>{
  const login=await send('/api/auth/login',credentials);expect(login.status).toBe(200);
  expect((await send('/api/auth/logout',{},login.body.token)).status).toBe(200);
  expect((await send('/api/auth/me',undefined,login.body.token)).status).toBe(401);
}));
it('changes a password atomically, invalidates the old session and permits the new credentials',()=>serve(async send=>{
  const login=await send('/api/auth/login',credentials);expect(login.status).toBe(200);
  expect((await send('/api/auth/change-password',{currentPassword:'admin123',newPassword:'synthetic-changed'},login.body.token)).status).toBe(200);
  expect((await send('/api/auth/me',undefined,login.body.token)).status).toBe(401);
  expect((await send('/api/auth/login',{username:'admin',password:'synthetic-changed'})).status).toBe(200);
}));
it('invalidates issued sessions immediately when the installation key rotates',()=>serve(async(send,_clock,key)=>{
  const login=await send('/api/auth/login',credentials);expect(login.status).toBe(200);key.value='synthetic-rotated-http-key';
  expect((await send('/api/auth/me',undefined,login.body.token)).status).toBe(401);
}));
it('invalidates a session after its administrator changes role while preserving the last-admin guard',()=>serve(async send=>{
  withAppWriteTransaction({actorId:'synthetic-auth',command:'synthetic:extra-admin',requestId:randomUUID(),payloadHash:'fixture'},tx=>{tx.legacy.users.push({...tx.legacy.users[0],id:randomUUID(),username:'synthetic-other-admin'});});
  const user=db.FamilyDB.getUsers()[0],login=await send('/api/auth/login',credentials);expect(login.status).toBe(200);
  expect((await send(`/api/users/${user.id}`,{role:'child'},login.body.token)).status).toBe(200);
  expect((await send('/api/auth/me',undefined,login.body.token)).status).toBe(401);
}));
it('keeps login throttling effective despite spoofed forwarded headers',()=>serve(async send=>{
  for(let i=0;i<8;i++)expect((await send('/api/auth/login',{username:'synthetic-missing',password:'bad'},undefined,{'X-Forwarded-For':`192.0.2.${i+1}`})).status).toBe(401);
  expect((await send('/api/auth/login',{username:'synthetic-missing',password:'bad'},undefined,{'X-Forwarded-For':'198.51.100.9'})).status).toBe(429);
}));

it('marks internal API data and authentication failures no-store',()=>serve(async send=>{
  const login=await send('/api/auth/login',credentials);expect(login.status).toBe(200);
  const users=await send('/api/users',undefined,login.body.token);expect(users.status).toBe(200);expect(users.headers['cache-control']).toBe('no-store');
  const denied=await send('/api/users');expect(denied.status).toBe(401);expect(denied.headers['cache-control']).toBe('no-store');
}));

it.each(['/api/realtime','/api/calendar.ics?token=synthetic'])('keeps a successful private %s response no-store',async route=>{
  const deps=syntheticDependencies({phase:'ready',storageWritable:true});deps.ics={icsFeedToken:()=> 'synthetic',isValidIcsToken:()=>true,buildIcsFeed:()=> 'BEGIN:VCALENDAR\nSUMMARY:Synthetic private appointment\nEND:VCALENDAR'};
  const handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!} as any,deps);
  const server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const received=await new Promise<any>((resolve,reject)=>{
      const req=http.get({hostname:'127.0.0.1',port:(server.address() as any).port,path:route,agent:false},res=>res.once('data',bytes=>{const result={status:res.statusCode,headers:res.headers,body:String(bytes)};res.destroy();resolve(result);}));req.on('error',reject);
    });
    expect(received.status).toBe(200);expect(received.body).toContain(route.includes('calendar')?'Synthetic private appointment':'init');expect(received.headers['cache-control']).toBe('no-store');expect(received.headers.vary).toContain('Authorization');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
});
