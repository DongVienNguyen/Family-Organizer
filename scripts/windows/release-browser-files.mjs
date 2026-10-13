import {isDeepStrictEqual} from 'node:util';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {validateBrowserReports} from '../ci/browser-contract.mjs';
import {safeArchivePath} from './package-contract.mjs';
import {windowsSqliteBinarySha256,nativeChecks} from './release-runtime-reports.mjs';
const reject=()=>{throw Error('RELEASE_BROWSER_FILES_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function readReleaseBrowserFiles(directory,policy,expected){
 try{
  requireFact(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&Number.isSafeInteger(expected?.runId)&&expected.runId>0&&expected.nodeVersion==='v24.21.0'&&policy?.kind==='trusted-git-release-policy'&&policy.publicationAllowed===false&&policy.source?.commitSha===expected.commitSha&&hash(policy.lockSha256)&&hash(policy.browserPolicy?.contractSha256));
  const reader=openReleaseReportFiles(directory),evidence=reader.json('browser-evidence.json'),report=reader.json('browser.json'),junit=reader.text('browser.junit.xml'),manifest=reader.json('browser-fixture.json'),native=reader.json('native.json');
  const projects=policy.browserPolicy.projects,engines=projects.map(name=>reader.json('browser-runtime-'+name+'.json'));
  const exits=Object.fromEntries(['install','native','build','browsers-install','browser'].map(name=>[name,reader.json(name+'-exit.json')]));
  requireFact(evidence.commitSha===expected.commitSha&&evidence.nodeVersion===expected.nodeVersion&&evidence.lockSha256===policy.lockSha256&&evidence.workflowRunUrl==='https://github.com/DongVienNguyen/Family-Organizer/actions/runs/'+expected.runId&&evidence.runAttempt===1&&Array.isArray(evidence.errors)&&evidence.errors.length===0&&isDeepStrictEqual(evidence.manifest,manifest)&&isDeepStrictEqual(evidence.engines,engines));
  requireFact(native.binarySha256===windowsSqliteBinarySha256&&native.nodeABI==='137'&&native.bindingApi==='N-API'&&native.nodeNapi==='10'&&native.sqliteVersion==='3.53.4'&&native.binaryPath==='prebuilds/win32-x64.node'&&Array.isArray(native.checks)&&native.checks.length===nativeChecks.length&&new Set(native.checks).size===nativeChecks.length&&nativeChecks.every(name=>native.checks.includes(name)));
  requireFact(Object.keys(evidence.checks??{}).length===4&&['install','native','build','browser'].every(name=>evidence.checks[name]==='success'));
  requireFact(evidence.hashes&&typeof evidence.hashes==='object'&&!Array.isArray(evidence.hashes)&&Object.keys(evidence.hashes).length>0&&Object.keys(evidence.hashes).length<=100000);
  const names=Object.keys(evidence.hashes);requireFact(new Set(names.map(name=>name.toLowerCase())).size===names.length);
  const mandatory=['browser.json','browser.junit.xml','browser-fixture.json','native.json',...projects.map(name=>'browser-runtime-'+name+'.json'),...Object.keys(exits).map(name=>name+'-exit.json')];
  const parsedHashes=reader.receipt().reportHashes;
  for(const name of mandatory)requireFact(Object.hasOwn(evidence.hashes,name)&&hash(evidence.hashes[name])&&evidence.hashes[name]===parsedHashes[name]);
  for(const [name,digest]of Object.entries(evidence.hashes))requireFact(safeArchivePath(name)&&!name.endsWith('/')&&name!=='browser-evidence.json'&&hash(digest)&&reader.hash(name)===digest);
  const required=['browser-html/index.html','browser-run.log','browsers-install.log','browser-server.log'];
  const files=required.filter(name=>{requireFact(Object.hasOwn(evidence.hashes,name));return reader.text(name).length>0;});
  const server=reader.text('browser-server.log');requireFact((server.match(/Server is running/g)??[]).length===1&&(server.match(/Shutdown complete/g)??[]).length===1);
  requireFact(evidence.reportSha256===evidence.hashes['browser.json']&&evidence.reportSha256===reader.receipt().reportHashes['browser.json']);
  const context={commitSha:expected.commitSha,nodeVersion:expected.nodeVersion,lockSha256:policy.lockSha256,productionBuild:evidence.productionBuild};
  requireFact(validateBrowserReports({report,junit,manifest,engines,exits,native,checks:evidence.checks,files,expected:context},policy.browserPolicy).length===0);
  return {commitSha:expected.commitSha,runId:expected.runId,nodeVersion:expected.nodeVersion,cases:projects.length*policy.browserPolicy.cases.length,rawBrowserVerified:true,innerPackageAgreement:false,reportsVerified:false,publicationAllowed:false,productionBuild:manifest.productionBuild,engines,fixtureCleanup:manifest.fixtureRemoved,...reader.receipt()};
 }catch{reject();}
}
