import {validateCutoverSourcePolicy}from'./release-cutover-source-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {validateManifest,safeArchivePath} from './package-contract.mjs';
import {serviceRuntime} from './service-config.mjs';
import {windowsSqliteBinarySha256} from './release-runtime-reports.mjs';
import {isReleaseVersion} from './release-evidence.mjs';
const reject=()=>{throw Error('RELEASE_PACKAGE_REPORTS_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const exits=(value,names)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name)&&value[name]===0);
// This stage binds raw report metadata and actual ZIP digest. It deliberately
// does not certify ZIP entries/licenses, functional reports or publication.
export function readReleasePackageReportFiles(producerDirectory,consumerDirectory,expected){
 try{
  requireFact(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&Number.isSafeInteger(expected?.runId)&&expected.runId>0&&isReleaseVersion(expected?.appVersion));
  const producer=openReleaseReportFiles(producerDirectory),consumer=openReleaseReportFiles(consumerDirectory);
  const evidence=producer.json('producer-evidence.json'),producerExit=producer.json('producer-exit.json'),manifest=producer.json('release-manifest.json'),consumerExit=consumer.json('package-exit.json'),validation=consumer.json('package-validation.json');
  const cutoverPackagePolicy=expected.cutoverPackagePolicy;requireFact(cutoverPackagePolicy===undefined||validateCutoverSourcePolicy(cutoverPackagePolicy));requireFact(manifest?.schema?.domains?.productivity?.max===(cutoverPackagePolicy?13:9));
  const runUrl='https://github.com/DongVienNguyen/Family-Organizer/actions/runs/'+expected.runId;
  for(const row of [evidence,producerExit,manifest,consumerExit,validation])requireFact(row.commitSha===expected.commitSha);
  for(const row of [evidence,producerExit,consumerExit])requireFact(row.runUrl===runUrl);
  for(const row of [evidence,validation])requireFact(row.appVersion===expected.appVersion&&row.platform==='win32'&&row.architecture==='x64');
  requireFact(validateManifest(manifest,{commitSha:expected.commitSha,appVersion:expected.appVersion}).length===0&&isDeepStrictEqual(manifest.service,serviceRuntime)&&manifest.runtime.nodeExeSha256===serviceRuntime.nodeExeSha256&&manifest.native.sha256===windowsSqliteBinarySha256);
  requireFact(manifest.files.find(file=>file.path==='bin/family-organizer-service.exe')?.sha256===serviceRuntime.sha256);
  const dependency=manifest.dependencies.find(row=>row.path==='app/node_modules/better-sqlite3');
  requireFact(dependency?.name==='better-sqlite3'&&dependency.version===manifest.native.version);
  requireFact(producerExit.exitCode===0&&producerExit.fixtureCleanup===true&&producerExit.failure===null&&exits(producerExit.nativeExitCodes,['git','install','prepare','manifest'])&&exits(evidence.nativeExitCodes,['install','prepare','manifest']));
  requireFact(consumerExit.exitCode===0&&consumerExit.fixtureCleanup===true&&consumerExit.sourceCheckoutPresent===false&&consumerExit.consumerInstall===false&&consumerExit.consumerRebuild===false&&exits(consumerExit.nativeExitCodes,['validation','launchValidation','launchWhatIf','denyAcl','production','functional','recovery','privateSettings','signingKey','providerEnv','onlineRecovery','boards','restoreAcl',...(cutoverPackagePolicy?['cutover']:[])]));
  requireFact(validation.nodeVersion==='v24.21.0'&&validation.abi==='137'&&validation.napi==='10'&&validation.verifiedFiles===manifest.files.length&&validation.verifiedDependencies===manifest.dependencies.length&&validation.manifestVerified===true&&validation.nativeDatabaseClosed===true);
  const executable=validation.nodeExecutable;
  requireFact(typeof executable==='string'&&/^[a-z]:\\/i.test(executable)&&path.win32.normalize(executable)===executable&&safeArchivePath(executable.slice(3).replaceAll('\\','/'))&&executable.endsWith('\\bin\\node.exe'));
  const release=path.win32.dirname(path.win32.dirname(executable)),fixtureRoot=path.win32.dirname(release);
  requireFact(path.win32.basename(release)==='release with spaces'&&/^fo package dữ liệu [a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(path.win32.basename(fixtureRoot))&&path.win32.join(release,'bin','node.exe')===executable);
  const name='family-organizer-win-x64.zip',file=path.join(producerDirectory,name),size=fs.lstatSync(file).size;
  // Current artifact is below64MiB. Larger packages require reviewed budgets.
  requireFact(Number.isSafeInteger(size)&&size>0&&size<=64*1024*1024&&size===evidence.zipSize&&hex(evidence.zipSha256)&&consumerExit.zipSha256===evidence.zipSha256&&producer.hash(name,64*1024*1024)===evidence.zipSha256&&producer.receipt().bytesHashed===size);
  return {commitSha:expected.commitSha,runId:expected.runId,appVersion:expected.appVersion,zipSha256:evidence.zipSha256,zipSize:size,manifest,validation,...(cutoverPackagePolicy?{cutoverPackagePolicy:structuredClone(cutoverPackagePolicy)}:{}),packageReportAgreement:true,innerPackageAgreement:false,consumerFunctionalVerified:false,reportsVerified:false,publicationAllowed:false,producer:producer.receipt(),consumer:consumer.receipt()};
 }catch{reject();}
}
