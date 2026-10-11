import { createRequire } from 'node:module';
import http from 'node:http';
import { once } from 'node:events';
import { expect,it } from 'vitest';
import express from 'express';

// Probe the exact transitive dependencies consumed by Express, including nested installs.
const fromExpress=createRequire(createRequire(import.meta.url).resolve('express'));
const proxyAddr=fromExpress('proxy-addr') as {compile:(subnets:string[]) => (address:string)=>boolean};
const qs=fromExpress('qs') as {parse:(value:string,options:Record<string,unknown>)=>unknown;stringify:(value:unknown)=>string};

const unsafeSubnets=[['::/64'],['2001:db8::/32','::/64'],['::ffff:192.0.2.0/64'],['2001:db8::/32','::ffff:192.0.2.0/64']];
for(const subnets of unsafeSubnets){
  it.each(['198.51.100.8','::ffff:198.51.100.8'])('does not trust IPv4 candidate %s through '+JSON.stringify(subnets),candidate=>{
    expect(proxyAddr.compile(subnets)(candidate)).toBe(false);
  });
}
it.each([['192.0.2.0/24'],['2001:db8::/32','::ffff:192.0.2.0/120']])('preserves correctly scoped IPv4 trust %j',(...subnets)=>{
  const trust=proxyAddr.compile(subnets);
  expect(trust('192.0.2.8')).toBe(true);expect(trust('::ffff:192.0.2.8')).toBe(true);
  expect(trust('198.51.100.8')).toBe(false);expect(trust('::ffff:198.51.100.8')).toBe(false);
});
it('preserves native IPv6 trust while refusing a different native subnet',()=>{
  const trust=proxyAddr.compile(['2001:db8:1::/48']);
  expect(trust('2001:db8:1::12')).toBe(true);expect(trust('2001:db8:2::12')).toBe(false);
});
it.each([{plainObjects:true},{allowPrototypes:true}])('round-trips an untrusted constructor.isBuffer query with %j',options=>{
  const input=qs.parse('x[constructor][isBuffer]=y',options);
  expect(()=>qs.stringify(input)).not.toThrow();
  expect(qs.stringify(input)).toBe('x%5Bconstructor%5D%5BisBuffer%5D=y');
});
it('enforces the comma array bound before wrapping a bracket key',()=>{
  expect(()=>qs.parse('a[]=1,2,3,4',{comma:true,arrayLimit:3,throwOnLimitExceeded:true})).toThrow(RangeError);
  expect(qs.parse('a[]=1,2,3',{comma:true,arrayLimit:3,throwOnLimitExceeded:true})).toEqual({a:[['1','2','3']]});
});
async function readExpressIp(subnets:string[],forwarded:string,options:{deadlineMs?:number;reply?:express.RequestHandler;onServer?:(server:http.Server)=>void}={}){
  const app=express();app.set('trust proxy',subnets);app.get('/',options.reply??((req,res)=>res.json({ip:req.ip})));
  const server=http.createServer(app).listen(0,'127.0.0.1');await once(server,'listening');options.onServer?.(server);
  try{
    return await new Promise<string>((resolve,reject)=>{
      let deadline:ReturnType<typeof setTimeout>|undefined;
      const fail=(error:Error)=>{if(deadline)clearTimeout(deadline);req.destroy();reject(error);};
      const req=http.get({hostname:'127.0.0.1',port:(server.address() as {port:number}).port,path:'/',agent:false,headers:{'X-Forwarded-For':forwarded}},res=>{
        res.once('error',fail);res.once('aborted',()=>fail(new Error('HTTP probe response aborted')));
        let text='';res.on('data',bytes=>{text+=bytes;});res.once('end',()=>{
          if(deadline)clearTimeout(deadline);
          try{expect(res.statusCode).toBe(200);resolve(JSON.parse(text).ip);}catch(error){fail(error as Error);}
        });
      });req.once('error',fail);
      deadline=setTimeout(()=>fail(new Error('HTTP probe request deadline exceeded')),options.deadlineMs??5000);
    });
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
it.each(['198.51.100.8','::ffff:198.51.100.8'])('uses the real socket when IPv6-only proxy trust receives spoofed %s',async forwarded=>{
  expect(await readExpressIp(['::/64'],forwarded)).toBe('127.0.0.1');
});
it('preserves an explicitly trusted loopback proxy and its client address',async()=>{
  expect(await readExpressIp(['127.0.0.1/32'],'192.0.2.8')).toBe('192.0.2.8');
});

it('rejects a delayed dependency response at the request deadline and closes its fixture',async()=>{
  let server:http.Server|undefined;
  await expect(readExpressIp(['127.0.0.1/32'],'192.0.2.8',{
    deadlineMs:75,onServer:value=>{server=value;},reply:(_req,res)=>{res.flushHeaders();setTimeout(()=>res.end('{"ip":"late"}'),300);},
  })).rejects.toThrow(/deadline/i);
  expect(server?.listening).toBe(false);
});
it('settles an aborted dependency response and closes its fixture',async()=>{
  let server:http.Server|undefined;let guard:ReturnType<typeof setTimeout>|undefined;
  const work=readExpressIp(['127.0.0.1/32'],'192.0.2.8',{
    deadlineMs:2000,onServer:value=>{server=value;},reply:(_req,res)=>{res.flushHeaders();setImmediate(()=>res.destroy());},
  });
  try{
    const outcome=await Promise.race([
      work.then(()=> 'unexpected success',error=>String(error.message)),
      new Promise<string>(resolve=>{guard=setTimeout(()=>resolve('fixture remained pending'),3000);}),
    ]);
    expect(outcome).toMatch(/response aborted|ECONNRESET|aborted/i);
    expect(server?.listening).toBe(false);
  }finally{
    if(guard)clearTimeout(guard);
    if(server?.listening){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  }
});
