import {validateMatrixTouchReports,matrixTouchCase} from '../ci/matrix-touch-contract.mjs';
import {isDeepStrictEqual} from 'node:util';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {validateBrowserReports} from '../ci/browser-contract.mjs';
import {safeArchivePath} from './package-contract.mjs';
import {windowsSqliteBinarySha256,nativeChecks} from './release-runtime-reports.mjs';
const reject=()=>{throw Error('RELEASE_PRODUCTIVITY_BROWSER_FILES_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function readReleaseProductivityBrowserFiles(directory,policy,expected){
 try{
  requireFact(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&Number.isSafeInteger(expected?.runId)&&expected.runId>0&&expected.nodeVersion==='v24.21.0'&&policy?.kind==='trusted-git-release-policy'&&policy.publicationAllowed===false&&policy.source?.commitSha===expected.commitSha&&hash(policy.lockSha256)&&hash(policy.productivityBrowserPolicy?.contractSha256));
  const reader=openReleaseReportFiles(directory),evidence=reader.json('productivity-browser-evidence.json'),report=reader.json('productivity-browser.json'),junit=reader.text('productivity-browser.junit.xml'),manifest=reader.json('productivity-browser-fixture.json'),native=reader.json('native.json');
  requireFact(policy.productivityBrowserPolicy.touch?.project==='chromium'&&policy.productivityBrowserPolicy.touch.case===matrixTouchCase&&hash(policy.productivityBrowserPolicy.touch.contractSha256));
  const touch={report:reader.json('productivity-browser-touch.json'),junit:reader.text('productivity-browser-touch.junit.xml'),runtime:reader.json('productivity-browser-touch-runtime.json')};
  const projects=policy.productivityBrowserPolicy.projects,engines=projects.map(name=>reader.json('productivity-browser-runtime-'+name+'.json'));
  const exits=Object.fromEntries(['install','native','build','browsers-install','browser'].map(name=>[name,reader.json(name+'-exit.json')]));
  requireFact(evidence.commitSha===expected.commitSha&&evidence.nodeVersion===expected.nodeVersion&&evidence.lockSha256===policy.lockSha256&&evidence.workflowRunUrl==='https://github.com/DongVienNguyen/Family-Organizer/actions/runs/'+expected.runId&&evidence.runAttempt===1&&Array.isArray(evidence.errors)&&evidence.errors.length===0&&isDeepStrictEqual(evidence.manifest,manifest)&&isDeepStrictEqual(evidence.engines,engines));
  requireFact(isDeepStrictEqual(evidence.touch,touch)&&manifest.error===null&&manifest.synthetic===true&&manifest.productivityVersion===6&&manifest.nativeHandlesClosed===true&&Array.isArray(manifest.networkAttempts)&&manifest.networkAttempts.length===0&&manifest.browserExitCode===0&&manifest.browserSignal===null);
  requireFact(native.binarySha256===windowsSqliteBinarySha256&&native.nodeABI==='137'&&native.bindingApi==='N-API'&&native.nodeNapi==='10'&&native.sqliteVersion==='3.53.4'&&native.binaryPath==='prebuilds/win32-x64.node'&&Array.isArray(native.checks)&&native.checks.length===nativeChecks.length&&new Set(native.checks).size===nativeChecks.length&&nativeChecks.every(name=>native.checks.includes(name)));
  requireFact(Object.keys(evidence.checks??{}).length===4&&['install','native','build','browser'].every(name=>evidence.checks[name]==='success'));
  requireFact(evidence.hashes&&typeof evidence.hashes==='object'&&!Array.isArray(evidence.hashes)&&Object.keys(evidence.hashes).length>0&&Object.keys(evidence.hashes).length<=100000);
  const names=Object.keys(evidence.hashes);requireFact(new Set(names.map(name=>name.toLowerCase())).size===names.length);
  const mandatory=['productivity-browser-touch.json','productivity-browser-touch.junit.xml','productivity-browser-touch-runtime.json',...['productivity-browser.json','productivity-browser.junit.xml','productivity-browser-fixture.json','native.json',...projects.map(name=>'productivity-browser-runtime-'+name+'.json'),...Object.keys(exits).map(name=>name+'-exit.json')]];
  const parsedHashes=reader.receipt().reportHashes;
  for(const name of mandatory)requireFact(Object.hasOwn(evidence.hashes,name)&&hash(evidence.hashes[name])&&evidence.hashes[name]===parsedHashes[name]);
  for(const [name,digest]of Object.entries(evidence.hashes))requireFact(safeArchivePath(name)&&!name.endsWith('/')&&name!=='productivity-browser-evidence.json'&&hash(digest)&&reader.hash(name)===digest);
  const required=['productivity-browser-html/index.html','productivity-browser-run.log','browsers-install.log','productivity-browser-server.log','productivity-browser-touch-html/index.html','productivity-browser-native.log'];
  const files=required.filter(name=>{requireFact(Object.hasOwn(evidence.hashes,name));return reader.text(name).length>0;});
  const server=reader.text('productivity-browser-server.log');requireFact((server.match(/Server is running/g)??[]).length===1&&(server.match(/Shutdown complete/g)??[]).length===1);
  requireFact(evidence.reportSha256===evidence.hashes['productivity-browser.json']&&evidence.reportSha256===reader.receipt().reportHashes['productivity-browser.json']);
  const context={commitSha:expected.commitSha,nodeVersion:expected.nodeVersion,lockSha256:policy.lockSha256,productionBuild:evidence.productionBuild};
  const mappedFiles=files.filter(name=>!['productivity-browser-touch-html/index.html','productivity-browser-native.log'].includes(name)).map(name=>name.replace(/^productivity-browser-/,'browser-'));
  requireFact(validateBrowserReports({report,junit,manifest,engines,exits,native,checks:evidence.checks,files:mappedFiles,expected:context},policy.productivityBrowserPolicy).length===0);
  requireFact(validateMatrixTouchReports({touch,engines,manifest,expected:context}).length===0);
  const screenshots=Object.keys(evidence.hashes).filter(name=>/^productivity-browser-matrix-[A-Za-z0-9_-]+\.png$/.test(name));requireFact(screenshots.length===12);
  return {commitSha:expected.commitSha,runId:expected.runId,nodeVersion:expected.nodeVersion,cases:projects.length*policy.productivityBrowserPolicy.cases.length,touchCases:1,failed:0,skipped:0,retries:0,touchFailed:0,touchSkipped:0,touchRetries:0,nativeTouchVerified:true,matrixScreenshots:12,contractSha256:policy.productivityBrowserPolicy.contractSha256,touchContractSha256:policy.productivityBrowserPolicy.touch.contractSha256,rawProductivityBrowserVerified:true,innerPackageAgreement:false,reportsVerified:false,publicationAllowed:false,productionBuild:manifest.productionBuild,engines,fixtureCleanup:manifest.fixtureRemoved,...reader.receipt()};
 }catch{reject();}
}
