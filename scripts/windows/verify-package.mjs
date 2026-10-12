import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { verifyPackage } from './package-files.mjs';
const [root,commitSha,appVersion,report]=process.argv.slice(2);
const manifest=verifyPackage(root,{commitSha,appVersion});
assert.equal(fs.realpathSync(process.execPath).toLowerCase(),fs.realpathSync(path.join(root,'bin/node.exe')).toLowerCase());
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.version,manifest.runtime.version);assert.equal(process.versions.modules,manifest.runtime.abi);assert.equal(process.versions.napi,manifest.runtime.napi);
const require=createRequire(path.join(root,'app/package.json')),Database=require('better-sqlite3'),db=new Database(':memory:');
try{assert.equal(db.prepare('select 42 as value').get().value,42);}finally{db.close();}
fs.writeFileSync(report,JSON.stringify({commitSha,appVersion,platform:process.platform,architecture:process.arch,nodeExecutable:process.execPath,nodeVersion:process.version,abi:process.versions.modules,napi:process.versions.napi,verifiedFiles:manifest.files.length,verifiedDependencies:manifest.dependencies.length,manifestVerified:true,nativeDatabaseClosed:true},null,2)+'\n');
