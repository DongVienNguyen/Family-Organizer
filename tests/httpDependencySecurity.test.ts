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
async function readExpressIp(subnets:string[],forwarded:string){
  const app=express();app.set('trust proxy',subnets);app.get('/',(req,res)=>res.json({ip:req.ip}));
  const server=http.createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
  try{
    return await new Promise<string>((resolve,reject)=>{
      const req=http.get({hostname:'127.0.0.1',port:(server.address() as {port:number}).port,path:'/',agent:false,headers:{'X-Forwarded-For':forwarded}},res=>{
        let text='';res.on('data',bytes=>{text+=bytes;});res.on('end',()=>{try{expect(res.statusCode).toBe(200);resolve(JSON.parse(text).ip);}catch(error){reject(error);}});
      });req.on('error',reject);
    });
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
it.each(['198.51.100.8','::ffff:198.51.100.8'])('uses the real socket when IPv6-only proxy trust receives spoofed %s',async forwarded=>{
  expect(await readExpressIp(['::/64'],forwarded)).toBe('127.0.0.1');
});
it('preserves an explicitly trusted loopback proxy and its client address',async()=>{
  expect(await readExpressIp(['127.0.0.1/32'],'192.0.2.8')).toBe('192.0.2.8');
});
