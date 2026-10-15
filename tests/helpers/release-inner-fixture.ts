import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inventory,hashFile} from '../../scripts/windows/package-files.mjs';
import {windowsRuntime} from '../../scripts/windows/package-contract.mjs';
import {licenseTerms,httpEceNotice,mplNoticeSha256,sourceInventory} from '../../scripts/windows/license-inventory.mjs';
const repo=path.resolve(import.meta.dirname,'../..');
export function releaseInnerFixture(root:string){
 const directory=path.join(root,'inner');fs.mkdirSync(directory);
 const write=(name:string,value:string|Buffer)=>{const file=path.join(directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
 // Data fixtures: never executed; authenticated prior-proof objects are simulated.
 const names=['bin/node.exe','app/dist/server.cjs','app/dist/operator.cjs','app/dist/index.html','ops/Start-App.ps1','ops/Reset-Credentials.ps1','ops/Recovery.ps1','ops/Configure-Backup.ps1','licenses/node-LICENSE.txt','ops/Update.ps1','ops/Rollback.ps1','ops/UpdateCommon.ps1','ops/update-journal.mjs','app/node_modules/better-sqlite3/prebuilds/win32-x64.node'];
 for(const name of names)write(name,'synthetic never executed '+name);
 write('licenses/WinSW-LICENSE.txt',fs.readFileSync(path.join(repo,'scripts/windows/licenses/WinSW-2.12.0-LICENSE.txt')));
 write('app/package.json',JSON.stringify({version:'1.1.0'}));write('app/package-lock.json','{"lockfileVersion":3}');
 const dependencies:any[]=[];
 for(const [name,version,license]of [['better-sqlite3','13.0.3','MIT'],['http_ece','1.2.0','MIT'],['web-push','3.6.7','MPL-2.0']]){
  const prefix='app/node_modules/'+name;write(prefix+'/package.json',JSON.stringify({name,version,license}));write(prefix+'/LICENSE',name==='http_ece'?fs.readFileSync(path.join(repo,'scripts/windows/licenses/http_ece-1.2.0-LICENSE.txt')):fs.readFileSync(path.join(repo,'node_modules',name,'LICENSE')));dependencies.push({name,version,license,path:prefix,licenseTextStatus:'license-file',licenseFiles:[prefix+'/LICENSE']});
 }
 write('app/node_modules/web-push/src/index.js',fs.readFileSync(path.join(repo,'node_modules/web-push/src/index.js')));
 for(const term of licenseTerms)write(term.path,fs.readFileSync(path.join(repo,'scripts/windows',term.path)));
 const manifest:any={format:1,commitSha:'a'.repeat(40),appVersion:'1.1.0',platform:'win32',architecture:'x64',runtime:{...windowsRuntime,nodeExeSha256:hashFile(path.join(directory,'bin/node.exe'))},native:{version:'13.0.3',path:names.at(-1),sha256:hashFile(path.join(directory,names.at(-1)!))},schema:{legacy:{min:1,max:1},jobs:{min:1,max:1},snapshot:{min:1,max:1},domains:{productivity:{min:1,max:8},wallet:{min:1,max:1}}},dependencies,files:inventory(directory),server2019Acceptance:'not-run',licensePolicy:{version:1,terms:structuredClone(licenseTerms),httpEce:structuredClone(httpEceNotice),mplSource:{dependencyPath:'app/node_modules/web-push',version:'3.6.7',noticeSha256:mplNoticeSha256,files:sourceInventory(path.join(directory,'app/node_modules/web-push'))}}};
 write('release-manifest.json',JSON.stringify(manifest));const proof:any={commitSha:manifest.commitSha,runId:42,appVersion:manifest.appVersion,packageReportAgreement:true,zipSha256:'b'.repeat(64),manifest};
 const expected={commitSha:manifest.commitSha,runId:42,appVersion:manifest.appVersion,lockSha256:createHash('sha256').update('{"lockfileVersion":3}').digest('hex')};return {directory,proof,manifest,expected,write};
}
