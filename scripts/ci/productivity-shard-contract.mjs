import {isDeepStrictEqual} from 'node:util';
import {parseReleaseJUnit} from '../windows/release-quality-reports.mjs';
export const productivityShardProjects=['chromium','firefox','webkit'];
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
/** Each input is a separately executed runner; never fabricate missing engines. */
export function validateProductivityShards(input,cases){
 try{
  const {shards,manifest,expected}=input,require=(value,message)=>{if(!value)throw Error(message);};
  require(isDeepStrictEqual(manifest?.browserShards,{format:1,projects:productivityShardProjects}),'isolated project declaration missing');
  require(Array.isArray(shards)&&shards.length===3&&Array.isArray(cases)&&cases.length>0&&new Set(cases).size===cases.length,'all three isolated projects required');
  require(new Set(shards.map(s=>s.project)).size===3&&productivityShardProjects.every(name=>shards.some(s=>s.project===name)),'duplicate or missing isolated project');
  for(const shard of shards){
   const {project,report,junit,manifest:m,engine,native,exits,serverLog}=shard;
   require(m?.executionJob===({chromium:'quality',firefox:'browser',webkit:'productivity-browser'})[project],'isolated producer job mismatch');
   require(m?.project===project&&m.commitSha===expected.commitSha&&m.lockSha256===expected.lockSha256&&m.nodeVersion===expected.nodeVersion&&m.platform==='win32'&&m.architecture==='x64'&&isDeepStrictEqual(m.productionBuild,expected.productionBuild),'isolated project source/runtime/build mismatch');
   require(m.synthetic===true&&[9,12,13].includes(m.productivityVersion)&&m.productivityVersion===(manifest.productivityVersion??9)&&isDeepStrictEqual(m.kanbanFixture,{taskRowsPreserved:true,boards:2,views:9})&&m.nativeHandlesClosed===true&&m.fixtureRemoved===true&&m.databaseClosed===true&&m.legacyPreserved===true&&m.integrity==='ok'&&m.error===null,'isolated fixture preservation/cleanup failed');
   require(Array.isArray(m.networkAttempts)&&m.networkAttempts.length===0&&Array.isArray(m.externalAttempts)&&m.externalAttempts.length===0,'isolated provider network attempted');
   require(['cli','browser','server'].every(kind=>m[kind+'ExitCode']===0&&m[kind+'Signal']===null),'isolated native process failed');
   require(['install','native','build','browsers-install','browser'].every(name=>exits?.[name]?.exitCode===0),'isolated native step missing or failed');
   require(native?.platform==='win32'&&native.architecture==='x64'&&native.nodeVersion===expected.nodeVersion&&native.addonVersion==='13.0.3'&&hash(native.binarySha256)&&native.binarySha256===m.addonSha256&&native.binarySha256===input.native?.binarySha256,'isolated native addon mismatch');
   require(engine?.browserName===project&&engine.platform==='win32'&&engine.architecture==='x64'&&engine.nodeVersion===expected.nodeVersion&&hash(engine.executableSha256)&&typeof engine.browserVersion==='string'&&engine.browserVersion.length>0&&isDeepStrictEqual(engine,input.engines?.find(e=>e?.browserName===project)),'isolated browser runtime mismatch');
   require(typeof serverLog==='string'&&(serverLog.match(/Server is running/g)??[]).length===1&&(serverLog.match(/Shutdown complete/g)??[]).length===1,'isolated server lifecycle log missing');
   require(hash(shard.blobSha256),'isolated Playwright blob missing');
   require(report?.config?.forbidOnly===true&&report.config.workers===1&&report.config.projects?.length===1&&report.config.projects[0].name===project&&report.config.projects[0].retries===0,'isolated configuration/retry policy mismatch');
   const seen=[];const walk=suites=>{require(Array.isArray(suites),'isolated suites missing');for(const suite of suites){for(const spec of suite.specs??[]){require(spec.ok===true&&cases.includes(spec.title)&&spec.tests?.length===1,'isolated undeclared/failed case');const test=spec.tests[0],result=test.results?.[0];require(test.projectName===project&&test.expectedStatus==='passed'&&test.status==='expected'&&test.results.length===1&&result.status==='passed'&&result.retry===0&&Array.isArray(result.errors)&&result.errors.length===0,'isolated failed/skipped/retried case');seen.push(spec.title);}if(suite.suites)walk(suite.suites);}};walk(report.suites);
   require(seen.length===cases.length&&new Set(seen).size===cases.length&&cases.every(name=>seen.includes(name))&&report.stats?.expected===cases.length&&['unexpected','flaky','skipped'].every(k=>report.stats[k]===0)&&Array.isArray(report.errors)&&report.errors.length===0,'isolated JSON inventory/totals mismatch');
   const tree=parseReleaseJUnit(junit),identities=[],number=(a,k,n)=>/^[0-9]+$/.test(a[k]??'')&&Number(a[k])===n;
   require(['tests','failures','errors','skipped'].every(k=>number(tree.attributes,k,k==='tests'?cases.length:0)),'isolated JUnit totals mismatch');
   for(const suite of tree.children){const rows=suite.children.filter(n=>n.tag==='testcase');require(suite.attributes.hostname===project&&['tests','failures','errors','skipped'].every(k=>number(suite.attributes,k,k==='tests'?rows.length:0)),'isolated JUnit project mismatch');for(const row of rows){require(row.children.every(n=>['system-out','system-err'].includes(n.tag)),'isolated JUnit failure/skip');identities.push(row.attributes.name);}}
   require(identities.length===cases.length&&new Set(identities).size===cases.length&&cases.every(name=>identities.includes(name)),'isolated JUnit inventory mismatch');
   if(project==='chromium')require(m.touchExitCode===0&&m.touchSignal===null&&m.nativeTouchVerified===true,'isolated native touch proof missing');
   else require(!Object.hasOwn(m,'touchExitCode')&&!Object.hasOwn(m,'touchSignal')&&!Object.hasOwn(m,'nativeTouchVerified'),'touch cannot be claimed on non-Chromium project');
  }
  return [];
 }catch(error){return ['isolated productivity projects rejected: '+(error instanceof Error?error.message:'invalid data')];}
}
/** Read only fixed project paths from an authenticated/extracted report root. */
export function readProductivityShardInputs(reader){return productivityShardProjects.map(project=>{const root='shards/'+project+'/',json=name=>reader.json(root+name),text=name=>reader.text(root+name);return {project,report:json('productivity-browser.json'),junit:text('productivity-browser.junit.xml'),manifest:json('productivity-browser-fixture.json'),engine:json('productivity-browser-runtime-'+project+'.json'),native:json('native.json'),exits:Object.fromEntries(['install','native','build','browsers-install','browser'].map(name=>[name,json(name+'-exit.json')])),serverLog:text('productivity-browser-server.log'),blobSha256:reader.hash(root+'report.zip')};});}
