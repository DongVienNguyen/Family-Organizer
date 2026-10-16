import {generatedFixtureContracts} from './release-generated-fixture-contract.mjs';
import {isDeepStrictEqual} from 'node:util';
import {validateReleaseEvidence,releaseArtifactPrefixes} from './release-evidence.mjs';
const reject=()=>{throw Error('RELEASE_COLLECTOR_EVIDENCE_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
// Only the authenticated collector calls this after all trusted raw readers.
// Synthetic/prior receipts and operator JSON confer no GitHub/publication authority.
export function normalizeReleaseCollectorEvidence(receipt,p){
 try{
  const m=receipt.metadata,r=m.request,source=m.source,packageReports=p.packageReports,inner=p.innerPackage;
  requireFact(receipt.format===1&&receipt.kind==='github-artifact-archives'&&receipt.publicationAllowed===false&&p.publicationAllowed===false&&p.commitSha===r.commitSha&&p.runId===r.runId&&p.sourcePolicy.publicationAllowed===false&&isDeepStrictEqual(p.sourcePolicy.source,source));
  const same=row=>requireFact(row?.commitSha===r.commitSha&&row?.runId===r.runId);
  const asset=row=>{same(row);requireFact(row.zipSha256===packageReports.zipSha256&&row.publicationAllowed===false);};
  requireFact(receipt.archives.length===releaseArtifactPrefixes.length&&m.artifacts.length===releaseArtifactPrefixes.length&&new Set(receipt.archives.map(x=>x.artifactId)).size===releaseArtifactPrefixes.length&&new Set(m.artifacts.map(x=>x.id)).size===releaseArtifactPrefixes.length);
  for(const row of receipt.archives){const a=m.artifacts.find(x=>x.id===row.artifactId);requireFact(a?.name===row.name&&a.expired===false&&a.workflow_run.id===r.runId&&a.workflow_run.head_sha===r.commitSha&&hex(row.archiveSha256)&&a.digest==='sha256:'+row.archiveSha256&&positive(row.bytes));}
  requireFact(isDeepStrictEqual(m.artifact,m.artifacts.find(x=>x.id===m.artifact.id)));
  const extraction=p.extraction;requireFact(extraction.publicationAllowed===false&&positive(extraction.files)&&positive(extraction.expandedBytes)&&isDeepStrictEqual(extraction.archives.map(x=>x.name).sort(),receipt.archives.map(x=>x.name).sort()));
  for(const extracted of extraction.archives){const original=receipt.archives.find(row=>row.name===extracted.name);requireFact(['artifactId','archiveSha256','bytes','file'].every(key=>extracted[key]===original[key]));}
  const policy=p.sourcePolicy;requireFact(positive(policy.requiredSuites.length)&&positive(policy.sourceInventory.length)&&positive(policy.harnessPolicy.files.length));
  requireFact(p.quality.length===2&&p.runtimeAndCoverage.length===2&&p.auxiliaryReports.length===2&&new Set(p.quality.map(x=>x.major)).size===2&&new Set(p.runtimeAndCoverage.map(x=>x.major)).size===2);
  const quality=[];
  for(const [major,nodeVersion]of [[22,'v22.23.3'],[24,'v24.21.0']]){
   const q=p.quality.find(x=>x.major===major),v=p.runtimeAndCoverage.find(x=>x.major===major),a=p.auxiliaryReports.find(x=>x.nodeVersion===nodeVersion);same(q);
   requireFact(q.rawAssertionsVerified===true&&positive(q.tests)&&q.passed===q.tests&&q.failed===0&&q.pending===0&&q.todo===0&&q.files===policy.requiredSuites.length);
   requireFact(v.runtime.commitSha===r.commitSha&&v.coverage.commitSha===r.commitSha&&a.commitSha===r.commitSha&&v.runtime.nodeVersion===nodeVersion&&v.coverage.nodeVersion===nodeVersion&&v.runtime.runtimeProductionAuditVerified===true&&v.coverage.coverageVerified===true&&v.coverage.sources===policy.sourceInventory.length&&a.rawAuxiliaryReportsVerified===true);
   requireFact(hex(q.reportHashes['evidence.json'])&&v.coverage.evidenceSha256===q.reportHashes['evidence.json']&&q.reportHashes['evidence.json']===v.runtime.reportHashes['evidence.json']&&q.reportHashes['evidence.json']===a.reportHashes['evidence.json']);
   quality.push({major,tests:q.tests,passed:q.passed,files:q.files,failed:0,pending:0,todo:0});
  }
  const browser=p.browser;same(browser);requireFact(browser.rawBrowserVerified===true&&browser.fixtureCleanup===true&&positive(browser.cases)&&browser.cases===policy.browserPolicy.projects.length*policy.browserPolicy.cases.length);
  const productivity=p.productivityBrowser;same(productivity);const productivityPolicy=policy.productivityBrowserPolicy;
  requireFact(productivity.rawProductivityBrowserVerified===true&&productivity.fixtureCleanup===true&&positive(productivity.cases)&&productivity.cases===productivityPolicy.projects.length*productivityPolicy.cases.length&&productivity.touchCases===1&&productivity.nativeTouchVerified===true&&productivity.matrixScreenshots===12&&['failed','skipped','retries','touchFailed','touchSkipped','touchRetries'].every(key=>productivity[key]===0));
  requireFact(productivity.contractSha256===productivityPolicy.contractSha256&&productivity.touchContractSha256===productivityPolicy.touch.contractSha256&&isDeepStrictEqual(productivity.productionBuild,browser.productionBuild));
  asset(packageReports);requireFact(packageReports.packageReportAgreement===true&&packageReports.appVersion===r.version&&positive(packageReports.zipSize));
  const consumer=p.consumerReports,service=p.serviceReports,harness=p.harnessAndBuild;for(const row of [consumer,service,harness,inner])asset(row);
  requireFact(consumer.rawConsumerFunctionalReportsVerified===true&&service.rawServiceReportsVerified===true&&positive(service.shutdownCompletions)&&harness.rawHarnessFilesVerified===true&&harness.packageBuildAgreement===true&&harness.staticHarnessFiles===policy.harnessPolicy.files.length&&harness.harnessFiles===policy.harnessPolicy.files.length+3);
  const generators=policy.harnessPolicy.generators,fixtures=harness.generatedFixtures;
  const definitions=[['scripts/ci/write-productivity-fixture.ts','productivity-fixture.json'],['scripts/ci/write-board-package-fixture.ts','board-fixture.json'],['scripts/ci/write-wallet-fixture.ts','wallet-fixture.json']];
  requireFact(Array.isArray(generators)&&generators.length===3&&harness.generatedFixturesVerified===true&&harness.generatedFixtureFiles===3&&Array.isArray(fixtures)&&fixtures.length===3&&isDeepStrictEqual(Object.keys(consumer.fixtureHashes??{}).sort(),definitions.map(row=>row[1]).sort()));
  for(const [i,[sourcePath,path]]of definitions.entries()){const declaration=generators[i],fixture=fixtures[i],contract=generatedFixtureContracts[path];requireFact(declaration?.sourcePath===sourcePath&&declaration.path===path&&hex(declaration.sourceSha256)&&fixture?.sourcePath===sourcePath&&fixture.path===path&&fixture.sourceSha256===declaration.sourceSha256&&hex(fixture.sha256)&&fixture.sha256===consumer.fixtureHashes[path]&&fixture.format===contract.format&&fixture.version===contract.version&&positive(fixture.rows));}
  requireFact(inner.innerPackageAgreement===true&&inner.licenseInventoryVerified===true&&inner.innerExtractionVerified===true&&inner.verifiedFiles===packageReports.manifest.files.length&&positive(inner.verifiedFiles)&&inner.licenseAudit.dependencies===packageReports.manifest.dependencies.length&&inner.licenseAudit.termsVerified===true&&inner.licenseAudit.originalCopyrightPreserved===true&&hex(inner.reportHashes['release-manifest.json']));
  requireFact(inner.nativeExtraction.exitCode===0&&inner.nativeExtraction.archiveSha256===packageReports.zipSha256&&inner.nativeExtraction.archiveBytes===packageReports.zipSize&&inner.nativeExtraction.files===inner.verifiedFiles+1&&positive(inner.nativeExtraction.expandedBytes));
  const result={format:1,kind:'authenticated-collector-release-evidence',request:r,source,run:m.run,checks:m.checks,artifact:m.artifact,download:receipt.archives.find(x=>x.artifactId===m.artifact.id),package:{commitSha:r.commitSha,appVersion:r.version,zipSha256:packageReports.zipSha256,zipSize:packageReports.zipSize,manifestSha256:inner.reportHashes['release-manifest.json']},reports:{commitSha:r.commitSha,runId:r.runId,zipSha256:packageReports.zipSha256,errors:[],quality,browsers:{passed:browser.cases,failed:0,skipped:0,retries:0},productivityBrowsers:{passed:productivity.cases,failed:0,skipped:0,retries:0,touchPassed:1,touchFailed:0,touchSkipped:0,touchRetries:0},generatedFixtures:{verified:true,files:3},consumer:{passed:true,fixtureCleanup:true},service:{passed:true,serviceRemoved:true,fixtureCleanup:true}},reportsVerified:true,consumerFunctionalVerified:true,publicationAllowed:false,server2019Acceptance:'not-run'};
  requireFact(validateReleaseEvidence(result).length===0);return result;
 }catch{reject();}
}
