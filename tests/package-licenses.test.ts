import {expect,it} from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const repoRoot=path.resolve(import.meta.dirname,'..');
const read=(file:string)=>fs.readFileSync(path.join(repoRoot,file),'utf8');
import {classifyLicenseNotice} from '../scripts/windows/license-policy.mjs';
const metadata={name:'synthetic-library',version:'1.0.0',license:'MIT'};
const mit=read('scripts/windows/licenses/http_ece-1.2.0-LICENSE.txt');
it('retains a complete original standalone MIT notice',()=>{expect(classifyLicenseNotice(metadata,[{name:'LICENSE',text:mit}])).toEqual({license:'MIT',licenseTextStatus:'license-file',licenseFiles:['LICENSE']});});
it.each(['cookie-signature','data-uri-to-buffer','isarray'])('recognizes the full embedded upstream MIT notice for %s',name=>{const directory=path.join(repoRoot,'node_modules',name);const file=fs.readdirSync(directory).find(n=>/^readme(?:\.|$)/i.test(n))!;const text=fs.readFileSync(directory+'/'+file,'utf8');const result=classifyLicenseNotice({...metadata,name},[{name:file,text}]);expect(result.licenseTextStatus).toBe('embedded-readme');expect(result.licenseFiles).toEqual(['package.json',file]);expect(text).toMatch(/Copyright/);});
it('retains original MPL source-form notice rather than replacing its copyright',()=>{const text=read('node_modules/web-push/LICENSE');expect(classifyLicenseNotice({...metadata,license:'MPL-2.0'},[{name:'LICENSE',text}])).toEqual({license:'MPL-2.0',licenseTextStatus:'license-file',licenseFiles:['LICENSE']});expect(text).toContain('Copyright 2015 Marco Castelluccio');});
it('preserves Apache terms with the existing declared identifier',()=>{const text=read('scripts/windows/licenses/source-APACHE-2.0.txt');expect(classifyLicenseNotice({...metadata,license:'Apache-2.0'},[{name:'LICENSE',text}]).license).toBe('Apache-2.0');});
it.each([
 ['missing declaration',{...metadata,license:undefined},[{name:'LICENSE',text:mit}]],
 ['unreviewed identifier',{...metadata,license:'GPL-3.0-only'},[{name:'LICENSE',text:mit}]],
 ['no notice',metadata,[]],
 ['empty notice',metadata,[{name:'LICENSE',text:''}]],
 ['heading-only MIT',metadata,[{name:'LICENSE',text:'MIT License'}]],
 ['metadata/readme only',metadata,[{name:'README.md',text:'Licensed under MIT. See upstream.'}]],
 ['mislabelled notice',metadata,[{name:'LICENSE',text:read('scripts/windows/licenses/source-APACHE-2.0.txt')}]],
 ['mislabelled Apache',{...metadata,license:'Apache-2.0'},[{name:'LICENSE',text:mit}]],
 ['mislabelled BSD',{...metadata,license:'BSD-3-Clause'},[{name:'LICENSE',text:mit}]],
 ['mislabelled MPL',{...metadata,license:'MPL-2.0'},[{name:'LICENSE',text:mit}]],
 ['unsafe notice path',metadata,[{name:'../LICENSE',text:mit}]],
])('rejects unresolved license evidence: %s',(_name,m,entries)=>{expect(()=>classifyLicenseNotice(m,entries)).toThrow();});
it.each([
 ['http_ece-1.2.0-LICENSE.txt','717363ac0c7f0883042868db171cfed1f4b423119249eac9bce5131291017ea8'],
 ['MPL-2.0.txt','66a3107d5ad6a058aab753eaac2047ccb2ed0e39465dd0fe5844da3e300d5172'],
 ['source-APACHE-2.0.txt','cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'],
])('preserves pinned original terms bytes for %s',(name,sha)=>{expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot,'scripts/windows/licenses',name))).digest('hex')).toBe(sha);});

