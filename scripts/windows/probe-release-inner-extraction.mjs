import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ownSyntheticProxyFixture} from './caddy-contract.mjs';
import {isFullyQualifiedPath,assertNoLinkedAncestors} from '../lib/native-paths.mjs';
const [pwsh,report,commitSha]=process.argv.slice(2);
let owned;
try{
 assert.equal(process.argv.length,5);assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.match(commitSha??'',/^[a-f0-9]{40}$/);
 for(const file of [pwsh,report]){assert(isFullyQualifiedPath(file));assertNoLinkedAncestors(file);}assert(!fs.existsSync(report));assert(fs.statSync(path.dirname(report)).isDirectory());
 const root=path.join(os.tmpdir(),'fo release reports dữ liệu '+randomUUID());owned=ownSyntheticProxyFixture(root);
 const native=(script,args)=>spawnSync(pwsh,['-NoLogo','-NoProfile','-NonInteractive','-File',script,...args],{timeout:30000,maxBuffer:65536,windowsHide:true});
 const create=native(fileURLToPath(new URL('../../tests/windows/New-SyntheticInnerArchives.ps1',import.meta.url)),['-Root',root]);assert.equal(create.error,undefined);assert.equal(create.status,0);assert.equal(create.signal,null);
 const script=fileURLToPath(new URL('./Extract-ReleaseInnerPackage.ps1',import.meta.url));
 const invoke=(name,destination)=>{const file=path.join(root,name+'.zip'),bytes=fs.readFileSync(file);return native(script,['-ArchivePath',file,'-ArchiveSha256',createHash('sha256').update(bytes).digest('hex'),'-ArchiveBytes',String(bytes.length),'-Destination',destination]);};
 fs.writeFileSync(path.join(root,'outside-sentinel'),'SYNTHETIC_RETAINED');
 const positivePath=path.join(root,'positive extraction'),positive=invoke('positive',positivePath);assert.equal(positive.error,undefined);assert.equal(positive.status,0);assert.equal(positive.signal,null);const observation=JSON.parse(positive.stdout.toString('utf8'));assert.equal(observation.files,1);assert.equal(observation.expandedBytes,20);assert.equal(observation.exitCode,0);assert.equal(fs.readFileSync(path.join(positivePath,'synthetic dữ liệu with spaces.txt'),'utf8'),'SYNTHETIC_INNER_DATA');
 const negativePath=path.join(root,'negative before write'),negative=invoke('unsafe',negativePath);assert.equal(negative.error,undefined);assert.equal(negative.status,1);assert.equal(negative.signal,null);assert.equal(fs.existsSync(negativePath),false);assert.equal(fs.readFileSync(path.join(root,'outside-sentinel'),'utf8'),'SYNTHETIC_RETAINED');
 owned.dispose();assert(!fs.existsSync(root));
 fs.writeFileSync(report,JSON.stringify({commitSha,nodeVersion:process.version,platform:process.platform,architecture:process.arch,archiveCount:2,extractedFiles:1,expandedBytes:20,positiveNativeExit:0,negativeNativeExit:1,negativeBeforeWriteAbsent:true,fixtureCleanup:true,scope:'synthetic-no-github-authentication',publicationAllowed:false,server2019Acceptance:'not-run'},null,2)+'\n',{flag:'wx'});
 console.log('INNER_ZIP_EXTRACTED_UNSAFE_ENTRY_REFUSED_BEFORE_WRITE');
}catch{console.error('RELEASE_INNER_EXTRACTION_NATIVE_REJECTED');process.exitCode=1;}
// On unexpected failure preserve the whole owned tree rather than override an
// inner ownership refusal. No report claims successful cleanup in that case.
