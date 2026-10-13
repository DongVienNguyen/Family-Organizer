import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../lib/native-paths.mjs';
import {safeArchivePath} from './package-contract.mjs';
export const caddyRuntime=Object.freeze({version:'2.11.7',platform:'win32',architecture:'x64',zipUrl:'https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_windows_amd64.zip',zipSha256:'0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06',zipSha512:'c308154504e53755958ffc62d8a2657ab17eefd6dd25c45dbb2c3d93d29519971f77ca652f7d0f2bcb7f980b9ba3822478865e29969d0272d7613550a43152b1',binarySha256:'5f93a9bd555f3aac9d33af2756ba14b3519d8cca4ffd55256bdaeab444c9db2a',licenseSha256:'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'});
export function syntheticCaddyConfiguration(options){
 const reject=()=>{throw new Error('CADDY_FIXTURE_REJECTED');};
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).sort().join(',')!=='adminPort,backendPort,fixtureRoot,httpsPort')reject();
 const {backendPort,httpsPort,adminPort,fixtureRoot}=options;
 const ports=[backendPort,httpsPort,adminPort];if(!ports.every(p=>Number.isSafeInteger(p)&&p>=1024&&p<=65535)||new Set(ports).size!==3)reject();
 if(typeof fixtureRoot!=='string'||!/^([a-z]):\\/i.test(fixtureRoot)||path.win32.normalize(fixtureRoot)!==fixtureRoot||!safeArchivePath(fixtureRoot.slice(3).replaceAll('\\','/')))reject();
 return {
  admin:{listen:'127.0.0.1:'+adminPort,enforce_origin:true,origins:['127.0.0.1:'+adminPort],config:{persist:false}},
  storage:{module:'file_system',root:path.win32.join(fixtureRoot,'caddy storage')},
  apps:{
   pki:{certificate_authorities:{synthetic:{name:'Synthetic CI CA',root_common_name:'Synthetic CI Root',intermediate_common_name:'Synthetic CI Intermediate',install_trust:false}}},
   tls:{automation:{policies:[{subjects:['localhost'],issuers:[{module:'internal',ca:'synthetic'}]}]}},
   http:{servers:{synthetic:{listen:['127.0.0.1:'+httpsPort],automatic_https:{disable_redirects:true},tls_connection_policies:[{}],routes:[{match:[{host:['localhost']}],handle:[{handler:'reverse_proxy',upstreams:[{dial:'127.0.0.1:'+backendPort}]}]}]}}},
  },
 };
}