import os from 'node:os';
import {licenseTerms,httpEceNotice,mplNoticeSha256,sourceInventory,verifyLicenseInventory} from '../scripts/windows/license-inventory.mjs';
function installedFixture(work:(root:string,manifest:any)=>void){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'license bytes dữ liệu '));
 try{
  for(const term of licenseTerms){fs.mkdirSync(path.dirname(path.join(root,term.path)),{recursive:true});fs.copyFileSync(path.join(repoRoot,'scripts/windows',term.path),path.join(root,term.path));}
  const http='app/node_modules/http_ece',mpl='app/node_modules/web-push';
  for(const directory of [http,mpl+'/src'])fs.mkdirSync(path.join(root,directory),{recursive:true});
  fs.copyFileSync(path.join(repoRoot,'scripts/windows/licenses/http_ece-1.2.0-LICENSE.txt'),path.join(root,http,'LICENSE'));
  fs.copyFileSync(path.join(repoRoot,'node_modules/web-push/LICENSE'),path.join(root,mpl,'LICENSE'));
  fs.copyFileSync(path.join(repoRoot,'node_modules/web-push/src/index.js'),path.join(root,mpl,'src/index.js'));
  for(const [directory,name,version,license]of [[http,'http_ece','1.2.0','MIT'],[mpl,'web-push','3.6.7','MPL-2.0']])fs.writeFileSync(path.join(root,directory,'package.json'),JSON.stringify({name,version,license}));
  const manifest={dependencies:[{name:'http_ece',version:'1.2.0',path:http,license:'MIT',licenseTextStatus:'license-file',licenseFiles:[http+'/LICENSE']},{name:'web-push',version:'3.6.7',path:mpl,license:'MPL-2.0',licenseTextStatus:'license-file',licenseFiles:[mpl+'/LICENSE']}],licensePolicy:{version:1,terms:structuredClone(licenseTerms),httpEce:structuredClone(httpEceNotice),mplSource:{dependencyPath:mpl,version:'3.6.7',noticeSha256:mplNoticeSha256,files:sourceInventory(path.join(root,mpl))}}};work(root,manifest);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
it('verifies actual notices, pinned shared terms and distributed original MPL source bytes',()=>installedFixture((root,manifest)=>{const result=verifyLicenseInventory(root,manifest);expect(result.dependencies).toBe(2);expect(result.mplSourceFiles).toBe(1);expect(result.termsVerified).toBe(true);}));
it.each(['missing policy','altered terms','altered upstream provenance','notice changed','MPL source changed','MPL source lost','MPL notice changed','unknown license','metadata fallback'])('refuses installed license %s drift',kind=>installedFixture((root,manifest)=>{
 if(kind==='missing policy')delete manifest.licensePolicy;
 if(kind==='altered terms')fs.appendFileSync(path.join(root,licenseTerms[0].path),'changed');
 if(kind==='altered upstream provenance')manifest.licensePolicy.httpEce.commitSha='a'.repeat(40);
 if(kind==='notice changed')fs.appendFileSync(path.join(root,httpEceNotice.path),'changed');
 if(kind==='MPL source changed')fs.appendFileSync(path.join(root,'app/node_modules/web-push/src/index.js'),'changed');
 if(kind==='MPL source lost')fs.unlinkSync(path.join(root,'app/node_modules/web-push/src/index.js'));
 if(kind==='MPL notice changed')fs.appendFileSync(path.join(root,'app/node_modules/web-push/LICENSE'),'changed');
 if(kind==='unknown license'){const file=path.join(root,'app/node_modules/http_ece/package.json');fs.writeFileSync(file,JSON.stringify({name:'http_ece',version:'1.2.0',license:'UNLICENSED'}));}
 if(kind==='metadata fallback')manifest.dependencies[0].licenseTextStatus='metadata-and-readme';
 expect(()=>verifyLicenseInventory(root,manifest)).toThrow();
}));
