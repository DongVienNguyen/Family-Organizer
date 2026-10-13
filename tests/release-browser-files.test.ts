import {it,expect,afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {releaseBrowserFixture} from './helpers/release-browser-fixture';
import {releaseRuntimeFixture} from './helpers/release-runtime-fixture';
import * as collector from '../scripts/windows/release-browser-files.mjs';
const roots:string[]=[];const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function fixture(cases?:readonly string[]){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'release browser raw '));roots.push(root);
 const value=releaseBrowserFixture(cases);value.native=releaseRuntimeFixture().native;value.manifest.addonSha256=value.native.binarySha256;
 const raw:Record<string,string>={'browser.json':JSON.stringify(value.report),'browser.junit.xml':value.junit,'browser-fixture.json':JSON.stringify(value.manifest),'native.json':JSON.stringify(value.native),'browser-html/index.html':'<html>synthetic report</html>','browser-run.log':'synthetic native browser run','browsers-install.log':'synthetic browser install','browser-server.log':'Server is running\nShutdown complete\n'};
 for(const [name,exit]of Object.entries(value.exits))raw[name+'-exit.json']=JSON.stringify(exit);
 for(const engine of value.engines)raw['browser-runtime-'+engine.browserName+'.json']=JSON.stringify(engine);
 const evidence={...value.expected,workflowRunUrl:'https://github.com/DongVienNguyen/Family-Organizer/actions/runs/42',runAttempt:1,checks:value.checks,engines:value.engines,manifest:structuredClone(value.manifest),reportSha256:hash(raw['browser.json']),hashes:Object.fromEntries(Object.entries(raw).map(([n,t])=>[n,hash(t)])),errors:[]};
 const policy={kind:'trusted-git-release-policy',publicationAllowed:false,source:{commitSha:value.expected.commitSha},lockSha256:value.expected.lockSha256,browserPolicy:{projects:['chromium','firefox','webkit'],cases:value.report.suites[0].specs.map((s:any)=>s.title),contractSha256:'d'.repeat(64)}};
 const save=()=>{for(const [name,text]of Object.entries(raw)){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),text);}fs.writeFileSync(path.join(root,'browser-evidence.json'),JSON.stringify(evidence));};save();return {root,value,raw,evidence,policy,save,expected:{commitSha:value.expected.commitSha,runId:42,nodeVersion:'v24.21.0'}};
}
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const read=(f:ReturnType<typeof fixture>)=>(collector as any).readReleaseBrowserFiles(f.root,f.policy,f.expected);
it('validates actual raw browser bytes while inner package agreement/publication remain unverified',()=>expect(read(fixture())).toMatchObject({rawBrowserVerified:true,innerPackageAgreement:false,reportsVerified:false,publicationAllowed:false}));
it('uses the target Git case set for an older supported report',()=>expect(read(fixture(['B01 synthetic login','B02 synthetic reload']))).toMatchObject({cases:6}));
it.each(['browser.json','browser.junit.xml','browser-fixture.json','native.json','browser-evidence.json','browser-html/index.html','browser-runtime-firefox.json'])('rejects missing actual browser report %s',name=>{const f=fixture();fs.unlinkSync(path.join(f.root,name));expect(()=>read(f)).toThrow('RELEASE_BROWSER_FILES_REJECTED');});
it.each(['commitSha','nodeVersion','lockSha256','workflowRunUrl','runAttempt'])('rejects foreign browser receipt %s',name=>{const f=fixture();(f.evidence as any)[name]='foreign';f.save();expect(()=>read(f)).toThrow('RELEASE_BROWSER_FILES_REJECTED');});
it('rejects a browser flow absent from target source policy',()=>{const f=fixture();f.policy.browserPolicy.cases.push('B99 synthetic foreign');expect(()=>read(f)).toThrow('RELEASE_BROWSER_FILES_REJECTED');});
it('rejects altered exact raw report bytes even if receipt counts remain green',()=>{const f=fixture();f.raw['browser.json']+=' ';f.save();expect(()=>read(f)).toThrow('RELEASE_BROWSER_FILES_REJECTED');});
it('rejects a raw manifest not equal to the evidence manifest',()=>{const f=fixture();f.raw['browser-fixture.json']=JSON.stringify({...f.value.manifest,fixtureRemoved:false});f.save();expect(()=>read(f)).toThrow('RELEASE_BROWSER_FILES_REJECTED');});
it('rejects missing actual compiled server shutdown evidence',()=>{const f=fixture();f.raw['browser-server.log']='Server is running\n';f.evidence.hashes['browser-server.log']=hash(f.raw['browser-server.log']);f.save();expect(()=>read(f)).toThrow('RELEASE_BROWSER_FILES_REJECTED');});
it('rejects a nonzero native browser installer exit even with a matching file hash',()=>{const f=fixture();f.raw['browsers-install-exit.json']='{"exitCode":1}';f.evidence.hashes['browsers-install-exit.json']=hash(f.raw['browsers-install-exit.json']);f.save();expect(()=>read(f)).toThrow('RELEASE_BROWSER_FILES_REJECTED');});

it.each(['binarySha256','nodeABI','sqliteVersion'])('rejects a forged matching browser native %s despite green receipts',field=>{const f=fixture();f.value.native[field]=field==='binarySha256'?'f'.repeat(64):'foreign';if(field==='binarySha256'){f.value.manifest.addonSha256=f.value.native.binarySha256;f.evidence.manifest=structuredClone(f.value.manifest);f.raw['browser-fixture.json']=JSON.stringify(f.value.manifest);f.evidence.hashes['browser-fixture.json']=hash(f.raw['browser-fixture.json']);}f.raw['native.json']=JSON.stringify(f.value.native);f.evidence.hashes['native.json']=hash(f.raw['native.json']);f.save();expect(()=>read(f)).toThrow('RELEASE_BROWSER_FILES_REJECTED');});
