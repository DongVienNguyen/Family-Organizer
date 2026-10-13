import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {it,expect} from 'vitest';

// Exercise curl itself against owned synthetic loopback data. Scaling the transfer
// timeout preserves the production retry-budget ratio without a 60-second test.
it.each(['headers','library'])('SDK %s retries a timed-out transfer within the configured budget',async asset=>{
  const script=fs.readFileSync(new URL('../scripts/ci/Prepare-NodeSdk.ps1',import.meta.url),'utf8');
  const line=script.split(/\r?\n/).find(row=>row.startsWith('& curl.exe ')&&row.includes('--output $'+asset+' '))!;
  const option=(name:string)=>Number(line.match(new RegExp('--'+name+' ([0-9]+)(?: |$)'))?.[1]);
  const maxTime=option('max-time'),retryMaxTime=option('retry-max-time');
  expect(maxTime).toBe(60);expect(option('retry')).toBe(2);expect(option('retry-delay')).toBe(1);
  let requests=0;const timers=new Set<ReturnType<typeof setTimeout>>();
  const server=http.createServer((_request,response)=>{
    requests++;
    if(requests===1){const timer=setTimeout(()=>{timers.delete(timer);if(!response.destroyed)response.end('synthetic retry payload');},1250);timers.add(timer);}
    else response.end('synthetic retry payload');
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
    const address=server.address();if(!address||typeof address==='string')throw Error('Owned fixture port missing');
    const child=spawn(process.platform==='win32'?'curl.exe':'curl',['--disable','--fail','--noproxy','*','--max-time','1','--retry',String(option('retry')),'--retry-delay',String(option('retry-delay')),'--retry-max-time',String(retryMaxTime/maxTime),'--silent','--show-error','http://127.0.0.1:'+address.port],{stdio:['ignore','pipe','pipe'],windowsHide:true});
    let output='';child.stdout.on('data',data=>{output+=data.toString();if(output.length>1024)child.kill();});child.stderr.resume();
    const guard=setTimeout(()=>child.kill(),8000);
    try{
      const result=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
      expect(result).toEqual({code:0,signal:null});
      expect(requests).toBe(2);expect(output).toBe('synthetic retry payload');
    }finally{clearTimeout(guard);}
  }finally{
    for(const timer of timers)clearTimeout(timer);
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
