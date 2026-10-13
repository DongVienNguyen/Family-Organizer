import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createGithubReader} from './release-metadata.mjs';
import {readTrustedReleasePolicy} from './release-source-policy.mjs';
import {extractReleaseReportArchives} from './release-report-extraction.mjs';
import {readReleaseQualityFiles,openReleaseReportFiles} from './release-report-files.mjs';
import {readReleaseRuntimeFiles} from './release-runtime-reports.mjs';
import {readReleaseCoverageFiles} from './release-coverage-files.mjs';
import {fileURLToPath} from 'node:url';
import {collectReleaseArchives,createArtifactDownloader} from './release-archives.mjs';
try{
 const runText=process.env.CANDIDATE_CI_RUN_ID;
 if(typeof runText!=='string'||!/^[1-9][0-9]{0,15}$/.test(runText))throw new Error('RELEASE_ARCHIVE_REJECTED');
 const request={repository:process.env.GITHUB_REPOSITORY,commitSha:process.env.CANDIDATE_COMMIT_SHA,version:process.env.CANDIDATE_VERSION,tag:'v'+process.env.CANDIDATE_VERSION,runId:Number(runText)};
 const policy=readTrustedReleasePolicy(request,{workflowSha:process.env.GITHUB_SHA,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,repository:process.env.GITHUB_REPOSITORY,git:args=>spawnSync('git',args,{timeout:10000,maxBuffer:1024*1024,windowsHide:true})});
 const source=policy.source;
 fs.mkdirSync('reports',{recursive:true});
 const receipt=await collectReleaseArchives(request,{source,get:createGithubReader(process.env.GITHUB_TOKEN),download:createArtifactDownloader(process.env.GITHUB_TOKEN)},path.resolve('reports/archives'));
 const extraction=extractReleaseReportArchives(receipt,path.resolve('reports/extracted'),{execute:({inputFile,directory})=>spawnSync(process.env.FO_PWSH_PATH,['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./Extract-ReleaseReportArchives.ps1',import.meta.url)),'-InputFile',inputFile,'-Destination',directory],{timeout:120000,maxBuffer:65536,windowsHide:true})});
 const quality=[22,24].map(major=>{const name='windows-node'+major+'-'+request.commitSha+'-1';const directory=extraction.archives.find(row=>row.name===name)?.directory;return readReleaseQualityFiles(directory,{commitSha:request.commitSha,runId:request.runId,major,lockSha256:policy.lockSha256,requiredSuites:policy.requiredSuites});});
 const runtimeAndCoverage=[22,24].map(major=>{const directory=extraction.archives.find(row=>row.name==='windows-node'+major+'-'+request.commitSha+'-1')?.directory;const expected={commitSha:request.commitSha,nodeVersion:major===22?'v22.23.3':'v24.21.0',lockSha256:policy.lockSha256};const evidence=openReleaseReportFiles(directory).json('evidence.json');return {major,runtime:readReleaseRuntimeFiles(directory,expected),coverage:readReleaseCoverageFiles(directory,policy,expected,evidence)};});
 fs.writeFileSync('reports/release-report-preflight.json',JSON.stringify({format:1,publicationAllowed:false,reportsVerified:false,rawQualityAssertionsVerified:true,runtimeProductionAuditVerified:true,rawCoverageVerified:true,commitSha:request.commitSha,runId:request.runId,sourcePolicy:policy,extraction,quality,runtimeAndCoverage},null,2)+'\n');
 fs.writeFileSync('reports/release-metadata.json',JSON.stringify(receipt.metadata,null,2)+'\n');
 fs.writeFileSync('reports/release-archives.json',JSON.stringify(receipt,null,2)+'\n');
 console.log('GITHUB_ARCHIVES_EXTRACTED_QUALITY_RUNTIME_AUDIT_COVERAGE_VERIFIED_OTHER_REPORTS_UNVERIFIED_PUBLICATION_DISABLED');
}catch{console.error('RELEASE_ARCHIVE_REJECTED');process.exitCode=1;}
