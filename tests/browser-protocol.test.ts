import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {it,expect,vi} from 'vitest';
import * as protocol from '../scripts/ci/browser-protocol.mjs';
import {redactBrowserProtocolLine} from '../scripts/ci/browser-protocol.mjs';
const line=(direction:string,value:any)=>'2026-10-13T07:00:00.000Z pw:protocol '+(direction==='send'?'SEND ► ':'◀ RECV ')+JSON.stringify(value);
it('redacts authentication headers/password/body while retaining request identity',()=>{const value=redactBrowserProtocolLine(line('send',{id:8,method:'Network.requestWillBeSent',sessionId:'page-1',params:{frameId:'frame-3',request:{headers:{Authorization:'Bearer synthetic-secret'},postData:'synthetic-password',url:'https://synthetic.invalid/private'},executionContextId:7}}));expect(value).toEqual({direction:'send',id:8,method:'Network.requestWillBeSent',sessionId:'page-1',contextId:7,frameId:'frame-3',hasError:false,errorCode:null,wasThrown:false});expect(JSON.stringify(value)).not.toMatch(/synthetic-secret|synthetic-password|synthetic.invalid/);});
it('redacts evaluated scripts and returned private payloads',()=>{const send=redactBrowserProtocolLine(line('send',{id:9,method:'Runtime.evaluate',params:{expression:'synthetic-private-script',contextId:5}}));const receive=redactBrowserProtocolLine(line('receive',{id:9,result:{value:{token:'synthetic-token',data:'synthetic-private'},wasThrown:true},error:{code:-32000,message:'synthetic-private-error'}}));expect(send.contextId).toBe(5);expect(receive).toMatchObject({id:9,hasError:true,errorCode:-32000,wasThrown:true});expect(JSON.stringify([send,receive])).not.toMatch(/synthetic-private|synthetic-token/);});
it('retains only native execution context and frame identifiers from events',()=>expect(redactBrowserProtocolLine(line('receive',{method:'Runtime.executionContextCreated',params:{context:{id:3,frameId:'frame-5',name:'synthetic-private-world',origin:'synthetic-private-origin'}}}))).toMatchObject({method:'Runtime.executionContextCreated',contextId:3,frameId:'frame-5'}));
it('preserves ordinary native/test stderr outside the protocol namespace',()=>expect(redactBrowserProtocolLine('Error: synthetic original failure')).toBe(null));
it.each(['malformed','truncated'])('never returns raw protocol payload on %s JSON',kind=>{const value=redactBrowserProtocolLine('2026-10-13T07:00:00.000Z pw:protocol SEND ► '+(kind==='malformed'?'synthetic-private-broken':'{"id":7,"method":"Runtime.evaluate","params":{"expression":"synthetic-private"}'));expect(value).toMatchObject({parseRejected:true});expect(JSON.stringify(value)).not.toContain('synthetic-private');});
it('accepts colored protocol lines without retaining terminal escapes or bodies',()=>{const value=redactBrowserProtocolLine('\u001b[34m'+line('receive',{id:7,result:{body:'synthetic-private'}})+'\u001b[0m');expect(value).toMatchObject({direction:'receive',id:7});expect(JSON.stringify(value)).not.toMatch(/synthetic-private|\u001b/);});
it('does not copy unexpected scalar fields from protocol messages',()=>{const value=redactBrowserProtocolLine(line('receive',{id:7,token:'synthetic-token',method:'Runtime.executionContextsCleared',params:{contextId:{secret:'synthetic-private'}}}));expect(value.contextId).toBe(null);expect(JSON.stringify(value)).not.toMatch(/synthetic-token|synthetic-private/);});

