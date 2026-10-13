import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
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
