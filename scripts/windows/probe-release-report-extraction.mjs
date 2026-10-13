import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ownSyntheticProxyFixture} from './caddy-contract.mjs';
import {extractReleaseReportArchives} from './release-report-extraction.mjs';
import {isFullyQualifiedPath,assertNoLinkedAncestors} from '../lib/native-paths.mjs';
const [pwsh,report,commitSha]=process.argv.slice(2);
let owned;
try{
 assert.equal(process.argv.length,5);assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.match(commitSha??'',/^[a-f0-9]{40}$/);
 for(const file of [pwsh,report]){assert(isFullyQualifiedPath(file));assertNoLinkedAncestors(file);}assert(!fs.existsSync(report));assert(fs.statSync(path.dirname(report)).isDirectory());
 const root=path.join(os.tmpdir(),'fo release reports dữ liệu '+randomUUID());owned=ownSyntheticProxyFixture(root);
 const native=(script,args)=>spawnSync(pwsh,['-NoLogo','-NoProfile','-NonInteractive','-File',script,...args],{timeout:30000,maxBuffer:65536,windowsHide:true});
 const create=native(fileURLToPath(new URL('../../tests/windows/New-SyntheticReportArchives.ps1',import.meta.url)),['-Root',root,'-CommitSha',commitSha]);assert.equal(create.error,undefined);assert.equal(create.status,0);assert.equal(create.signal,null);
 const prefixes=['windows-node22','windows-node24','windows-browsers','windows-package','windows-package-harness','windows-package-tests','windows-service-tests'];
 const archives=prefixes.map((prefix,index)=>{const file=path.join(root,(index+1)+'.zip'),bytes=fs.readFileSync(file);return {artifactId:index+1,name:prefix+'-'+commitSha+'-1',file,bytes:bytes.length,archiveSha256:createHash('sha256').update(bytes).digest('hex')};});
 const receipt={format:1,kind:'github-artifact-archives',publicationAllowed:false,reportsVerified:false,metadata:{request:{commitSha,runId:1},artifacts:archives.map(row=>({id:row.artifactId,name:row.name,digest:'sha256:'+row.archiveSha256}))},archives,totalBytes:archives.reduce((sum,row)=>sum+row.bytes,0)};
 const script=fileURLToPath(new URL('./Extract-ReleaseReportArchives.ps1',import.meta.url));
 fs.writeFileSync(path.join(root,'outside-sentinel'),'SYNTHETIC_RETAINED');
 const positive=extractReleaseReportArchives(receipt,path.join(root,'positive extraction'),{execute:({inputFile,directory})=>native(script,['-InputFile',inputFile,'-Destination',directory])});
 assert.equal(positive.files,7);assert.equal(positive.expandedBytes,1470);
 for(const row of positive.archives)assert.equal(fs.readFileSync(path.join(row.directory,'synthetic dữ liệu with spaces.json'),'utf8'),'SYNTHETIC_REPORT_DATA'.repeat(10));
 const negative=path.join(root,'negative before write');fs.mkdirSync(negative);
 const input=path.join(root,'negative.json');fs.writeFileSync(input,JSON.stringify(archives));
 const refused=native(script,['-InputFile',input,'-Destination',negative,'-MaxExpandedBytes','1000']);assert.equal(refused.error,undefined);assert.equal(refused.status,1);assert.equal(refused.signal,null);assert.deepEqual(fs.readdirSync(negative),[]);
 assert.equal(fs.readFileSync(path.join(root,'outside-sentinel'),'utf8'),'SYNTHETIC_RETAINED');
 owned.dispose();assert(!fs.existsSync(root));
 fs.writeFileSync(report,JSON.stringify({commitSha,nodeVersion:process.version,platform:process.platform,architecture:process.arch,archiveCount:7,extractedFiles:7,expandedBytes:1470,positiveNativeExit:0,negativeNativeExit:1,negativeBeforeWriteEmpty:true,fixtureCleanup:true,scope:'synthetic-no-github-authentication',publicationAllowed:false,server2019Acceptance:'not-run'},null,2)+'\n',{flag:'wx'});
 console.log('SEVEN_ARCHIVES_EXTRACTED_BATCH_BUDGET_REFUSED_BEFORE_WRITE');
}catch{console.error('RELEASE_REPORT_EXTRACTION_NATIVE_REJECTED');process.exitCode=1;}
// On unexpected failure preserve the whole owned tree rather than override an
// inner ownership refusal. No report claims successful cleanup in that case.
