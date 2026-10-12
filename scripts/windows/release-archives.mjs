import fs from 'node:fs';
import path from 'node:path';
import {collectReleaseMetadata} from './release-metadata.mjs';
import {createHash} from 'node:crypto';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../lib/native-paths.mjs';
const reject=()=>{throw new Error('RELEASE_ARCHIVE_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const positive=value=>Number.isSafeInteger(value)&&value>0;
function storageUrl(location){
 requireFact(typeof location==='string'&&location.length<=16384);
 const url=new URL(location);
 requireFact(url.protocol==='https:'&&url.username===''&&url.password===''&&url.port===''&&url.hash==='');
 requireFact(/^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(url.hostname)||/^[a-z0-9-]+\.actions\.githubusercontent\.com$/.test(url.hostname));
 return url.href;
}
// The caller must obtain artifact ID/digest from the authenticated metadata
// collector. This utility authenticates archive bytes, not report contents.
export function createArtifactDownloader(token,{fetchImpl=globalThis.fetch,maxBytes=512*1024*1024,timeoutMs=120000}={}){
 requireFact(typeof token==='string'&&token.length>0&&!/[\r\n]/.test(token)&&typeof fetchImpl==='function'&&positive(maxBytes)&&maxBytes<=512*1024*1024&&positive(timeoutMs)&&timeoutMs<=120000);
 return async(artifact,file)=>{
  let fd,reader,response,owned=false,identity;
  try{
   requireFact(positive(artifact?.id)&&typeof artifact.digest==='string'&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest));
   requireFact(isFullyQualifiedPath(file));assertNoLinkedAncestors(file);
   const parents=[];for(let current=path.dirname(file);;current=path.dirname(current)){const stat=fs.lstatSync(current,{bigint:true});requireFact(stat.isDirectory()&&!stat.isSymbolicLink());parents.push({file:current,dev:stat.dev,ino:stat.ino});if(path.dirname(current)===current)break;}
   fd=fs.openSync(file,'wx');owned=true;identity=fs.fstatSync(fd,{bigint:true});
   const signal=AbortSignal.timeout(timeoutMs);
   const api=await fetchImpl(`https://api.github.com/repos/DongVienNguyen/Family-Organizer/actions/artifacts/${artifact.id}/zip`,{method:'GET',redirect:'manual',signal,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
   let location;try{requireFact(api.status===302);location=storageUrl(api.headers.get('location'));}finally{await api.body?.cancel();}
   // Signed storage GET deliberately carries no Authorization or other API headers.
   response=await fetchImpl(location,{method:'GET',redirect:'manual',signal});
   if(response.status!==200){await response.body?.cancel();reject();}
   const declared=response.headers.get('content-length');requireFact(declared===null||(/^[0-9]+$/.test(declared)&&positive(Number(declared))&&Number(declared)<=maxBytes));
   requireFact(response.body&&typeof response.body.getReader==='function');reader=response.body.getReader();
   let size=0;const hash=createHash('sha256');
   for(;;){const part=await reader.read();if(part.done)break;requireFact(part.value instanceof Uint8Array);size+=part.value.length;requireFact(size<=maxBytes);hash.update(part.value);let offset=0;while(offset<part.value.length){const count=fs.writeSync(fd,part.value,offset,part.value.length-offset);requireFact(count>0);offset+=count;}}
   const archiveSha256=hash.digest('hex');requireFact(size>0&&(declared===null||Number(declared)===size)&&'sha256:'+archiveSha256===artifact.digest);
   assertNoLinkedAncestors(file);for(const parent of parents){const stat=fs.lstatSync(parent.file,{bigint:true});requireFact(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.dev===parent.dev&&stat.ino===parent.ino);}
   const fixed=fs.lstatSync(file,{bigint:true}),descriptor=fs.fstatSync(fd,{bigint:true});requireFact(fixed.isFile()&&!fixed.isSymbolicLink()&&fixed.dev===identity.dev&&fixed.ino===identity.ino&&fixed.nlink===1n&&descriptor.size===BigInt(size)&&fixed.size===descriptor.size);
   fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;owned=false;
   return {artifactId:artifact.id,bytes:size,archiveSha256,file};
  }catch{throw new Error('RELEASE_ARCHIVE_REJECTED');}
  finally{
   if(reader){try{await reader.cancel();}catch{}reader.releaseLock();}else{try{await response?.body?.cancel();}catch{}}
   try{if(fd!==undefined)fs.closeSync(fd);if(owned){assertNoLinkedAncestors(file);const current=fs.lstatSync(file,{bigint:true,throwIfNoEntry:false});if(current&&current.dev===identity.dev&&current.ino===identity.ino&&!current.isSymbolicLink())fs.unlinkSync(file);}}catch{reject();}
  }
 };
}

function verifyArchiveFile(receipt){
 assertNoLinkedAncestors(receipt.file);const before=fs.lstatSync(receipt.file,{bigint:true});requireFact(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size===BigInt(receipt.bytes));
 const fd=fs.openSync(receipt.file,'r'),buffer=Buffer.alloc(65536),hash=createHash('sha256');
 try{
  const initial=fs.fstatSync(fd,{bigint:true});requireFact(initial.dev===before.dev&&initial.ino===before.ino&&initial.nlink===1n&&initial.size===before.size);let size=0;
  for(;;){const count=fs.readSync(fd,buffer,0,buffer.length,null);if(count===0)break;size+=count;requireFact(size<=receipt.bytes);hash.update(buffer.subarray(0,count));}
  const after=fs.fstatSync(fd,{bigint:true});assertNoLinkedAncestors(receipt.file);const fixed=fs.lstatSync(receipt.file,{bigint:true});
  requireFact(size===receipt.bytes&&hash.digest('hex')===receipt.archiveSha256&&after.nlink===1n&&fixed.isFile()&&!fixed.isSymbolicLink()&&fixed.nlink===1n);
  for(const stat of [after,fixed])for(const key of ['dev','ino','size','mtimeNs','ctimeNs'])requireFact(stat[key]===initial[key]);
 }finally{buffer.fill(0);fs.closeSync(fd);}
}

export async function collectReleaseArchives(request,authority,directory,{maxTotalBytes=1024*1024*1024}={}){
 let owned=false,identity;
 try{
  requireFact(positive(maxTotalBytes)&&maxTotalBytes<=1024*1024*1024&&typeof authority?.download==='function'&&isFullyQualifiedPath(directory));
  const metadata=await collectReleaseMetadata(request,authority);
  assertNoLinkedAncestors(directory);fs.mkdirSync(directory);owned=true;identity=fs.lstatSync(directory,{bigint:true});
  const archives=[];let totalBytes=0;
  for(const artifact of metadata.artifacts){
   const file=path.join(directory,artifact.id+'.zip'),receipt=await authority.download(artifact,file);
   requireFact(receipt?.artifactId===artifact.id&&receipt.file===file&&positive(receipt.bytes)&&'sha256:'+receipt.archiveSha256===artifact.digest);
   const stat=fs.lstatSync(file);requireFact(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size===receipt.bytes);
   totalBytes+=receipt.bytes;requireFact(totalBytes<=maxTotalBytes);archives.push({...receipt,name:artifact.name});
  }
  assertNoLinkedAncestors(directory);const current=fs.lstatSync(directory,{bigint:true});requireFact(current.dev===identity.dev&&current.ino===identity.ino&&current.isDirectory());
  for(const receipt of archives)verifyArchiveFile(receipt);
  owned=false;return {format:1,kind:'github-artifact-archives',publicationAllowed:false,reportsVerified:false,metadata,archives,totalBytes};
 }catch{throw new Error('RELEASE_ARCHIVE_REJECTED');}
 finally{if(owned){try{assertNoLinkedAncestors(directory);const current=fs.lstatSync(directory,{bigint:true,throwIfNoEntry:false});if(current&&current.dev===identity.dev&&current.ino===identity.ino&&current.isDirectory()&&!current.isSymbolicLink())fs.rmSync(directory,{recursive:true,force:true});}catch{reject();}}}
}