export function syntheticCaddyEnvironment(directory,inherited){
 const env={};
 for(const [key,value]of Object.entries(inherited))if(['systemroot','windir'].includes(key.toLowerCase()))env[key]=value;
 env.PATH=(inherited.SystemRoot??inherited.SYSTEMROOT)+'\\System32';
 for(const name of ['APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP','XDG_CONFIG_HOME','XDG_DATA_HOME']){
  const file=path.join(directory,name.toLowerCase());fs.mkdirSync(file);env[name]=file;
 }
 return env;
}
export const isSyntheticCertificateRefusal=error=>['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error?.code);

// One owner spans worker execution and outer cleanup. A failed worker may have
// refused inner cleanup; preserve its complete tree instead of overriding that refusal.
export async function runOwnedCaddyWorker({directory,command,args,env}){
 const owned=ownSyntheticProxyFixture(directory);
 let exitCode=1,fixtureCleanup=false;
 try{
  const result=await new Promise(resolve=>{
   const child=spawn(command,args,{env,stdio:'inherit',windowsHide:true});
   child.once('error',()=>resolve({code:null,signal:'spawn-error'}));
   child.once('exit',(code,signal)=>resolve({code,signal}));
  });
  if(result.code===0&&result.signal===null){owned.dispose();fixtureCleanup=true;exitCode=0;}
 }catch{/* Identity/refusal diagnostics stay constant; preserve the tree. */}
 return {exitCode,fixtureCleanup};
}

export function ownSyntheticProxyFixture(directory){
 const reject=()=>{throw new Error('CADDY_FIXTURE_REJECTED');};
 try{
  if(!isFullyQualifiedPath(directory))reject();assertNoLinkedAncestors(directory);
  const parents=[];for(let current=path.dirname(directory);;current=path.dirname(current)){const stat=fs.lstatSync(current,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink())reject();parents.push({file:current,dev:stat.dev,ino:stat.ino});if(path.dirname(current)===current)break;}
  fs.mkdirSync(directory);const identity=fs.lstatSync(directory,{bigint:true});let disposed=false;
  return {directory,dispose(){if(disposed)return;try{assertNoLinkedAncestors(directory);for(const parent of parents){const stat=fs.lstatSync(parent.file,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==parent.dev||stat.ino!==parent.ino)reject();}const current=fs.lstatSync(directory,{bigint:true});if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==identity.dev||current.ino!==identity.ino)reject();fs.rmSync(directory,{recursive:true});disposed=true;}catch{reject();}}};
 }catch{reject();}
}
export function validateCaddyNativeEvidence(value,expected){
 const errors=[],require=(ok,name)=>{if(!ok)errors.push(name);};
 const probe=value?.probe,exit=value?.exit;
 const noFailure=row=>row&&typeof row==='object'&&!['failed','failure','error'].some(key=>Object.hasOwn(row,key));
 require(noFailure(probe)&&noFailure(exit),'contradictory Caddy failure markers');
 require(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&['v22.23.3','v24.21.0'].includes(expected?.nodeVersion),'invalid expected Caddy context');
 require(probe?.commitSha===expected?.commitSha&&probe?.nodeVersion===expected?.nodeVersion&&probe?.platform==='win32'&&probe?.architecture==='x64'&&probe?.caddyVersion===caddyRuntime.version&&probe?.binarySha256===caddyRuntime.binarySha256,'native Caddy source/runtime/binary mismatch');
 require(probe?.fixtureCleanup===true&&probe?.systemTrustInstalled===false&&probe?.backend==='synthetic-loopback-only'&&probe?.server2019Acceptance==='not-run','Caddy synthetic cleanup/trust/scope mismatch');
 require(exit?.commitSha===expected?.commitSha&&exit?.exitCode===0&&exit?.fixtureCleanup===true&&exit?.systemTrustInstalled===false&&exit?.server2019Acceptance==='not-run'&&exit?.zipSha256===caddyRuntime.zipSha256&&exit?.zipSha512===caddyRuntime.zipSha512&&exit?.licenseSha256===caddyRuntime.licenseSha256,'Caddy wrapper identity/checksum/cleanup mismatch');
 require(exit?.nativeExitCodes?.download===0&&exit?.nativeExitCodes?.probe===0&&Object.keys(exit?.nativeExitCodes??{}).length===2,'Caddy native wrapper exits missing/nonzero');
 const trust=probe?.trustStoreObservation;
 require(noFailure(trust)&&Array.isArray(trust?.stores)&&trust.stores.every(noFailure),'contradictory Caddy trust failure markers');
 require(/^[A-F0-9]{40}$/.test(trust?.fingerprintSha1??'')&&trust?.exitCode===0&&Array.isArray(trust?.stores)&&trust.stores.length===2&&['CurrentUser','LocalMachine'].every((location,index)=>trust.stores[index]?.location===location&&trust.stores[index]?.name==='Root'&&trust.stores[index]?.matchingCertificates===0),'missing/failed Windows synthetic CA Root store observations');
 const names=['version','validate','tls-held-backend-status','tls-private-ca-loopback-proxy-header-boundary','untrusted-synthetic-ca-refused','owned-admin-stop'];
 require(Array.isArray(probe?.phases)&&probe.phases.length===names.length,'missing or extra Caddy native phases');
 for(const [index,name]of names.entries()){
  const phase=probe?.phases?.[index],native=[0,1,5].includes(index),keys=native?['exitCode','name','signal']:index===4?['errorCode','name','passed']:['name','passed'];
  require(noFailure(phase)&&Object.keys(phase??{}).sort().join(',')===keys.sort().join(',')&&phase?.name===name&&(native?phase.exitCode===0&&phase.signal===null:phase.passed===true),'missing/failed native Caddy phase: '+name);
 }
 require(isSyntheticCertificateRefusal({code:probe?.phases?.[4]?.errorCode}),'untrusted CA refusal must be a certificate verification error');
 return errors;
}

// Diagnostic facts from the isolated native synthetic fixture only. They never
// confer native success, trust-store or release authority. Exception text/cause
// and inherited environment are deliberately excluded.
export function syntheticCaddyFailureDiagnostic({phase,error,output,exitCode,signal}){
 const reject=()=>{throw Error('CADDY_DIAGNOSTIC_REJECTED');};
 if(!['preflight','configuration','startup','tls','stop','trust','cleanup'].includes(phase)||typeof output!=='string'||!(exitCode===null||Number.isSafeInteger(exitCode))||!(signal===null||/^SIG[A-Z0-9]+$/.test(signal)))reject();
 const bytes=Buffer.from(output,'utf8');let start=Math.max(0,bytes.length-8192);
 while(start<bytes.length&&(bytes[start]&0xc0)===0x80)start++;
 let code=null;try{if(typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(error.code))code=error.code;}catch{/* Unknown error objects cannot expose cause/message. */}
 return {scope:'synthetic-loopback-only',diagnosticOnly:true,phase,errorCode:code,childExitCode:exitCode,childSignal:signal,output:bytes.subarray(start).toString('utf8'),observedOutputBytes:bytes.length,outputTruncated:start>0};
}
