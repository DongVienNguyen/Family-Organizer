/** @license SPDX-License-Identifier: Apache-2.0 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';
const repo=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(path.join(repo,'package.json'));
const postcss=require('postcss');
const {SourceMapConsumer}=require('source-map-js');
const marker='synthetic-source-map-private-marker';
const map={version:3,file:'synthetic.css',sources:['synthetic.css'],sourcesContent:[marker],names:[],mappings:'AAAA'};
function fixture(work:(root:string)=>void){const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo library synthetic '));try{work(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}

it.each([false,true])('does not auto-read an unrelated .map file (CSS from provided: %s)',withFrom=>fixture(root=>{
  const outside=path.join(root,'private.map'),cssRoot=path.join(root,'styles');fs.mkdirSync(cssRoot);
  fs.writeFileSync(outside,JSON.stringify(map));
  const css='body { color: red } /*# sourceMappingURL='+outside.replaceAll('\\','/')+' */';
  const result=postcss.parse(css,withFrom?{from:path.join(cssRoot,'synthetic.css')}:{});
  expect(result.source?.input.map?.text??'').not.toContain(marker);
  expect(fs.readFileSync(outside,'utf8')).toBe(JSON.stringify(map));
}));
it('preserves an explicit inline source map',()=>{
  const encoded=Buffer.from(JSON.stringify(map)).toString('base64');
  const result=postcss.parse('body{} /*# sourceMappingURL=data:application/json;base64,'+encoded+' */');
  expect(result.source.input.map.text).toContain(marker);
});
it('preserves a relative map next to its explicit CSS source',()=>fixture(root=>{
  fs.writeFileSync(path.join(root,'synthetic.css.map'),JSON.stringify(map));
  const result=postcss.parse('body{} /*# sourceMappingURL=synthetic.css.map */',{from:path.join(root,'synthetic.css')});
  expect(result.source.input.map.text).toContain(marker);
}));
it.each([-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])('rejects unsafe indexed source-map line offset %s before mapping work',line=>{
  expect(()=>new SourceMapConsumer({version:3,sections:[{offset:{line,column:0},map}]})).toThrow();
});
it.each([-1,0.5,NaN,Infinity])('rejects unsafe indexed source-map column offset %s',column=>{
  expect(()=>new SourceMapConsumer({version:3,sections:[{offset:{line:0,column},map}]})).toThrow();
});
it('preserves valid indexed mappings',()=>{
  const consumer=new SourceMapConsumer({version:3,sections:[{offset:{line:0,column:0},map}]});
  expect(consumer.originalPositionFor({line:1,column:1})).toMatchObject({source:'synthetic.css',line:1,column:0});
});

