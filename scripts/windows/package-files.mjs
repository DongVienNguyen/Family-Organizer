import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { validateManifest, safeArchivePath } from './package-contract.mjs';
export const hashFile=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function inventory(root){
  const result=[];
  function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name),relative=path.relative(root,file).split(path.sep).join('/');
    assert.ok(safeArchivePath(relative),'Unsafe package filesystem path');
    assert.ok(!entry.isSymbolicLink(),'Package contains symlink');
    if(entry.isDirectory())walk(file);else{assert.ok(entry.isFile(),'Package contains non-file');if(relative!=='release-manifest.json')result.push({path:relative,size:fs.statSync(file).size,sha256:hashFile(file)});}
  }}walk(root);return result.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
export function verifyPackage(root,expected){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
  assert.deepEqual(validateManifest(manifest,expected),[],'Package manifest rejected');
  const actual=inventory(root);assert.deepEqual(actual,manifest.files,'Package file bytes/inventory differ from manifest');
  for(const dependency of manifest.dependencies){const metadata=JSON.parse(fs.readFileSync(path.join(root,dependency.path,'package.json'),'utf8'));assert.equal(metadata.name,dependency.name);assert.equal(metadata.version,dependency.version);assert.equal(typeof metadata.license==='string'?metadata.license:metadata.license?.type,dependency.license);}
  return manifest;
}
