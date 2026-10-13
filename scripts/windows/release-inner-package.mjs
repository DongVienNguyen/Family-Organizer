import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../lib/native-paths.mjs';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {validateManifest,safeArchivePath} from './package-contract.mjs';
import {verifyLicenseInventory} from './license-inventory.mjs';
const reject=()=>{throw Error('RELEASE_INNER_PACKAGE_REJECTED');};
const requireFact=value=>{if(!value)reject();};
// Prior package proof and expected facts belong to the same authenticated
// collector process. Synthetic unit objects do not confer release authority.
export function readReleaseInnerPackage(directory,packageProof,expected){
 try{
  requireFact(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&Number.isSafeInteger(expected?.runId)&&expected.runId>0&&/^[a-f0-9]{64}$/.test(expected?.lockSha256??''));
  requireFact(packageProof?.packageReportAgreement===true&&packageProof.commitSha===expected.commitSha&&packageProof.runId===expected.runId&&packageProof.appVersion===expected.appVersion&&/^[a-f0-9]{64}$/.test(packageProof.zipSha256??''));
  const reader=openReleaseReportFiles(directory),manifest=reader.json('release-manifest.json');
  requireFact(isDeepStrictEqual(manifest,packageProof.manifest)&&validateManifest(manifest,expected).length===0);
  const snapshots=new Map();let nodes=0;
  const inventory=()=>{
   const found=[];nodes=0;
   const walk=folder=>{for(const name of fs.readdirSync(folder)){requireFact(++nodes<=100000);const file=path.join(folder,name),relative=path.relative(directory,file).split(path.sep).join('/');requireFact(safeArchivePath(relative));const stat=fs.lstatSync(file,{bigint:true});requireFact(!stat.isSymbolicLink()&&(stat.isFile()||stat.isDirectory()));const prior=snapshots.get(relative);if(prior)requireFact(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>prior[key]===stat[key]));else snapshots.set(relative,stat);if(stat.isDirectory())walk(file);else found.push(relative);}};walk(directory);return found.sort((a,b)=>a.localeCompare(b,'en'));
  };
  const names=['release-manifest.json',...manifest.files.map(row=>row.path)].sort((a,b)=>a.localeCompare(b,'en'));
  requireFact(isDeepStrictEqual(inventory(),names));
  for(const row of manifest.files){requireFact(snapshots.get(row.path)?.size===BigInt(row.size)&&reader.hash(row.path,128*1024*1024)===row.sha256);}
  requireFact(reader.hash('app/package-lock.json',1024*1024)===expected.lockSha256);
  const app=reader.json('app/package.json');requireFact(app.version===expected.appVersion);
  for(const dependency of manifest.dependencies){const metadata=reader.json(dependency.path+'/package.json');requireFact(metadata.name===dependency.name&&metadata.version===dependency.version&&(metadata.license?.type??metadata.license)===dependency.license);}
  const licenseAudit=verifyLicenseInventory(directory,manifest),receipt=reader.receipt();requireFact(isDeepStrictEqual(inventory(),names));
  return {commitSha:expected.commitSha,runId:expected.runId,zipSha256:packageProof.zipSha256,innerPackageAgreement:true,licenseInventoryVerified:true,verifiedFiles:manifest.files.length,licenseAudit,reportsVerified:false,publicationAllowed:false,...receipt};
 }catch{reject();}
}

export function extractReleaseInnerPackage(producerDirectory,directory,packageProof,expected,{execute}){
 try{
  requireFact(typeof execute==='function'&&isFullyQualifiedPath(directory)&&packageProof?.packageReportAgreement===true&&packageProof.commitSha===expected?.commitSha&&packageProof.runId===expected?.runId&&packageProof.appVersion===expected?.appVersion&&/^[a-f0-9]{64}$/.test(packageProof.zipSha256??''));
  requireFact(Number.isSafeInteger(packageProof.zipSize)&&packageProof.zipSize>0&&packageProof.zipSize<=64*1024*1024);
  const producer=openReleaseReportFiles(producerDirectory),name='family-organizer-win-x64.zip';requireFact(producer.hash(name,64*1024*1024)===packageProof.zipSha256&&producer.receipt().bytesHashed===packageProof.zipSize);
  assertNoLinkedAncestors(directory);fs.mkdirSync(directory);const owner=fs.lstatSync(directory,{bigint:true});
  const fixed=()=>{assertNoLinkedAncestors(directory);const current=fs.lstatSync(directory,{bigint:true});requireFact(current.isDirectory()&&!current.isSymbolicLink()&&current.dev===owner.dev&&current.ino===owner.ino);producer.receipt();};
  const destination=path.join(directory,'package'),result=execute({archivePath:path.join(producerDirectory,name),archiveSha256:packageProof.zipSha256,archiveBytes:packageProof.zipSize,destination});
  requireFact(result?.status===0&&result.signal===null&&!result.error);fixed();requireFact(result.stdout instanceof Uint8Array||typeof result.stdout==='string');const bytes=typeof result.stdout==='string'?Buffer.from(result.stdout):result.stdout;requireFact(bytes.length<=65536);const native=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  requireFact(Object.keys(native).sort().join(',')==='archiveBytes,archiveSha256,entryCount,exitCode,expandedBytes,files'&&native.exitCode===0&&native.archiveSha256===packageProof.zipSha256&&native.archiveBytes===packageProof.zipSize&&Number.isSafeInteger(native.entryCount)&&native.entryCount>=native.files&&native.entryCount<=100000&&Number.isSafeInteger(native.expandedBytes)&&native.expandedBytes>0&&native.expandedBytes<=1024*1024*1024);
  const inner=readReleaseInnerPackage(destination,packageProof,expected),manifestSize=fs.lstatSync(path.join(destination,'release-manifest.json')).size;
  requireFact(native.files===inner.verifiedFiles+1&&native.expandedBytes===packageProof.manifest.files.reduce((sum,row)=>sum+row.size,0)+manifestSize);fixed();
  return {...inner,innerExtractionVerified:true,nativeExtraction:native};
 }catch{reject();} // Preserve partial/replaced evidence; no target code or deletion.
}

export function validateReleaseInnerExtractionNative(report,expected){
 const errors=[],require=(ok,name)=>{if(!ok)errors.push(name);};
 require(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&['v22.23.3','v24.21.0'].includes(expected?.nodeVersion),'invalid native inner context');
 require(report?.commitSha===expected?.commitSha&&report?.nodeVersion===expected?.nodeVersion&&report?.platform==='win32'&&report?.architecture==='x64','native inner source/runtime mismatch');
 require(report?.archiveCount===2&&report?.extractedFiles===1&&report?.expandedBytes===20&&report?.positiveNativeExit===0&&report?.negativeNativeExit===1&&report?.negativeBeforeWriteAbsent===true,'native inner extraction/refusal incomplete');
 require(report?.fixtureCleanup===true&&report?.scope==='synthetic-no-github-authentication'&&report?.publicationAllowed===false&&report?.server2019Acceptance==='not-run'&&!['failed','failure','error'].some(key=>Object.hasOwn(report??{},key)),'native inner cleanup/scope/failure mismatch');
 return errors;
}
