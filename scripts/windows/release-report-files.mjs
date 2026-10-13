import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {safeArchivePath} from './package-contract.mjs';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../lib/native-paths.mjs';
import {validateReleaseQualityReports} from './release-quality-reports.mjs';
const reject=()=>{throw Error('RELEASE_REPORT_FILES_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const positive=value=>Number.isSafeInteger(value)&&value>0;
// Reports remain data. All callers must obtain the root from authenticated archive
// extraction; a user-supplied JSON or root is never GitHub authority.
export function openReleaseReportFiles(root,{maxFileBytes=64*1024*1024,maxTotalBytes=256*1024*1024}={}){
 try{
  requireFact(positive(maxFileBytes)&&maxFileBytes<=64*1024*1024&&positive(maxTotalBytes)&&maxTotalBytes<=256*1024*1024&&isFullyQualifiedPath(root));
  assertNoLinkedAncestors(root);
  const parents=[];for(let current=root;;current=path.dirname(current)){const stat=fs.lstatSync(current,{bigint:true});requireFact(stat.isDirectory()&&!stat.isSymbolicLink());parents.push({file:current,dev:stat.dev,ino:stat.ino});if(path.dirname(current)===current)break;}
  let bytesRead=0,filesRead=0;const reportHashes={};
  const fixed=()=>{for(const parent of parents){const stat=fs.lstatSync(parent.file,{bigint:true});requireFact(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.dev===parent.dev&&stat.ino===parent.ino);}};
  const open=name=>{fixed();requireFact(safeArchivePath(name)&&!name.endsWith('/'));const file=path.join(root,...name.split('/'));assertNoLinkedAncestors(file);const stat=fs.lstatSync(file,{bigint:true});requireFact(stat.isFile()&&!stat.isSymbolicLink());const fd=fs.openSync(file,'r');try{const actual=fs.fstatSync(fd,{bigint:true});requireFact(actual.isFile()&&actual.dev===stat.dev&&actual.ino===stat.ino);fixed();return {fd,file,identity:actual};}catch(error){fs.closeSync(fd);throw error;}};
  const unchanged=handle=>{fixed();assertNoLinkedAncestors(handle.file);for(const stat of [fs.fstatSync(handle.fd,{bigint:true}),fs.lstatSync(handle.file,{bigint:true})])requireFact(stat.isFile()&&!stat.isSymbolicLink()&&stat.dev===handle.identity.dev&&stat.ino===handle.identity.ino&&stat.size===handle.identity.size&&stat.mtimeNs===handle.identity.mtimeNs&&stat.ctimeNs===handle.identity.ctimeNs);};
  const text=name=>{
   let handle,buffer;try{handle=open(name);const size=Number(handle.identity.size);requireFact(Number.isSafeInteger(size)&&size<=maxFileBytes&&size<=maxTotalBytes-bytesRead);buffer=Buffer.alloc(size);let offset=0;while(offset<size){const count=fs.readSync(handle.fd,buffer,offset,size-offset,null);requireFact(count>0);offset+=count;}const tail=Buffer.alloc(1);requireFact(fs.readSync(handle.fd,tail,0,1,null)===0);unchanged(handle);const result=new TextDecoder('utf-8',{fatal:true}).decode(buffer);bytesRead+=size;filesRead++;reportHashes[name]=createHash('sha256').update(buffer).digest('hex');return result;}catch{reject();}finally{buffer?.fill(0);if(handle)fs.closeSync(handle.fd);}
  };
  return {text,json(name){try{return JSON.parse(text(name));}catch{reject();}},hash(name,maxBytes=512*1024*1024){
   let handle;const buffer=Buffer.alloc(65536);try{requireFact(positive(maxBytes)&&maxBytes<=512*1024*1024);handle=open(name);requireFact(handle.identity.size<=BigInt(maxBytes));const hash=createHash('sha256');let size=0;for(;;){const count=fs.readSync(handle.fd,buffer,0,buffer.length,null);if(!count)break;size+=count;requireFact(size<=maxBytes);hash.update(buffer.subarray(0,count));}requireFact(BigInt(size)===handle.identity.size);unchanged(handle);return hash.digest('hex');}catch{reject();}finally{buffer.fill(0);if(handle)fs.closeSync(handle.fd);}
  },receipt(){fixed();return {filesRead,bytesRead,reportHashes:{...reportHashes}};}};
 }catch{reject();}
}

export function readReleaseQualityFiles(directory,expected){
 try{
  const reader=openReleaseReportFiles(directory);
  const evidence=reader.json('evidence.json'),tests=reader.json('vitest.json'),junit=reader.text('junit.xml');
  const exits=Object.fromEntries(['install','native','lint','test','build','production','audit','coverage'].map(name=>[name,reader.json(name+'-exit.json')]));
  requireFact(validateReleaseQualityReports({expected,evidence,tests,junit,exits}).length===0);
  return {commitSha:expected.commitSha,runId:expected.runId,major:expected.major,tests:tests.numTotalTests,passed:tests.numPassedTests,files:tests.testResults.length,failed:tests.numFailedTests,pending:tests.numPendingTests,todo:tests.numTodoTests,rawAssertionsVerified:true,otherReportsVerified:false,publicationAllowed:false,...reader.receipt()};
 }catch{reject();}
}
