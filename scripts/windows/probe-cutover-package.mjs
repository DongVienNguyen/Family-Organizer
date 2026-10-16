// Windows-only consumer entry: invoked by Test-Package after exact ZIP extraction.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCutoverPackageScenario} from './cutover-package-scenario.mjs';
import {validateCutoverPackageReport} from './cutover-package-contract.mjs';
const [app,fixture,cwd,reportFile,zipSha256]=process.argv.slice(2);let report;
try{
 assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.version,'v24.21.0');assert.equal(process.versions.modules,'137');
 const manifest=JSON.parse(fs.readFileSync(path.join(path.dirname(app),'release-manifest.json'),'utf8'));assert.equal(manifest.native.path,'app/node_modules/better-sqlite3/prebuilds/win32-x64.node');
 const expected={commitSha:process.env.TEST_COMMIT_SHA,zipSha256,nodeExecutable:process.execPath,nodeBinarySha256:manifest.runtime.nodeExeSha256,nativeBinarySha256:manifest.native.sha256};
 report=await runCutoverPackageScenario({app,fixture,cwd,zipSha256,commitSha:expected.commitSha,preload:fileURLToPath(new URL('./block-network.cjs',import.meta.url)),seedFile:fileURLToPath(new URL('./cutover-fixture.json',import.meta.url))});
 report.provenance='exact-verified-zip-v1';const errors=validateCutoverPackageReport(report,expected);if(errors.length)throw Error(errors.join('; '));
}catch(error){report??={format:1,commitSha:process.env.TEST_COMMIT_SHA,zipSha256,platform:process.platform,architecture:process.arch,nodeVersion:process.version,completed:false};report.failure??=String(error?.stack??error);process.exitCode=1;}
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');if(report.failure)console.error(report.failure);
