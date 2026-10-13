import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runOwnedCaddyWorker} from './caddy-contract.mjs';
import {assertNoLinkedAncestors,isFullyQualifiedPath} from '../lib/native-paths.mjs';
const [pwsh,reportDirectory,commitSha]=process.argv.slice(2);
try{
 assert.equal(process.argv.length,5);assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
 assert.match(commitSha??'',/^[a-f0-9]{40}$/);assert(isFullyQualifiedPath(pwsh));assert(isFullyQualifiedPath(reportDirectory));
 assertNoLinkedAncestors(pwsh);assertNoLinkedAncestors(reportDirectory);assert(fs.statSync(pwsh).isFile());
 fs.mkdirSync(reportDirectory,{recursive:true});
 const report=path.join(reportDirectory,'caddy-exit.json');assert(!fs.existsSync(report));assert(!fs.existsSync(path.join(reportDirectory,'caddy-native.json')));
 const directory=path.join(os.tmpdir(),'fo-caddy dữ liệu with spaces-'+randomUUID());
 const worker=fileURLToPath(new URL('./Test-Caddy.Worker.ps1',import.meta.url));
 const result=await runOwnedCaddyWorker({directory,command:pwsh,args:['-NoLogo','-NoProfile','-NonInteractive','-File',worker,'-ReportDirectory',reportDirectory,'-CommitSha',commitSha,'-OwnedRoot',directory],env:process.env});
 assertNoLinkedAncestors(report);const stat=fs.lstatSync(report);assert(stat.isFile()&&stat.size<65536);
 const observed=JSON.parse(fs.readFileSync(report,'utf8'));assert.equal(observed.commitSha,commitSha);
 observed.fixtureCleanup=result.fixtureCleanup;observed.exitCode=result.exitCode;
 fs.writeFileSync(report,JSON.stringify(observed,null,2)+'\n');
 if(result.exitCode!==0)console.error('CADDY_OUTER_OWNERSHIP_OR_WORKER_REJECTED');
 process.exitCode=result.exitCode;
}catch{console.error('CADDY_SUPERVISOR_REJECTED');process.exitCode=1;}
