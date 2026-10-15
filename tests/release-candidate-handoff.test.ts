import { expect, it } from 'vitest';
import * as handoff from '../scripts/windows/release-candidate-handoff.mjs';
import { assertPublicationAllowed } from '../scripts/windows/release-evidence.mjs';
const sha='a'.repeat(40),hash='b'.repeat(64),repo='DongVienNguyen/Family-Organizer',runId=123;
const fixture=()=>({format:1,kind:'authenticated-collector-release-evidence',request:{repository:repo,commitSha:sha,version:'1.1.0',tag:'v1.1.0',runId},source:{repository:repo,commitSha:sha,mainAncestor:true,packageVersion:'1.1.0'},run:{repository:{full_name:repo},id:runId,head_sha:sha,head_branch:'main',event:'push',workflow_id:381168350,run_attempt:1,status:'completed',conclusion:'success'},checks:['Windows Node22 baseline','Windows Node24 baseline','Windows production browsers','Windows package producer','Windows package clean consumer','Windows disposable service','ci-gate','Windows productivity browsers'].map(name=>({name,head_sha:sha,status:'completed',conclusion:'success',app:{id:15368},details_url:'https://github.com/'+repo+'/actions/runs/'+runId+'/job/456'})),artifact:{id:1,name:'windows-package-'+sha+'-1',expired:false,workflow_run:{id:runId,head_sha:sha},digest:'sha256:'+hash},download:{artifactId:1,archiveSha256:hash},package:{commitSha:sha,appVersion:'1.1.0',zipSha256:hash,zipSize:1024,manifestSha256:'c'.repeat(64)},reports:{commitSha:sha,runId,zipSha256:hash,errors:[],quality:[22,24].map(major=>({major,tests:10,passed:10,files:2,failed:0,pending:0,todo:0})),browsers:{passed:3,failed:0,skipped:0,retries:0},consumer:{passed:true,fixtureCleanup:true},service:{passed:true,serviceRemoved:true,fixtureCleanup:true}},reportsVerified:true,consumerFunctionalVerified:true,publicationAllowed:false,server2019Acceptance:'not-run'});
const prepare=(value:any)=>(handoff as any).prepareCandidateHandoff(value);
it('prepares explicit immutable asset intent while keeping publication and R02 blocked',()=>{
 expect(typeof(handoff as any).prepareCandidateHandoff).toBe('function');const value=fixture(),result=prepare(value);
 expect(result).toMatchObject({format:1,kind:'publication-disabled-candidate-handoff',request:value.request,package:value.package,assets:{zip:{name:'family-organizer-1.1.0-'+sha+'-win-x64.zip',sha256:hash,bytes:1024},manifest:{name:'release-manifest.json',sha256:'c'.repeat(64)}},candidatePublication:'blocked-source-lock',promotion:'blocked-source-lock-and-actual-server2019-acceptance',publicationAllowed:false,releaseCreated:false,tagCreated:false,server2019Acceptance:'not-run'});
 expect(()=>assertPublicationAllowed()).toThrow('RELEASE_PUBLICATION_DISABLED');
});
it.each(['format','kind','reportsVerified','consumerFunctionalVerified','publicationAllowed','server2019Acceptance'])('refuses incomplete preparation field %s',field=>{expect(typeof(handoff as any).prepareCandidateHandoff).toBe('function');const value:any=fixture();delete value[field];expect(()=>prepare(value)).toThrow('RELEASE_CANDIDATE_HANDOFF_REJECTED');});
it.each(['foreign-source','failed-check','bad-version','bad-zip','bad-manifest','incomplete-browser','publication-enabled','claimed-server2019'])('refuses preparation contradiction %s',kind=>{expect(typeof(handoff as any).prepareCandidateHandoff).toBe('function');const value=fixture();if(kind==='foreign-source')value.source.commitSha='d'.repeat(40);else if(kind==='failed-check')value.checks[0].conclusion='failure';else if(kind==='bad-version')value.request.version='../../unsafe';else if(kind==='bad-zip')value.package.zipSha256='bad';else if(kind==='bad-manifest')value.package.manifestSha256='bad';else if(kind==='incomplete-browser')value.reports.browsers.skipped=1;else if(kind==='publication-enabled')value.publicationAllowed=true;else value.server2019Acceptance='accepted';expect(()=>prepare(value)).toThrow('RELEASE_CANDIDATE_HANDOFF_REJECTED');});
it('returns detached intent so later caller mutation cannot alter prepared hashes',()=>{expect(typeof(handoff as any).prepareCandidateHandoff).toBe('function');const value=fixture(),result=prepare(value);value.package.zipSha256='d'.repeat(64);value.request.version='2.0.0';expect(result.package.zipSha256).toBe(hash);expect(result.request.version).toBe('1.1.0');});

it('keeps both dispatch workflows read-only and runs the same complete authenticated collector',async()=>{
 const {readFileSync}=await import('node:fs');const {parse}=await import('yaml');
 for(const file of ['release-candidate.yml','promote-release.yml']){
  const workflow=parse(readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8'));
  expect(workflow.permissions).toEqual({contents:'read',actions:'read',checks:'read'});
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
  expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual(['commit_sha','version','ci_run_id']);
  expect(workflow.defaults.run.shell).toBe('pwsh');
  const jobs=Object.values(workflow.jobs) as any[];expect(jobs).toHaveLength(1);expect(jobs[0]['runs-on']).toBe('windows-2022');
  expect(jobs[0].permissions).toBeUndefined();expect(jobs[0]['continue-on-error']).toBeUndefined();
  const steps=jobs[0].steps as any[];
  expect(steps.filter(step=>step.uses).every(step=>/^actions\/(checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/.test(step.uses))).toBe(true);
  const collect=steps.find(step=>step.name==='Collect authenticated archive bytes without rebuild or publication');
  expect(collect.run).toContain('& node ./scripts/windows/collect-release-archives.mjs');
  expect(collect.run).toContain('$nativeCode = $LASTEXITCODE');
  expect(collect.run).toContain('if ($nativeCode -ne 0) { exit $nativeCode }');
  expect(steps.filter(step=>step.uses?.startsWith('actions/upload-artifact@'))).toHaveLength(1);
  expect(steps.find(step=>step.uses?.startsWith('actions/upload-artifact@')).with.path).toContain('reports/candidate-handoff.json');
  expect(steps.some(step=>step.run&&/gh release|git tag|npm run release|publish-release/.test(step.run))).toBe(false);
 }
});
