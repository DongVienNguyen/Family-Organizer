import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewedNotices} from './reviewed-notices.mjs';
import {classifyLicenseNotice} from './license-policy.mjs';
import {verifyWalletPdfLicense} from './wallet-pdf-license.mjs';
export const licenseTerms=Object.freeze([
 {path:'licenses/MPL-2.0.txt',sha256:'66a3107d5ad6a058aab753eaac2047ccb2ed0e39465dd0fe5844da3e300d5172'},
 {path:'licenses/source-APACHE-2.0.txt',sha256:'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'},
]);
export const httpEceNotice=Object.freeze({path:'app/node_modules/http_ece/LICENSE',version:'1.2.0',commitSha:'0562510a30819f52424724a6fd5504becacd98a1',blobSha:'d6a83c0df8d8f56a8d49f0b666f2033edd26cf18',sha256:'717363ac0c7f0883042868db171cfed1f4b423119249eac9bce5131291017ea8'});
export const mplNoticeSha256='1fe5dbc03ffe518da23f1297de78ab5612532eddca93cca287a8dfaf4ad7ddce';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function sourceInventory(root){
 const result=[];
 function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  assert.ok(!entry.isSymbolicLink(),'MPL source symlink');const file=path.join(directory,entry.name);
  if(entry.isDirectory())walk(file);else if(entry.isFile()&&entry.name.endsWith('.js'))result.push({path:path.relative(root,file).split(path.sep).join('/'),sha256:hash(file)});
 }}walk(path.join(root,'src'));assert.ok(result.length>0,'MPL source missing');return result.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
export function verifyLicenseInventory(root,manifest){
 verifyWalletPdfLicense(root,manifest);
 assert.equal(manifest.licensePolicy?.version,1,'Missing license policy');
 assert.deepEqual(manifest.licensePolicy.terms,licenseTerms,'License terms/provenance changed');
 assert.deepEqual(manifest.licensePolicy.httpEce,httpEceNotice,'Upstream MIT provenance changed');
 for(const notice of [...licenseTerms,httpEceNotice])assert.equal(hash(path.join(root,notice.path)),notice.sha256,'Pinned terms bytes changed');
 assert.ok(manifest.dependencies.some(d=>d.name==='http_ece'&&d.version===httpEceNotice.version));
 const sources=manifest.licensePolicy.mplSource;
 assert.equal(sources?.dependencyPath,'app/node_modules/web-push');assert.equal(sources?.version,'3.6.7');
 assert.equal(sources.noticeSha256,mplNoticeSha256,'MPL original notice provenance changed');
 assert.equal(hash(path.join(root,sources.dependencyPath,'LICENSE')),mplNoticeSha256,'MPL original copyright/notice bytes changed');
 const metadata=JSON.parse(fs.readFileSync(path.join(root,sources.dependencyPath,'package.json'),'utf8'));assert.equal(metadata.name,'web-push');assert.equal(metadata.version,sources.version);assert.equal(metadata.license,'MPL-2.0');
 assert.deepEqual(sourceInventory(path.join(root,sources.dependencyPath)),sources.files,'Distributed MPL source changed');
 for(const dependency of manifest.dependencies){
  const metadata=JSON.parse(fs.readFileSync(path.join(root,dependency.path,'package.json'),'utf8'));
  const entries=dependency.licenseFiles.filter(file=>!file.endsWith('/package.json')).map(file=>({name:path.basename(file),text:fs.readFileSync(path.join(root,file),'utf8')}));
  const reviewed=reviewedNotices[metadata.name+'@'+metadata.version];
  assert.ok(reviewed,'Dependency notice/version requires review');assert.equal(metadata.license?.type??metadata.license,reviewed.license,'Reviewed license declaration changed');
  assert.deepEqual(Object.fromEntries(dependency.licenseFiles.map(file=>[path.relative(path.join(root,dependency.path),path.join(root,file)).split(path.sep).join('/'),hash(path.join(root,file))])),reviewed.files,'Original reviewed notice bytes changed');
  const classified=classifyLicenseNotice(metadata,entries);
  assert.equal(classified.license,dependency.license);assert.equal(classified.licenseTextStatus,dependency.licenseTextStatus);
  assert.deepEqual(classified.licenseFiles.map(file=>dependency.path+'/'+file),dependency.licenseFiles,'License notice inventory changed');
 }
 return {policyVersion:1,dependencies:manifest.dependencies.length,embeddedReadmeNotices:manifest.dependencies.filter(d=>d.licenseTextStatus==='embedded-readme').map(d=>d.name),mplSourceFiles:sources.files.length,termsVerified:true,originalCopyrightPreserved:true};
}
