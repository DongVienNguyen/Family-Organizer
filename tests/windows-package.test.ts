import { expect, it } from 'vitest';
import { validateArchiveEntries, validateManifest, retainsSnapshotRows } from '../scripts/windows/package-contract.mjs';
const sha='a'.repeat(40),hash='b'.repeat(64);
const nodeArchive='158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541';
const paths=['bin/node.exe','app/dist/server.cjs','app/dist/operator.cjs','app/dist/index.html','app/package.json','app/package-lock.json','app/node_modules/better-sqlite3/prebuilds/win32-x64.node','ops/Start-App.ps1','ops/Reset-Credentials.ps1','ops/Recovery.ps1','ops/Configure-Backup.ps1','licenses/node-LICENSE.txt','ops/Update.ps1','ops/Rollback.ps1','ops/UpdateCommon.ps1','ops/update-journal.mjs','app/node_modules/better-sqlite3/LICENSE','app/node_modules/better-sqlite3/package.json'];
function fixture():any{return {format:1,commitSha:sha,appVersion:'1.1.0',platform:'win32',architecture:'x64',runtime:{version:'v24.21.0',abi:'137',napi:'10',archiveSha256:nodeArchive,nodeExeSha256:hash},native:{version:'13.0.3',path:paths[6],sha256:hash},schema:{legacy:{min:1,max:1},jobs:{min:1,max:1},snapshot:{min:1,max:1},domains:{}},files:paths.map(path=>({path,size:1,sha256:hash})),dependencies:[{name:'better-sqlite3',version:'13.0.3',license:'MIT',path:'app/node_modules/better-sqlite3',licenseFiles:['app/node_modules/better-sqlite3/LICENSE']}],server2019Acceptance:'not-run'};}
it('accepts a known Windows manifest and safe Unicode/space archive paths',()=>{expect(validateManifest(fixture(),{commitSha:sha,appVersion:'1.1.0'})).toEqual([]);expect(validateArchiveEntries([{path:'app/dữ liệu with spaces.txt',size:1,compressedSize:1,attributes:0}])).toEqual([]);});
it.each(['../outside','/outside','C:/outside','app\\outside','app/file:stream','app/CON.txt','app/NUL','app/file.','app/file ','app//file','app/./file','app/../file','app/COM1.log','app/LPT9.log','app/COM¹.log','app/COM²','app/COM³','app/LPT¹','app/LPT².log','app/LPT³'])('rejects unsafe Windows ZIP path %s',path=>{expect(validateArchiveEntries([{path,size:1,compressedSize:1,attributes:0}]).length).toBeGreaterThan(0);});
it.each([
 ['symlink',{path:'app/linked',size:1,compressedSize:1,attributes:0xa0000000}],
 ['reparse',{path:'app/linked',size:1,compressedSize:1,attributes:1024}],
 ['negative size',{path:'app/file',size:-1,compressedSize:1,attributes:0}],
 ['oversized file',{path:'app/file',size:129*1024*1024,compressedSize:1,attributes:0}],
 ['decompression bomb',{path:'app/file',size:4*1024*1024,compressedSize:1,attributes:0}],
])('rejects %s ZIP entry',(_kind,entry)=>{expect(validateArchiveEntries([entry]).length).toBeGreaterThan(0);});
it('rejects duplicate/case-aliased archive entries',()=>{expect(validateArchiveEntries([{path:'app/file',size:1,compressedSize:1,attributes:0},{path:'APP/FILE',size:1,compressedSize:1,attributes:0}]).length).toBeGreaterThan(0);});
it('rejects an archive file that also owns child paths',()=>{expect(validateArchiveEntries([{path:'app',size:1,compressedSize:1,attributes:0},{path:'app/file',size:1,compressedSize:1,attributes:0}]).length).toBeGreaterThan(0);});
it('rejects an empty archive',()=>{expect(validateArchiveEntries([]).length).toBeGreaterThan(0);});
const corruptions:[string,(f:any)=>void][]=[
 ['unknown format',f=>f.format=2],['wrong source',f=>f.commitSha='c'.repeat(40)],['version mismatch',f=>f.appVersion='2.0.0'],['wrong OS',f=>f.platform='linux'],['wrong architecture',f=>f.architecture='arm64'],['wrong runtime',f=>f.runtime.version='v22.23.3'],['wrong ABI',f=>f.runtime.abi='127'],['wrong NAPI',f=>f.runtime.napi='9'],['untrusted Node archive',f=>f.runtime.archiveSha256='c'.repeat(64)],['wrong native version',f=>f.native.version='11.10.0'],['native hash contradiction',f=>f.native.sha256='c'.repeat(64)],['node executable hash contradiction',f=>f.runtime.nodeExeSha256='c'.repeat(64)],['missing files',f=>f.files=[]],['case-aliased file',f=>f.files.push({...f.files[0],path:'BIN/NODE.EXE'})],['unsafe file',f=>f.files.push({path:'../outside',size:1,sha256:hash})],['invalid file hash',f=>f.files[0].sha256=[hash]],['invalid file size',f=>f.files[0].size=-1],['missing required asset',f=>f.files=f.files.slice(1)],['bundled provider secrets',f=>f.files.push({path:'app/.env',size:1,sha256:hash})],['bundled application data',f=>f.files.push({path:'app/data/family.db',size:1,sha256:hash})],['bundled devtools',f=>f.files.push({path:'app/node_modules/vitest/package.json',size:1,sha256:hash})],['bundled app tests',f=>f.files.push({path:'tests/synthetic.test.ts',size:1,sha256:hash})],['missing schema bounds',f=>delete f.schema.jobs],['inverted schema bounds',f=>f.schema.legacy={min:2,max:1}],['unsupported schema bounds',f=>f.schema.legacy={min:1,max:999}],['Server2019 false claim',f=>f.server2019Acceptance='passed'],['missing dependency manifest',f=>f.dependencies=[]],['missing dependency license',f=>f.dependencies[0].license=''],['missing license files',f=>f.dependencies[0].licenseFiles=[]],
];
it.each(corruptions)('rejects manifest %s',(_name,change)=>{const f=fixture();change(f);expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'}).length).toBeGreaterThan(0);});

it('allows required third-party runtime data assets',()=>{const f=fixture();f.files.push({path:'app/node_modules/example/data/table.bin',size:1,sha256:hash});expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toEqual([]);});
it.each(['license','package metadata'])('rejects missing distributed dependency %s bytes',kind=>{const f=fixture();f.files=f.files.filter(file=>file.path!==f.dependencies[0].path+(kind==='license'?'/LICENSE':'/package.json'));expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'}).length).toBeGreaterThan(0);});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hashFile,inventory,verifyPackage} from '../scripts/windows/package-files.mjs';
function diskFixture(work:(root:string)=>void){const root=fs.mkdtempSync(path.join(os.tmpdir(),'package bytes dữ liệu '));try{const f=fixture();for(const file of f.files){const target=path.join(root,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'synthetic');}fs.writeFileSync(path.join(root,'app/node_modules/better-sqlite3/package.json'),JSON.stringify({name:'better-sqlite3',version:'13.0.3',license:'MIT'}));f.files=inventory(root);f.runtime.nodeExeSha256=hashFile(path.join(root,'bin/node.exe'));f.native.sha256=hashFile(path.join(root,f.native.path));fs.writeFileSync(path.join(root,'release-manifest.json'),JSON.stringify(f));work(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
it('verifies all actual files, dependency identity and hashes from a Unicode disk root',()=>diskFixture(root=>{expect(verifyPackage(root,{commitSha:sha,appVersion:'1.1.0'}).commitSha).toBe(sha);}));
it.each(['modified file','missing file','extra file','dependency name','dependency version','dependency license'])('rejects packaged %s drift',kind=>diskFixture(root=>{const target=path.join(root,'app/dist/server.cjs');if(kind==='modified file')fs.writeFileSync(target,'tampered');else if(kind==='missing file')fs.unlinkSync(target);else if(kind==='extra file')fs.writeFileSync(path.join(root,'unexpected.txt'),'synthetic');else{const file=path.join(root,'app/node_modules/better-sqlite3/package.json');const metadata=JSON.parse(fs.readFileSync(file,'utf8'));metadata[kind.split(' ')[1]]='contradiction';fs.writeFileSync(file,JSON.stringify(metadata));const f=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));f.files=inventory(root);fs.writeFileSync(path.join(root,'release-manifest.json'),JSON.stringify(f));}expect(()=>verifyPackage(root,{commitSha:sha,appVersion:'1.1.0'})).toThrow();}));

it('allows static license metadata for a build input named @playwright/test',()=>{const f=fixture();for(const name of ['package.json','LICENSE'])f.files.push({path:'licenses/build-inputs/@playwright/test/'+name,size:1,sha256:hash});expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toEqual([]);});
it.each(['synthetic.test.ts','.env'])('rejects license-directory camouflage of %s',name=>{const f=fixture();f.files.push({path:'licenses/build-inputs/example/tests/'+name,size:1,sha256:hash});expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'}).length).toBeGreaterThan(0);});

it('rejects a package missing its offline credential reentry script',()=>{const f=fixture();f.files=f.files.filter((file:any)=>file.path!=='ops/Reset-Credentials.ps1');expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toContain('missing package asset: ops/Reset-Credentials.ps1');});

it('retains exact snapshot columns/values despite JSON canonical key ordering',()=>{
 const actual=[{command:'legacy:saveTransaction',request_id:'synthetic-id',actor_id:'synthetic',payload_hash:'synthetic-digest',result:'{"value":{"id":"synthetic-finance","amount":321}}',committed_at:'synthetic-time'}];
 const canonical=actual.map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))));
 expect(JSON.stringify(actual)).not.toBe(JSON.stringify(canonical));expect(retainsSnapshotRows(actual,canonical)).toBe(true);
});
it.each(['result','payload_hash','request_id','actor_id','committed_at','command'])('rejects loss/change of snapshot %s despite other matching columns',field=>{
 const saved={command:'synthetic',request_id:'synthetic-id',actor_id:'synthetic',payload_hash:'synthetic-digest',result:'{"value":321}',committed_at:'synthetic-time'};
 expect(retainsSnapshotRows([{...saved,[field]:'changed'}],[saved])).toBe(false);
 const missing={...saved} as any;delete missing[field];expect(retainsSnapshotRows([missing],[saved])).toBe(false);
});

it('rejects a package missing its owned encrypted recovery script',()=>{const f=fixture();f.files=f.files.filter((file:any)=>file.path!=='ops/Recovery.ps1');expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toContain('missing package asset: ops/Recovery.ps1');});

it('rejects a package missing its owned backup configuration script',()=>{const f=fixture();f.files=f.files.filter((file:any)=>file.path!=='ops/Configure-Backup.ps1');expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toContain('missing package asset: ops/Configure-Backup.ps1');});
it.each(['app/recovery-backup.key','app/recovery-backup.json','ops/synthetic.fo-recovery'])('rejects per-instance backup material in the release ZIP: %s',name=>{const f=fixture();f.files.push({path:name,size:64,sha256:hash});expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toContain('excluded secrets/data/tests/devtools in package');});
it.each(['update-control.json','app/config/update-control.json','app/UPDATE-CONTROL.JSON'])('excludes per-instance update control %s from the release',name=>{const f=fixture();f.files.push({path:name,size:1,sha256:hash});expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toContain('excluded secrets/data/tests/devtools in package');});

it.each(['ops/Update.ps1','ops/Rollback.ps1','ops/UpdateCommon.ps1','ops/update-journal.mjs'])('requires owned update/rollback asset %s',asset=>{const f=fixture();f.files=f.files.filter(row=>row.path!==asset);expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toContain('missing package asset: '+asset);});
it.each(['update-journal.json','app/service/update-journal.json'])('excludes instance journal %s from packages',name=>{const f=fixture();f.files.push({path:name,size:1,sha256:hash});expect(validateManifest(f,{commitSha:sha,appVersion:'1.1.0'})).toContain('excluded secrets/data/tests/devtools in package');});
