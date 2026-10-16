import childProcess from 'node:child_process';
import {randomInt} from 'node:crypto';
const reject=diagnostic=>{const error=Error('WINDOWS_SYNTHETIC_PORT_POLICY_REJECTED');if(diagnostic)error.portPolicyDiagnostic=diagnostic;throw error;};
const requireFact=value=>{if(!value)reject();};
const port=value=>Number.isSafeInteger(value)&&value>=1&&value<=65535;
function excluded(text,protocol){
 const lines=text.replaceAll('\r\n','\n').split('\n').map(s=>s.trim()).filter(Boolean);requireFact(lines.shift()==='Protocol '+protocol+' Port Exclusion Ranges'&&/^Start Port\s+End Port$/.test(lines.shift()??'')&&/^-+\s+-+$/.test(lines.shift()??''));
 const ranges=[];for(const line of lines){if(line==='* - Administered port exclusions.')continue;const m=line.match(/^(\d{1,5})\s+(\d{1,5})(?:\s+\*)?$/);requireFact(m);const a=Number(m[1]),b=Number(m[2]);requireFact(port(a)&&port(b)&&a<=b);ranges.push([a,b]);requireFact(ranges.length<=1024);}return ranges;
}
function endpoints(text){
 const lines=text.replaceAll('\r\n','\n').split('\n').map(s=>s.trim()).filter(Boolean);requireFact(lines.shift()==='Active Connections'&&/^Proto\s+Local Address\s+Foreign Address\s+State\s+PID$/.test(lines.shift()??''));
 const ports=new Set();requireFact(lines.length<=20000);for(const line of lines){const row=line.split(/\s+/);requireFact((row[0]==='TCP'&&row.length===5)||(row[0]==='UDP'&&row.length===4));const m=row[1].match(/^(?:[0-9.]+|\[[0-9a-fA-F:%]+\]):(\d{1,5})$/);requireFact(m&&/^\d+$/.test(row.at(-1)));const n=Number(m[1]);requireFact(port(n));ports.add(n);}return [...ports].sort((a,b)=>a-b);
}
/** Read-only Windows network facts; no port-policy changes or native retries.
 * @param {(command:string,args:string[],options:import('node:child_process').SpawnSyncOptionsWithStringEncoding)=>{status:number|null,signal:string|null,stdout:string,error?:unknown}} [execute]
 */
export function readWindowsSyntheticPortPolicy(execute=childProcess.spawnSync){
 const exits={};const run=(command,args,name,parse)=>{let r;try{r=execute(command,args,{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024});}catch{reject({phase:name,nativeExitCode:null,reason:'execution-threw'});}const diagnostic={phase:name,nativeExitCode:Number.isSafeInteger(r?.status)?r.status:null,reason:'native-policy-read-failed'};
  if(!(r?.status===0&&r.signal===null&&!r.error&&typeof r.stdout==='string'&&Buffer.byteLength(r.stdout)<=1024*1024))reject(diagnostic);exits[name]=r.status;
  try{return parse(r.stdout);}catch{reject({...diagnostic,reason:'unsupported-native-policy-data',...(name==='endpoints'?{outputBytes:Buffer.byteLength(r.stdout)}:{excludedRangeText:r.stdout.slice(0,65536),truncated:r.stdout.length>65536})});}
 };
 const tcpExcluded=run('netsh.exe',['interface','ipv4','show','excludedportrange','protocol=tcp'],'tcpExcluded',text=>excluded(text,'tcp')),udpExcluded=run('netsh.exe',['interface','ipv4','show','excludedportrange','protocol=udp'],'udpExcluded',text=>excluded(text,'udp')),busyPorts=run('netstat.exe',['-ano'],'endpoints',endpoints);
 return {tcpExcluded,udpExcluded,busyPorts,nativeExitCodes:exits};
}
/** Select once from the common permitted, unoccupied set, then bind both once.
 * A later race still fails closed; no Caddy assertion or test is retried. */
export function selectSyntheticProxyPort(policy,choose=randomInt){
 requireFact(policy&&Array.isArray(policy.tcpExcluded)&&Array.isArray(policy.udpExcluded)&&Array.isArray(policy.busyPorts)&&policy.tcpExcluded.length<=1024&&policy.udpExcluded.length<=1024&&policy.busyPorts.length<=65535);
 const blocked=new Uint8Array(65536);for(const range of [...policy.tcpExcluded,...policy.udpExcluded]){requireFact(Array.isArray(range)&&range.length===2&&port(range[0])&&port(range[1])&&range[0]<=range[1]);blocked.fill(1,range[0],range[1]+1);}for(const n of policy.busyPorts){requireFact(port(n));blocked[n]=1;}
 const allowed=[];for(let n=1024;n<=65535;n++)if(!blocked[n])allowed.push(n);requireFact(allowed.length>0);const index=choose(allowed.length);requireFact(Number.isSafeInteger(index)&&index>=0&&index<allowed.length);return allowed[index];
}
