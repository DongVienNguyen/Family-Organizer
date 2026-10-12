import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inventory, hashFile, verifyPackage } from './package-files.mjs';
import { windowsRuntime } from './package-contract.mjs';
const [root,commitSha]=process.argv.slice(2);
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.version,windowsRuntime.version);assert.equal(process.versions.modules,windowsRuntime.abi);assert.equal(process.versions.napi,windowsRuntime.napi);
const app=path.join(root,'app'),require=createRequire(path.join(app,'package.json')),Database=require('better-sqlite3');
const db=new Database(':memory:');try{assert.equal(db.prepare('select 42 as value').get().value,42);}finally{db.close();}
const dependencies=[];
function packages(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
 if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
 const folder=path.join(directory,entry.name);
 if(entry.name.startsWith('@')){packages(folder);continue;}
 const file=path.join(folder,'package.json');if(!fs.existsSync(file))continue;
 const metadata=JSON.parse(fs.readFileSync(file,'utf8')),relative=path.relative(root,folder).split(path.sep).join('/');
 const license=typeof metadata.license==='string'?metadata.license:metadata.license?.type;
 assert.ok(license,`Missing license declaration: ${metadata.name}`);
 let licenseFiles=fs.readdirSync(folder).filter(name=>/^(license|licence|copying|copyright)(?:\.|$)/i.test(name)&&fs.statSync(path.join(folder,name)).isFile());
 const licenseTextStatus=licenseFiles.length?'license-file':'metadata-and-readme';
 if(!licenseFiles.length)licenseFiles=['package.json',...fs.readdirSync(folder).filter(name=>/^readme(?:\.|$)/i.test(name))];
 dependencies.push({name:metadata.name,version:metadata.version,path:relative,license,licenseTextStatus,licenseFiles:licenseFiles.map(name=>relative+'/'+name)});
 if(fs.existsSync(path.join(folder,'node_modules')))packages(path.join(folder,'node_modules'));
}}
packages(path.join(app,'node_modules'));
const nativePath='app/node_modules/better-sqlite3/prebuilds/win32-x64.node';
const manifest={format:1,commitSha,appVersion:JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8')).version,platform:process.platform,architecture:process.arch,runtime:{...windowsRuntime,nodeExeSha256:hashFile(path.join(root,'bin/node.exe'))},native:{version:require('better-sqlite3/package.json').version,path:nativePath,sha256:hashFile(path.join(root,nativePath))},schema:{legacy:{min:1,max:1},jobs:{min:1,max:1},snapshot:{min:1,max:1},domains:{}},server2019Acceptance:'not-run',dependencies:dependencies.sort((a,b)=>a.path.localeCompare(b.path,'en')),files:inventory(root)};
fs.writeFileSync(path.join(root,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
verifyPackage(root,{commitSha,appVersion:manifest.appVersion});
console.log(JSON.stringify({commitSha,appVersion:manifest.appVersion,nodeExecutable:process.execPath,nodeVersion:process.version,addon:manifest.native,files:manifest.files.length,dependencies:dependencies.length,licenseMetadataOnly:dependencies.filter(d=>d.licenseTextStatus==='metadata-and-readme').map(d=>d.name)}));
