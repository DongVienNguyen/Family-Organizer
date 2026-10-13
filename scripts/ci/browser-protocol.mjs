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
export function createBrowserProtocolCapture({writeRecord,appendOrdinary,maxRawLineBytes=1024*1024,maxReportBytes=8*1024*1024,maxRecords=50000}){
 const reject=()=>{throw Error('BROWSER_PROTOCOL_DIAGNOSTIC_REJECTED');};
 const positive=value=>Number.isSafeInteger(value)&&value>0;
 if(typeof writeRecord!=='function'||typeof appendOrdinary!=='function'||!positive(maxRawLineBytes)||maxRawLineBytes>1024*1024||!positive(maxReportBytes)||maxReportBytes>8*1024*1024||!positive(maxRecords)||maxRecords>50000)reject();
 let buffer='',records=0,bytes=0,ended=false;
 const line=(value,newline)=>{
  if(Buffer.byteLength(value)>maxRawLineBytes)reject();
  const record=redactBrowserProtocolLine(value);
  if(record===null){appendOrdinary(value+newline);return;}
  const serialized=JSON.stringify({sequence:records+1,...record})+'\n',size=Buffer.byteLength(serialized);
  if(records>=maxRecords||size>maxReportBytes-bytes)reject();
  writeRecord(serialized);records++;bytes+=size;
 };
 return {writeText(value){if(ended||typeof value!=='string')reject();buffer+=value;let index;while((index=buffer.indexOf('\n'))>=0){line(buffer.slice(0,index),'\n');buffer=buffer.slice(index+1);}if(Buffer.byteLength(buffer)>maxRawLineBytes)reject();},end(){if(ended)reject();ended=true;if(buffer)line(buffer,'');buffer='';return {records,bytes};}};
}
