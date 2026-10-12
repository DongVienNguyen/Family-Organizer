import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createGithubReader,readTrustedSourceFacts} from './release-metadata.mjs';
import {collectReleaseArchives,createArtifactDownloader} from './release-archives.mjs';
try{
 const runText=process.env.CANDIDATE_CI_RUN_ID;
 if(typeof runText!=='string'||!/^[1-9][0-9]{0,15}$/.test(runText))throw new Error('RELEASE_ARCHIVE_REJECTED');
 const request={repository:process.env.GITHUB_REPOSITORY,commitSha:process.env.CANDIDATE_COMMIT_SHA,version:process.env.CANDIDATE_VERSION,tag:'v'+process.env.CANDIDATE_VERSION,runId:Number(runText)};
 const source=readTrustedSourceFacts(request,{workflowSha:process.env.GITHUB_SHA,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,repository:process.env.GITHUB_REPOSITORY,git:args=>spawnSync('git',args,{timeout:10000,maxBuffer:1024*1024,windowsHide:true})});
 fs.mkdirSync('reports',{recursive:true});
 const receipt=await collectReleaseArchives(request,{source,get:createGithubReader(process.env.GITHUB_TOKEN),download:createArtifactDownloader(process.env.GITHUB_TOKEN)},path.resolve('reports/archives'));
 fs.writeFileSync('reports/release-metadata.json',JSON.stringify(receipt.metadata,null,2)+'\n');
 fs.writeFileSync('reports/release-archives.json',JSON.stringify(receipt,null,2)+'\n');
 console.log('GITHUB_ARCHIVES_HASH_VERIFIED_REPORTS_UNVERIFIED_PUBLICATION_DISABLED');
}catch{console.error('RELEASE_ARCHIVE_REJECTED');process.exitCode=1;}