it('captures split protocol lines while preserving ordinary stderr exactly',()=>{const records:string[]=[],ordinary:string[]=[];const sink=(protocol as any).createBrowserProtocolCapture({writeRecord:(line:string)=>records.push(line),appendOrdinary:(line:string)=>ordinary.push(line)});const text=line('receive',{id:1,result:{value:'synthetic-secret'}})+'\nError: original native failure\n';sink.writeText(text.slice(0,30));sink.writeText(text.slice(30));sink.end();expect(records.map(text=>JSON.parse(text))).toEqual([expect.objectContaining({id:1,direction:'receive'})]);expect(ordinary.join('')).toBe('Error: original native failure\n');expect(records.join('')).not.toContain('synthetic-secret');});
it.each(['raw-line','records','report-bytes'])('refuses diagnostic budget exhaustion %s',kind=>{const options:any={writeRecord:()=>{},appendOrdinary:()=>{},maxRawLineBytes:kind==='raw-line'?5:1024,maxRecords:kind==='records'?1:10,maxReportBytes:kind==='report-bytes'?10:1024};const sink=(protocol as any).createBrowserProtocolCapture(options);expect(()=>{if(kind==='raw-line')sink.writeText('123456');else{sink.writeText(line('receive',{id:1})+'\n');sink.writeText(line('receive',{id:2})+'\n');}}).toThrow('BROWSER_PROTOCOL_DIAGNOSTIC_REJECTED');});

it.each(['Target.sendMessageToTarget','Target.dispatchMessageFromTarget'])('retains redacted inner WebKit method/context identifiers in %s',method=>{const value=redactBrowserProtocolLine(line('send',{id:4,method,pageProxyId:'page-3',params:{targetId:'target-2',message:JSON.stringify({id:5,method:'Runtime.callFunctionOn',params:{executionContextId:7,functionDeclaration:'synthetic-private-script'},result:{value:'synthetic-private-response'}})}}));expect(value).toMatchObject({id:4,pageProxyId:'page-3',targetId:'target-2',nested:{id:5,method:'Runtime.callFunctionOn',contextId:7}});expect(JSON.stringify(value)).not.toContain('synthetic-private');});
it('redacts malformed nested WebKit messages instead of copying their payload',()=>{const value=redactBrowserProtocolLine(line('receive',{method:'Target.dispatchMessageFromTarget',params:{message:'synthetic-private-broken'}}));expect(value).toMatchObject({nested:{parseRejected:true}});expect(JSON.stringify(value)).not.toContain('synthetic-private');});

it('redacts an unsupported protocol log format without forwarding its payload',()=>{const value=redactBrowserProtocolLine('unexpected prefix pw:protocol FUTURE synthetic-private-payload');expect(value).toMatchObject({parseRejected:true});expect(JSON.stringify(value)).not.toContain('synthetic-private');});

it('keeps ordinary stderr but records protocol only in the selected diagnostic window',()=>{const records:string[]=[],ordinary:string[]=[];let selected=false;const sink=(protocol as any).createBrowserProtocolCapture({writeRecord:(v:string)=>records.push(v),appendOrdinary:(v:string)=>ordinary.push(v),acceptRecord:()=>selected,maxRecords:1});sink.writeText(line('receive',{id:1})+'\n');selected=true;sink.writeText(line('receive',{id:2})+'\n');selected=false;sink.writeText(line('receive',{id:3})+'\noriginal failure\n');expect(sink.end().records).toBe(1);expect(JSON.parse(records[0]).id).toBe(2);expect(ordinary.join('')).toBe('original failure\n');});

