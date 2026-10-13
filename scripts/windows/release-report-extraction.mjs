import fs from 'node:fs';
import path from 'node:path';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {safeArchivePath} from './package-contract.mjs';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../lib/native-paths.mjs';
const reject=()=>{throw Error('RELEASE_REPORT_EXTRACTION_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const positive=value=>Number.isSafeInteger(value)&&value>0;
export function validateReleaseReportExtractionNative(report,expected){
 const errors=[],require=(ok,name)=>{if(!ok)errors.push(name);};
 require(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&['v22.23.3','v24.21.0'].includes(expected?.nodeVersion),'invalid expected extraction context');
 require(report?.commitSha===expected?.commitSha&&report?.nodeVersion===expected?.nodeVersion&&report?.platform==='win32'&&report?.architecture==='x64','foreign native extraction source/runtime');
 require(report?.archiveCount===7&&report?.extractedFiles===7&&report?.expandedBytes===1470&&report?.positiveNativeExit===0&&report?.negativeNativeExit===1&&report?.negativeBeforeWriteEmpty===true,'native extraction/batch refusal incomplete');
 require(report?.fixtureCleanup===true&&report?.scope==='synthetic-no-github-authentication'&&report?.publicationAllowed===false&&report?.server2019Acceptance==='not-run','native extraction cleanup/scope mismatch');
 return errors;
}
export function preflightReleaseReportArchives(receipt){
 try{
  const sha=receipt?.metadata?.request?.commitSha;
  requireFact(receipt?.format===1&&receipt.kind==='github-artifact-archives'&&receipt.publicationAllowed===false&&receipt.reportsVerified===false&&/^[a-f0-9]{40}$/.test(sha??'')&&positive(receipt.metadata.request.runId));
  const names=['windows-node22','windows-node24','windows-browsers','windows-package','windows-package-harness','windows-package-tests','windows-service-tests'].map(prefix=>prefix+'-'+sha+'-1');
  requireFact(Array.isArray(receipt.archives)&&receipt.archives.length===7&&Array.isArray(receipt.metadata.artifacts)&&receipt.metadata.artifacts.length===7);
  const ids=new Set();let total=0;
  const rows=names.map(name=>{
   const matches=receipt.archives.filter(a=>a?.name===name),metadata=receipt.metadata.artifacts.filter(a=>a?.name===name);requireFact(matches.length===1&&metadata.length===1);
   const row=matches[0],artifact=metadata[0];requireFact(positive(row.artifactId)&&!ids.has(row.artifactId)&&row.artifactId===artifact.id&&/^[a-f0-9]{64}$/.test(row.archiveSha256)&&artifact.digest==='sha256:'+row.archiveSha256&&positive(row.bytes)&&row.bytes<=512*1024*1024&&isFullyQualifiedPath(row.file));
   ids.add(row.artifactId);total+=row.bytes;requireFact(total<=1024*1024*1024);
   const reader=openReleaseReportFiles(path.dirname(row.file));requireFact(fs.lstatSync(row.file).size===row.bytes&&reader.hash(path.basename(row.file),row.bytes)===row.archiveSha256);
   return {artifactId:row.artifactId,name,file:row.file,bytes:row.bytes,archiveSha256:row.archiveSha256};
  });
  requireFact(total===receipt.totalBytes);return rows;
 }catch{reject();}
}
// The adapter must pass a receipt returned by collectReleaseArchives in the same
// process. This helper adds extraction proof, never authenticated API authority.
export function extractReleaseReportArchives(receipt,directory,{execute}){
 try{
  const rows=preflightReleaseReportArchives(receipt);requireFact(typeof execute==='function'&&isFullyQualifiedPath(directory));assertNoLinkedAncestors(directory);
  const parents=[];for(let file=path.dirname(directory);;file=path.dirname(file)){const stat=fs.lstatSync(file,{bigint:true});requireFact(stat.isDirectory()&&!stat.isSymbolicLink());parents.push({file,dev:stat.dev,ino:stat.ino});if(path.dirname(file)===file)break;}
  fs.mkdirSync(directory);const identity=fs.lstatSync(directory,{bigint:true});
  const fixed=()=>{assertNoLinkedAncestors(directory);for(const parent of [{file:directory,dev:identity.dev,ino:identity.ino},...parents]){const stat=fs.lstatSync(parent.file,{bigint:true});requireFact(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.dev===parent.dev&&stat.ino===parent.ino);}};
  const input=path.join(directory,'.archive-input.json');fs.writeFileSync(input,JSON.stringify(rows),{flag:'wx'});
  const result=execute({inputFile:input,directory});requireFact(result?.status===0&&result.signal===null&&!result.error);fixed();
  requireFact(result.stdout instanceof Uint8Array||typeof result.stdout==='string');const bytes=typeof result.stdout==='string'?Buffer.from(result.stdout):result.stdout;requireFact(bytes.length<=65536);
  const observed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));requireFact(observed.exitCode===0&&Array.isArray(observed.archives)&&observed.archives.length===7);
  let total=0,files=0;
  for(const row of rows){
   const matches=observed.archives.filter(a=>a?.artifactId===row.artifactId&&a.name===row.name);requireFact(matches.length===1);
   const directoryRoot=path.join(directory,row.name);let size=0,count=0;
   const walk=folder=>{assertNoLinkedAncestors(folder);for(const name of fs.readdirSync(folder)){const file=path.join(folder,name),relative=path.relative(directoryRoot,file).split(path.sep).join('/');requireFact(safeArchivePath(relative));const stat=fs.lstatSync(file);requireFact(!stat.isSymbolicLink());if(stat.isDirectory())walk(file);else{requireFact(stat.isFile()&&stat.size<=128*1024*1024);size+=stat.size;count++;requireFact(count<=100000&&size<=1024*1024*1024);}}};walk(directoryRoot);
   requireFact(count===matches[0].files&&size===matches[0].expandedBytes);total+=size;files+=count;requireFact(total<=1024*1024*1024&&files<=100000);
  }
  requireFact(total===observed.expandedBytes&&Number.isSafeInteger(observed.entryCount)&&observed.entryCount>=files&&observed.entryCount<=100000);fixed();
  fs.unlinkSync(input);
  return {publicationAllowed:false,reportsVerified:false,archives:rows.map(row=>({...row,directory:path.join(directory,row.name)})),expandedBytes:total,files};
 }catch{reject();} // Preserve failed/replaced trees. Never recursive-delete an unproved owner.
}
