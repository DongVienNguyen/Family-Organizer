import fs from 'node:fs';
// Diagnostic protocol records contain identifiers and outcomes only, never
// request/response bodies, headers, scripts, URLs or exception text.
export function redactBrowserProtocolLine(line){
 const clean=line.replace(/\x1b\[[0-9;]*m/g,'');
 const match=clean.match(/^(?:\d{4}-\d\d-\d\dT[0-9:.]+Z\s+)?\s*pw:protocol\s+(SEND\s*►|◀\s*RECV)\s+([\s\S]+)$/);
 if(!match)return clean.includes('pw:protocol')?{parseRejected:true}:null;
 const direction=match[1].startsWith('SEND')?'send':'receive';
 try{
  const number=v=>Number.isSafeInteger(v)?v:null;
  const identity=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)?v:null;
  const redact=(value,depth=0)=>{
   const method=typeof value.method==='string'&&/^[A-Za-z]+\.[A-Za-z0-9]+$/.test(value.method)?value.method:null;
   const record={direction,id:number(value.id),method,sessionId:identity(value.sessionId),contextId:number(value.params?.executionContextId??value.params?.contextId??value.params?.context?.id??value.result?.executionContextId),frameId:identity(value.params?.frameId??value.params?.context?.frameId??value.params?.frame?.id),hasError:Object.hasOwn(value,'error'),errorCode:number(value.error?.code),wasThrown:value.result?.wasThrown===true};
   if(identity(value.pageProxyId))record.pageProxyId=identity(value.pageProxyId);
   if(identity(value.params?.targetId))record.targetId=identity(value.params.targetId);
   if(method==='Runtime.executionContextCreated')record.world=value.params?.context?.isPageContext===true?'main':value.params?.context?.name==='__playwright_utility_world__'?'utility':null;
   if(['Target.sendMessageToTarget','Target.dispatchMessageFromTarget'].includes(method)&&typeof value.params?.message==='string'){
    try{if(depth>=2)throw Error('Depth');record.nested=redact(JSON.parse(value.params.message),depth+1);}catch{record.nested={parseRejected:true};}
   }
   return record;
  };
  return redact(JSON.parse(match[2].replace(/\s+\+\d+(?:ms|s|m)\s*$/,'')));
 }catch{return {direction,parseRejected:true};}
}
export function createBrowserProtocolCapture({writeRecord,appendOrdinary,acceptRecord=()=>true,maxRawLineBytes=1024*1024,maxReportBytes=8*1024*1024,maxRecords=50000,redactLine=redactBrowserProtocolLine}){
 const reject=()=>{throw Error('BROWSER_PROTOCOL_DIAGNOSTIC_REJECTED');};
 const positive=value=>Number.isSafeInteger(value)&&value>0;
 if(typeof writeRecord!=='function'||typeof appendOrdinary!=='function'||typeof acceptRecord!=='function'||typeof redactLine!=='function'||!positive(maxRawLineBytes)||maxRawLineBytes>1024*1024||!positive(maxReportBytes)||maxReportBytes>8*1024*1024||!positive(maxRecords)||maxRecords>50000)reject();
 let buffer='',records=0,bytes=0,ended=false;
 const line=(value,newline)=>{
  if(Buffer.byteLength(value)>maxRawLineBytes)reject();
  const record=redactLine(value);
  if(record===null){appendOrdinary(value+newline);return;}
  if(!acceptRecord(record))return;
  const serialized=JSON.stringify({sequence:records+1,...record})+'\n',size=Buffer.byteLength(serialized);
  if(records>=maxRecords||size>maxReportBytes-bytes)reject();
  writeRecord(serialized);records++;bytes+=size;
 };
 return {writeText(value){if(ended||typeof value!=='string')reject();buffer+=value;let index;while((index=buffer.indexOf('\n'))>=0){line(buffer.slice(0,index),'\n');buffer=buffer.slice(index+1);}if(Buffer.byteLength(buffer)>maxRawLineBytes)reject();},end(){if(ended)reject();ended=true;if(buffer)line(buffer,'');buffer='';return {records,bytes};}};
}

// The driver runs only the isolated synthetic browser fixture. Process lifecycle
// and bounded native stderr never grant test/native success. Launch arguments
// and unknown driver formats are deliberately excluded.
export function redactBrowserDriverLine(line){
 const clean=line.replace(/\x1b\[[0-9;]*m/g,'');
 if(!clean.includes('pw:browser'))return null;
 const match=clean.match(/^(?:\d{4}-\d\d-\d\dT[0-9:.]+Z\s+)?\s*pw:browser\s+([\s\S]*?)(?:\s+\+\d+(?:ms|s|m))?$/);
 const rejected={diagnosticOnly:true,parseRejected:true};if(!match)return rejected;
 const text=match[1];const number=value=>{const n=Number(value);return Number.isSafeInteger(n)?n:null;};
 if(text.startsWith('<launching>'))return {diagnosticOnly:true,event:'launch-command-redacted',...(/\s--disable-stack-profiler(?:\s|$)/.test(text)?{windowsStackProfilerDisabled:true}:{})};
 let m=text.match(/^<launched> pid=(\d+)$/);if(m)return {diagnosticOnly:true,event:'launched',pid:number(m[1])};
 m=text.match(/^\[pid=(\d+)\] <process did exit: exitCode=(-?\d+|null), signal=(null|SIG[A-Z0-9]+)>$/);
 if(m)return {diagnosticOnly:true,event:'exit',pid:number(m[1]),exitCode:m[2]==='null'?null:number(m[2]),signal:m[3]==='null'?null:m[3]};
 m=text.match(/^\[pid=(\d+)\] <(gracefully close start|gracefully close end|kill|will force kill)>$/);
 if(m)return {diagnosticOnly:true,event:m[2],pid:number(m[1])};
 m=text.match(/^\[pid=(\d+)\]\[err\] ([\s\S]*)$/);
 if(m){const bytes=Buffer.from(m[2],'utf8');let start=Math.max(0,bytes.length-2048);while(start<bytes.length&&(bytes[start]&0xc0)===0x80)start++;return {diagnosticOnly:true,event:'stderr',pid:number(m[1]),output:bytes.subarray(start).toString('utf8'),truncated:start>0};}
 return rejected;
}
export function createBrowserDriverCapture(options){
 return createBrowserProtocolCapture({maxRawLineBytes:65536,maxReportBytes:1024*1024,maxRecords:5000,...options,redactLine:redactBrowserDriverLine});
}

// Extracted native ownership boundaries for regression and the harness.
export function observeBrowserChildCompletion(child){
 const closed=new Promise(resolve=>child.once('close',()=>resolve(true)));
 const exited=new Promise((resolve,reject)=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',reject);});exited.catch(()=>{});
 const completion=exited.then(async result=>{let timer;try{return {...result,outputClosed:await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);})])};}finally{clearTimeout(timer);}});
 completion.catch(()=>{});return completion;
}
export function launchWithBrowserDiagnostic(file,launch){
 const fd=fs.openSync(file,'wx');try{return {child:launch(),fd};}catch(error){fs.closeSync(fd);throw error;}
}