type OwnedResult={code:number|null;signal:NodeJS.Signals|null;forced:boolean;output:string;response:any};
async function owned(script:string):Promise<OwnedResult>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo dependency child synthetic '));
  const env:NodeJS.ProcessEnv={};for(const key of ['PATH','SystemRoot','windir','TEMP','TMP','USERPROFILE','HOME'])if(process.env[key])env[key]=process.env[key];
  Object.assign(env,{BROWSERSLIST_IGNORE_OLD_DATA:'1',FO_NETWORK_ATTEMPTS:path.join(root,'network.jsonl')});
  let child:ReturnType<typeof spawn>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  try{
    child=spawn(process.execPath,['--max-old-space-size=64','--require',path.join(repo,'scripts/ci/block-network.cjs'),'--input-type=commonjs','--eval',script],{cwd:root,env,stdio:['ignore','pipe','pipe']});
    const processHandle=child;let output='',capturedBytes=0,forced=false,ready=false;
    const kill=()=>{forced=true;processHandle.kill('SIGKILL');};timer=setTimeout(kill,10000);
    const collect=(chunk:Buffer)=>{const room=65536-capturedBytes;output+=chunk.subarray(0,room).toString('utf8');capturedBytes+=Math.min(room,chunk.length);if(chunk.length>room){kill();return;}if(!ready&&output.includes('FO_LIBRARY_READY')){ready=true;clearTimeout(timer);timer=setTimeout(kill,2000);}};
    child.stdout!.on('data',collect);child.stderr!.on('data',collect);
    const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{processHandle.once('error',reject);processHandle.once('close',(code,signal)=>resolve({code,signal}));});
    let response:any;for(const line of output.split(/\r?\n/)){try{response=JSON.parse(line);}catch{/* Bounded synthetic diagnostic, not a result. */}}
    expect(fs.existsSync(env.FO_NETWORK_ATTEMPTS!)?fs.readFileSync(env.FO_NETWORK_ATTEMPTS!,'utf8'):'').toBe('');
    return {...result,forced,output,response};
  }finally{clearTimeout(timer);if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});}
}
function code(moduleName:string,operation:string){return 'const subject=require('+JSON.stringify(require.resolve(moduleName))+');console.log("FO_LIBRARY_READY");try{const result=(()=>{'+operation+'})();console.log(JSON.stringify({ok:true,result}));}catch(error){console.log(JSON.stringify({ok:false,error:error.message}));}';}
function settled(result:OwnedResult){expect(result.forced,result.output).toBe(false);expect(result.signal,result.output).toBeNull();expect(result.code,result.output).toBe(0);expect(result.response,result.output).toBeDefined();}
it('protobuf option without an equals delimiter rejects promptly instead of looping at EOF',async()=>{
  const result=await owned(code('protobufjs','subject.parse(\'syntax = "proto3"; option synthetic_missing_delimiter\');return "unexpected parse";'));
  settled(result);expect(result.response.ok).toBe(false);expect(result.response.error).toMatch(/invalid|illegal|expected|end/i);
},15000);
it('preserves valid protobuf message parsing',async()=>{
  const result=await owned(code('protobufjs','return subject.parse(\'syntax = "proto3"; message Synthetic { string name = 1; }\').root.lookupType("Synthetic").fields.name.id;'));
  settled(result);expect(result.response).toEqual({ok:true,result:1});
},15000);
it.each(['nanoid','customAlphabet'])('non-secure %s negative length returns an empty value without a loop',async method=>{
  const operation=method==='nanoid'?'return subject.nanoid(-1);':'return subject.customAlphabet("abc",-1)();';
  const result=await owned(code('nanoid/non-secure',operation));settled(result);expect(result.response).toEqual({ok:true,result:''});
},15000);
it('secure custom generator with zero size terminates with an empty value',async()=>{
  const result=await owned(code('nanoid','return subject.customAlphabet("abc",0)();'));settled(result);expect(result.response).toEqual({ok:true,result:''});
},15000);
it('preserves a normal non-secure custom generator',async()=>{
  const result=await owned(code('nanoid/non-secure','return subject.customAlphabet("abc",12)();'));settled(result);expect(result.response.ok).toBe(true);expect(result.response.result).toMatch(/^[abc]{12}$/);
},15000);
it('brace expansion honors a total-character budget with many chained groups',async()=>{
  const result=await owned(code('brace-expansion','const value=subject.expand("{a,b}".repeat(1500),{max:100,maxLength:128});return value.reduce((sum,item)=>sum+item.length,0);'));
  settled(result);expect(result.response.ok).toBe(true);expect(result.response.result).toBeLessThanOrEqual(128);
},15000);
it('deep brace nesting remains a bounded total operation without stack exhaustion',async()=>{
  const result=await owned(code('brace-expansion','const value=subject.expand("{".repeat(4000)+"a,b"+"}".repeat(4000));return {count:value.length,characters:value.reduce((sum,item)=>sum+item.length,0)};'));
  settled(result);expect(result.response.ok).toBe(true);expect(result.response.result.count).toBeGreaterThan(0);expect(result.response.result.characters).toBeLessThan(20000);
},15000);
it('preserves normal brace expansion',async()=>{
  const result=await owned(code('brace-expansion','return subject.expand("{a,b}{1,2}");'));settled(result);expect(result.response).toEqual({ok:true,result:['a1','a2','b1','b2']});
},15000);
it.each([{targetYear:2020,widelyAvailableOnDate:'2020-01-01'},{includeKaiOS:true,includeDownstreamBrowsers:false}])('baseline mapping invalid options throw to the caller without exiting the process',async options=>{
  const result=await owned(code('baseline-browser-mapping','subject.getCompatibleVersions('+JSON.stringify(options)+');return "unexpected compatibility";'));
  settled(result);expect(result.response.ok).toBe(false);expect(result.response.error).toMatch(/cannot|only|configuration/i);
},15000);
it('preserves valid baseline mapping',async()=>{
  const result=await owned(code('baseline-browser-mapping','return subject.getCompatibleVersions({targetYear:2020,suppressWarnings:true}).length;'));settled(result);expect(result.response.ok).toBe(true);expect(result.response.result).toBeGreaterThan(0);
},15000);
it('browser stats normalize untrusted prototype names without a crash or prototype write',()=>{
  const browserslist=require('browserslist'),environment=require(path.join(path.dirname(require.resolve('browserslist')),'node.js'));
  const stats=JSON.parse('{"chrome":{"100":15},"constructor":{"0":1},"__proto__":{"0":4}}');
  const normalized=environment.getStat({stats},browserslist.data);
  expect(Object.getPrototypeOf(normalized)).toBeNull();expect(Object.hasOwn(normalized,'__proto__')).toBe(true);expect(normalized.chrome).toEqual({'100':15});
  expect(Object.getPrototypeOf(stats)).toBe(Object.prototype);expect(Object.hasOwn(Object.prototype,'0')).toBe(false);
});
it('preserves normal browser queries from explicit custom stats',()=>{
  const browserslist=require('browserslist');expect(browserslist('> 0% in my stats',{stats:{chrome:{'100':15}}})).toContain('chrome 100');
});
