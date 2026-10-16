import {reserveSyntheticProxyPort} from './synthetic-proxy-port.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,X509Certificate} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {caddyRuntime,syntheticCaddyConfiguration,ownSyntheticProxyFixture,syntheticCaddyEnvironment,isSyntheticCertificateRefusal,syntheticCaddyFailureDiagnostic,observeSyntheticChildClose} from './caddy-contract.mjs';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../lib/native-paths.mjs';
const [executable,fixture,report,commitSha]=process.argv.slice(2);
try{assert.equal(process.argv.length,6);assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.match(commitSha??'',/^[a-f0-9]{40}$/);for(const file of [executable,fixture,report]){assert(isFullyQualifiedPath(file));assertNoLinkedAncestors(file);}assert(fs.statSync(path.dirname(report)).isDirectory());assert.equal(fs.existsSync(report),false);}catch{console.error('CADDY_NATIVE_REJECTED');process.exit(1);}
let child,childExit,childClose,backend,proxyReady=false,output='';const reserves=[],phases=[],requests=[];
let minimalEnv,trustStoreObservation;const portReservations=[];
const hashFile=file=>{const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536),hash=createHash('sha256');try{for(;;){const count=fs.readSync(fd,buffer,0,buffer.length,null);if(!count)break;hash.update(buffer.subarray(0,count));}return hash.digest('hex');}finally{buffer.fill(0);fs.closeSync(fd);}};
function native(args,name){const r=spawnSync(executable,args,{env:minimalEnv,timeout:15000,maxBuffer:65536,windowsHide:true});phases.push({name,exitCode:r.status,signal:r.signal});assert.equal(r.error,undefined);assert.equal(r.status,0);assert.equal(r.signal,null);return r.stdout.toString('utf8');}
const request=(secure,port,pathname,options={})=>new Promise((resolve,reject)=>{const operation=(secure?https:http).request({host:'127.0.0.1',port,path:pathname,method:options.method??'GET',servername:'localhost',ca:options.ca,headers:{Host:secure?'localhost:'+port:'127.0.0.1:'+port,...options.headers},agent:false},response=>{let body='';response.setEncoding('utf8');response.on('data',text=>{body+=text;if(body.length>4096)operation.destroy(Error('Synthetic body bound'));});response.on('end',()=>resolve({status:response.statusCode,body}));});operation.setTimeout(2000,()=>operation.destroy(Error('Synthetic request deadline')));operation.on('error',reject);operation.end();});
let failure,ownedFixture,diagnosticPhase='preflight';try{
 ownedFixture=ownSyntheticProxyFixture(fixture);
 minimalEnv=syntheticCaddyEnvironment(fixture,process.env);
 const stat=fs.lstatSync(executable);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=256*1024*1024);assert.equal(hashFile(executable),caddyRuntime.binarySha256);
 const header=Buffer.alloc(16384),fd=fs.openSync(executable,'r');try{assert(fs.readSync(fd,header,0,header.length,0)>64);assert.equal(header.toString('ascii',0,2),'MZ');const pe=header.readUInt32LE(60);assert(pe+6<header.length);assert.equal(header.readUInt32LE(pe),0x00004550);assert.equal(header.readUInt16LE(pe+4),0x8664);}finally{header.fill(0);fs.closeSync(fd);}
 const version=native(['version'],'version');assert.match(version,/^v2\.11\.7\b/);
 backend=http.createServer((incoming,response)=>{requests.push({pathname:incoming.url,forwardedFor:incoming.headers['x-forwarded-for'],forwardedProto:incoming.headers['x-forwarded-proto'],authorization:incoming.headers.authorization});response.writeHead(proxyReady?200:503,{'content-type':'text/plain','cache-control':'no-store'});response.end(proxyReady?'SYNTHETIC_PROXY_READY':'SYNTHETIC_PROXY_HELD');});
 backend.listen(0,'127.0.0.1');await once(backend,'listening');const backendPort=backend.address().port;
 reserves.push(await reserveSyntheticProxyPort());portReservations.push(reserves.at(-1).selection);
 const adminReservation=net.createServer();adminReservation.listen(0,'127.0.0.1');await once(adminReservation,'listening');reserves.push({port:adminReservation.address().port,close:()=>new Promise((resolve,reject)=>adminReservation.close(error=>error?reject(error):resolve()))});
 const [httpsPort,adminPort]=reserves.map(reservation=>reservation.port);const config=syntheticCaddyConfiguration({backendPort,httpsPort,adminPort,fixtureRoot:fixture});
 diagnosticPhase='configuration';
 const configFile=path.join(fixture,'synthetic.json');fs.writeFileSync(configFile,JSON.stringify(config));native(['validate','--config',configFile],'validate');
 for(const reservation of reserves)await reservation.close();reserves.length=0;
 diagnosticPhase='startup';
 child=spawn(executable,['run','--config',configFile],{env:minimalEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
 childClose=observeSyntheticChildClose(child);
 childExit=new Promise((resolve,reject)=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',reject);});childExit.catch(()=>{});
 for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes.toString('utf8');if(Buffer.byteLength(output)>65536)child.kill();});
 const caFile=path.join(fixture,'caddy storage','pki','authorities','synthetic','root.crt');const deadline=Date.now()+15000;let ca,held;
 while(Date.now()<deadline){assert.equal(child.exitCode,null,'Proxy exited before readiness');if(fs.existsSync(caFile)){ca=fs.readFileSync(caFile);try{held=await request(true,httpsPort,'/synthetic-readiness',{ca});if(held.status===503)break;}catch{}}await new Promise(resolve=>setTimeout(resolve,50));}
 assert(held&&held.status===503);assert.equal(held.body,'SYNTHETIC_PROXY_HELD');phases.push({name:'tls-held-backend-status',passed:true});
 diagnosticPhase='tls';
 proxyReady=true;const ready=await request(true,httpsPort,'/synthetic-ready',{ca,headers:{'X-Forwarded-For':'198.51.100.25','X-Forwarded-Proto':'http',Authorization:'Bearer synthetic-proxy-fixture'}});assert.equal(ready.status,200);assert.equal(ready.body,'SYNTHETIC_PROXY_READY');
 const observed=requests.at(-1);assert.equal(observed.pathname,'/synthetic-ready');assert.equal(observed.forwardedFor,'127.0.0.1');assert.equal(observed.forwardedProto,'https');assert.equal(observed.authorization,'Bearer synthetic-proxy-fixture');phases.push({name:'tls-private-ca-loopback-proxy-header-boundary',passed:true});
 const wrongCa=await request(true,httpsPort,'/synthetic-untrusted',{ca:undefined}).then(()=>undefined,error=>error);assert(isSyntheticCertificateRefusal(wrongCa));phases.push({name:'untrusted-synthetic-ca-refused',passed:true,errorCode:wrongCa.code});
 diagnosticPhase='stop';
 const stopped=await request(false,adminPort,'/stop',{method:'POST',headers:{Origin:'http://127.0.0.1:'+adminPort}});assert.equal(stopped.status,200);
 const timer=setTimeout(()=>child.kill(),5000);let result;try{result=await childExit;}finally{clearTimeout(timer);}assert.equal(result.code,0);assert.equal(result.signal,null);phases.push({name:'owned-admin-stop',exitCode:result.code,signal:result.signal});
 diagnosticPhase='trust';
 const trust=spawnSync(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./Inspect-SyntheticCaddyTrust.ps1',import.meta.url)),'-CertificatePath',caFile],{timeout:15000,maxBuffer:65536,windowsHide:true});
 assert.equal(trust.error,undefined);assert.equal(trust.status,0);assert.equal(trust.signal,null);
 trustStoreObservation=JSON.parse(trust.stdout.toString('utf8').replace(/^\uFEFF/,''));
 assert.equal(trustStoreObservation.fingerprintSha1,new X509Certificate(ca).fingerprint.replaceAll(':',''));
 assert.equal(trustStoreObservation.exitCode,0);assert.equal(trustStoreObservation.stores.length,2);
 for(const [index,location]of ['CurrentUser','LocalMachine'].entries())assert.deepEqual(trustStoreObservation.stores[index],{location,name:'Root',matchingCertificates:0});
 await new Promise((resolve,reject)=>backend.close(error=>error?reject(error):resolve()));backend=undefined;
 diagnosticPhase='cleanup';
 ownedFixture.dispose();assert.equal(fs.existsSync(fixture),false);
 fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify({commitSha,nodeVersion:process.version,platform:process.platform,architecture:process.arch,caddyVersion:caddyRuntime.version,binarySha256:caddyRuntime.binarySha256,phases,trustStoreObservation,portReservations,fixtureCleanup:true,systemTrustInstalled:false,backend:'synthetic-loopback-only',server2019Acceptance:'not-run'},null,2)+'\n',{flag:'wx'});console.log('CADDY_SYNTHETIC_NATIVE_TLS_PROXY_STOP_VERIFIED');
}catch(error){failure=error;throw Error('CADDY_NATIVE_REJECTED');}
finally{for(const reservation of reserves)await reservation.close();if(child&&child.exitCode===null&&child.signalCode===null){child.kill();try{await childExit;}catch{}}if(backend)await new Promise(resolve=>backend.close(resolve));if(ownedFixture)ownedFixture.dispose();if(failure){const childOutputComplete=childClose?await childClose.wait(1000):true;fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify({commitSha,phases,portReservations,...(failure.portPolicyDiagnostic?{portPolicyDiagnostic:failure.portPolicyDiagnostic}:{}),failed:true,childOutputComplete,diagnostic:syntheticCaddyFailureDiagnostic({phase:diagnosticPhase,error:failure,output,exitCode:child?.exitCode??null,signal:child?.signalCode??null}),fixtureCleanup:!fs.existsSync(fixture),systemTrustInstalled:false,server2019Acceptance:'not-run'},null,2)+'\n',{flag:'wx'});}}
