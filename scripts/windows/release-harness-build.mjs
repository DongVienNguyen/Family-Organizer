import fs from 'node:fs';
import path from 'node:path';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {safeArchivePath} from './package-contract.mjs';
const reject=()=>{throw Error('RELEASE_HARNESS_BUILD_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
// The policy/receipts must come from the same authenticated collector process.
// This stage compares bytes/metadata and never executes target harness modules.
export function readReleaseHarnessAndBuild(directory,policy,packageProof,browserProof,expected){
 try{
  requireFact(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&Number.isSafeInteger(expected?.runId)&&expected.runId>0&&policy?.kind==='trusted-git-release-policy'&&policy?.source?.commitSha===expected.commitSha&&policy.publicationAllowed===false);
  for(const proof of [packageProof,browserProof])requireFact(proof?.commitSha===expected.commitSha&&proof?.runId===expected.runId);
  requireFact(packageProof.packageReportAgreement===true&&browserProof.rawBrowserVerified===true&&hash(packageProof.zipSha256));
  const declaration=policy.harnessPolicy;requireFact(hash(declaration?.workflowSha256)&&Array.isArray(declaration?.files)&&declaration.files.length>0&&declaration.files.length<=100);
  const names=new Set();for(const row of declaration.files){requireFact(typeof row?.sourcePath==='string'&&/^scripts\/(?:windows|ci)\/[A-Za-z0-9_-]+\.(?:mjs|cjs|ps1)$/.test(row.sourcePath)&&safeArchivePath(row.sourcePath)&&row.path===path.posix.basename(row.sourcePath)&&hash(row.sha256)&&!names.has(row.path.toLowerCase()));names.add(row.path.toLowerCase());}
  const reader=openReleaseReportFiles(directory);
  const snapshots=new Map(),same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
  const stable=()=>{
   const actual=fs.readdirSync(directory);requireFact(actual.length===declaration.files.length&&actual.every(name=>declaration.files.some(row=>row.path===name)));
   for(const row of declaration.files){const stat=fs.lstatSync(path.join(directory,row.path),{bigint:true});requireFact(stat.isFile()&&!stat.isSymbolicLink());const prior=snapshots.get(row.path);if(prior)requireFact(same(stat,prior));else snapshots.set(row.path,stat);}
  };
  stable();
  for(const row of declaration.files){requireFact(reader.hash(row.path,1024*1024)===row.sha256);stable();}
  const assets=packageProof.manifest?.files,build=browserProof.productionBuild;requireFact(Array.isArray(assets));
  for(const [name,key]of [['app/dist/server.cjs','serverSha256'],['app/dist/index.html','indexSha256']]){const matches=assets.filter(row=>row?.path===name);requireFact(matches.length===1&&hash(build?.[key])&&matches[0].sha256===build[key]);}
  const receipt=reader.receipt();stable();
  return {commitSha:expected.commitSha,runId:expected.runId,zipSha256:packageProof.zipSha256,rawHarnessFilesVerified:true,packageBuildAgreement:true,harnessFiles:declaration.files.length,innerPackageAgreement:false,reportsVerified:false,publicationAllowed:false,...receipt};
 }catch{reject();}
}