it('retains native browser process exit code and signal without command arguments',()=>{
 const row=(protocol as any).redactBrowserDriverLine('2026-10-13T17:00:00.000Z pw:browser [pid=123] <process did exit: exitCode=3221225477, signal=null>');
 expect(row).toEqual({diagnosticOnly:true,event:'exit',pid:123,exitCode:3221225477,signal:null});
});
it('records native browser launch identity without copying launch command or private arguments',()=>{
 const row=(protocol as any).redactBrowserDriverLine('pw:browser <launching> synthetic-private-command --token=synthetic-secret');
 expect(row).toEqual({diagnosticOnly:true,event:'launch-command-redacted'});expect(JSON.stringify(row)).not.toContain('synthetic');
});
it('retains bounded synthetic native stderr without splitting the final Unicode tail',()=>{
 const row=(protocol as any).redactBrowserDriverLine('pw:browser [pid=7][err] '+'đ'.repeat(3000)+' synthetic lỗi cuối');
 expect(row.event).toBe('stderr');expect(Buffer.byteLength(row.output)).toBeLessThanOrEqual(2048);expect(row.output.endsWith('synthetic lỗi cuối')).toBe(true);expect(row.output).not.toContain('\uFFFD');expect(row.truncated).toBe(true);
});
it('captures split driver stderr records and preserves ordinary test errors separately',()=>{
 const records:string[]=[],ordinary:string[]=[];const sink=(protocol as any).createBrowserDriverCapture({writeRecord:(s:string)=>records.push(s),appendOrdinary:(s:string)=>ordinary.push(s)});
 sink.writeText('pw:browser <launched> pi');sink.writeText('d=123\noriginal assertion failure\n');expect(sink.end().records).toBe(1);expect(JSON.parse(records[0])).toMatchObject({event:'launched',pid:123,diagnosticOnly:true});expect(ordinary.join('')).toBe('original assertion failure\n');
});
it.each(['raw-line','records','report-bytes'])('refuses driver diagnostic budget exhaustion %s',kind=>{
 const sink=(protocol as any).createBrowserDriverCapture({writeRecord:()=>{},appendOrdinary:()=>{},maxRawLineBytes:kind==='raw-line'?5:1024,maxRecords:kind==='records'?1:10,maxReportBytes:kind==='report-bytes'?10:1024});
 expect(()=>{if(kind==='raw-line')sink.writeText('123456');else{sink.writeText('pw:browser <launched> pid=1\n');sink.writeText('pw:browser <launched> pid=2\n');}}).toThrow('BROWSER_PROTOCOL_DIAGNOSTIC_REJECTED');
});
it('redacts unknown driver formats instead of forwarding arbitrary payload',()=>{
 expect((protocol as any).redactBrowserDriverLine('unexpected pw:browser synthetic-private')).toEqual({diagnosticOnly:true,parseRejected:true});
});

it('keeps real spawn refusal handled until delayed evidence cleanup awaits completion',()=>{
 const module=new URL('../scripts/ci/browser-protocol.mjs',import.meta.url).href;
 const code=`import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {observeBrowserChildCompletion} from ${JSON.stringify(module)};const child=spawn(process.execPath+'.synthetic-missing',[],{stdio:'pipe'});const completion=observeBrowserChildCompletion(child);await new Promise(resolve=>setTimeout(resolve,50));await assert.rejects(completion,{code:'ENOENT'});console.log('SPAWN_REFUSAL_CLEANUP_OBSERVED');`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{timeout:5000,encoding:'utf8'});
 expect(result.error).toBeUndefined();expect(result.signal).toBeNull();expect(result.status,result.stderr).toBe(0);expect(result.stdout.trim()).toBe('SPAWN_REFUSAL_CLEANUP_OBSERVED');
});
it('refuses stale diagnostic evidence before launching a real child process',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-driver-ownership-'));const file=path.join(root,'existing.jsonl'),marker=path.join(root,'unmanaged-child.txt');fs.writeFileSync(file,'synthetic existing evidence');let child:any;
 try{
  expect(()=>(protocol as any).launchWithBrowserDiagnostic(file,()=>{child=spawn(process.execPath,['-e',`require('node:fs').writeFileSync(${JSON.stringify(marker)},'synthetic unmanaged child')`]);return child;})).toThrow();
  if(child)await once(child,'close');
  expect(fs.existsSync(marker)).toBe(false);expect(fs.readFileSync(file,'utf8')).toBe('synthetic existing evidence');
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill();fs.rmSync(root,{recursive:true});}
});
it('closes the diagnostic descriptor when synchronous launch fails',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-driver-fd-'));const file=path.join(root,'driver.jsonl');let descriptor:number|undefined;
 const actualOpen=fs.openSync.bind(fs);const spy=vi.spyOn(fs,'openSync').mockImplementation((...args:any[])=>{const fd=(actualOpen as any)(...args);if(args[0]===file)descriptor=fd;return fd;});
 try{
  expect(()=>(protocol as any).launchWithBrowserDiagnostic(file,()=>{throw Error('synthetic launch refusal');})).toThrow('synthetic launch refusal');
  expect(fs.existsSync(file)).toBe(true);expect(descriptor).toBeTypeOf('number');
  let code;try{fs.fstatSync(descriptor!);}catch(error:any){code=error.code;}expect(code).toBe('EBADF');
 }finally{spy.mockRestore();if(descriptor!==undefined){try{fs.closeSync(descriptor);}catch{/* Already closed is required above. */}}fs.rmSync(root,{recursive:true});}
});
