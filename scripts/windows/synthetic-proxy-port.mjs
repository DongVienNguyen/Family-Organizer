import {readWindowsSyntheticPortPolicy,selectSyntheticProxyPort} from './synthetic-port-policy.mjs';
import dgram from 'node:dgram';
import net from 'node:net';
import {once} from 'node:events';
// One fixture allocation before any Caddy assertion. Windows selection uses the
// intersection of TCP/UDP exclusions and occupied endpoints. Bind each once;
// no test/native retry, protocol disablement or global network change.
export async function reserveSyntheticProxyPort(){
 const policy=process.platform==='win32'?readWindowsSyntheticPortPolicy():null,candidate=policy?selectSyntheticProxyPort(policy):0;
 const udp=dgram.createSocket({type:'udp4',reuseAddr:false});let tcp,closing;
 const close=()=>{if(!closing){const pending=[];if(tcp?.listening)pending.push(new Promise((resolve,reject)=>tcp.close(error=>error?reject(error):resolve())));pending.push(new Promise((resolve,reject)=>{try{udp.close(resolve);}catch(error){if(error.code==='ERR_SOCKET_DGRAM_NOT_RUNNING')resolve();else reject(error);}}));closing=Promise.all(pending).then(()=>undefined);}return closing;};
 try{
  const udpReady=once(udp,'listening');udp.bind({address:'127.0.0.1',port:candidate,exclusive:true});await udpReady;
  const port=udp.address().port;if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('SYNTHETIC_PROXY_PORT_REJECTED');
  tcp=net.createServer();const tcpReady=once(tcp,'listening');tcp.listen({host:'127.0.0.1',port,exclusive:true});await tcpReady;
  return {port,close,selection:policy?{profile:'windows-common-port-policy-v1',...policy,port}: {profile:'os-udp-ephemeral-v1',port}};
 }catch(error){await close();throw error;}
}
