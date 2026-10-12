import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {httpEceNotice} from './license-inventory.mjs';
const [repo,root]=process.argv.slice(2);
assert.equal(process.platform,'win32');
const app=path.join(root,'app');
const httpMetadata=JSON.parse(fs.readFileSync(path.join(app,'node_modules/http_ece/package.json'),'utf8'));
assert.equal(httpMetadata.version,httpEceNotice.version);assert.equal(httpMetadata.license,'MIT');
fs.copyFileSync(path.join(repo,'scripts/windows/licenses/http_ece-1.2.0-LICENSE.txt'),path.join(root,httpEceNotice.path));
for(const name of ['MPL-2.0.txt','source-APACHE-2.0.txt'])fs.copyFileSync(path.join(repo,'scripts/windows/licenses',name),path.join(root,'licenses',name));
fs.cpSync(path.join(repo,'dist'),path.join(app,'dist'),{recursive:true,filter:file=>!file.endsWith('.map')});
fs.mkdirSync(path.join(root,'ops'),{recursive:true});
for(const name of ['Start-App.ps1','package-contract.mjs','package-files.mjs','license-policy.mjs','license-inventory.mjs','reviewed-notices.mjs','release-manifest.schema.json','service-config.mjs','verify-installed-service.mjs','verify-service-owner.mjs','write-service-config.mjs','ServiceCommon.ps1','Install-Service.ps1','Uninstall-Service.ps1','Reset-Credentials.ps1','Recovery.ps1','Configure-Backup.ps1'])fs.copyFileSync(path.join(repo,'scripts/windows',name),path.join(root,'ops',name));
fs.copyFileSync(path.join(repo,'scripts/windows/licenses/WinSW-2.12.0-LICENSE.txt'),path.join(root,'licenses/WinSW-LICENSE.txt'));
fs.writeFileSync(path.join(root,'bin/family-organizer-service.exe.config'),'<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup></configuration>\n');
fs.copyFileSync(path.join(repo,'deploy/windows/FamilyOrganizer.xml'),path.join(root,'ops/service-template.xml'));
fs.copyFileSync(path.join(repo,'README.md'),path.join(root,'licenses','original-README.md'));
fs.writeFileSync(path.join(root,'licenses','source-attribution.txt'),`Family Organizer source: https://github.com/DongVienNguyen/Family-Organizer\nSource server.ts declares: @license SPDX-License-Identifier: Apache-2.0\nOriginal source/UI author attribution is preserved. No new copyright owner is asserted.\n`);
// Retain exact license/author metadata and available license texts for all build inputs,
// including the frontend libraries whose compiled code is distributed in dist/assets.
function notices(directory,relative=''){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
  const folder=path.join(directory,entry.name),key=relative+entry.name;
  if(entry.name.startsWith('@')){notices(folder,key+'/');continue;}
  const metadata=path.join(folder,'package.json');if(!fs.existsSync(metadata))continue;
  const target=path.join(root,'licenses','build-inputs',key);fs.mkdirSync(target,{recursive:true});fs.copyFileSync(metadata,path.join(target,'package.json'));
  for(const name of fs.readdirSync(folder))if(/^(license|licence|copying|copyright|readme)(?:\.|$)/i.test(name)&&fs.statSync(path.join(folder,name)).isFile())fs.copyFileSync(path.join(folder,name),path.join(target,name));
  if(fs.existsSync(path.join(folder,'node_modules')))notices(path.join(folder,'node_modules'),key+'/node_modules/');
 }
}
notices(path.join(repo,'node_modules'));
// Product data/secrets and dependency development fixtures are never distributed.
function prune(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
 const file=path.join(directory,entry.name);
 if(entry.isSymbolicLink()){fs.rmSync(file,{recursive:true,force:true});continue;}
 if(entry.isDirectory()&&/^(?:tests?|fixtures|reports|\.github|\.bin)$/i.test(entry.name)){fs.rmSync(file,{recursive:true,force:true});continue;}
 if(entry.isFile()&&(/^\.env(?:\.|$)/i.test(entry.name)||(/\.node$/i.test(entry.name)&&file!==path.join(app,'node_modules/better-sqlite3/prebuilds/win32-x64.node')))){fs.rmSync(file);continue;}
 if(entry.isDirectory())prune(file);
}}
prune(path.join(app,'node_modules'));
