import {isDeepStrictEqual} from 'node:util';
export const windowsRuntime = Object.freeze({version:'v24.21.0',abi:'137',napi:'10',archiveSha256:'158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'});
const hex = (value,length) => typeof value==='string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const integer = value => Number.isSafeInteger(value) && value>=0;
export function safeArchivePath(value) {
  if(typeof value!=='string'||!value||value.length>1024||value.includes('\\')||value.normalize('NFC')!==value)return false;
  const parts=value.replace(/\/$/,'').split('/');
  return parts.every(part=>part&&part!=='.'&&part!=='..'&&part.length<=255&&!/[<>:"|?*\x00-\x1f]/.test(part)&&!/[. ]$/.test(part)&&!/^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(part));
}
export function validateArchiveEntries(entries) {
  const errors=[],names=new Map();let total=0;
  if(!Array.isArray(entries)||entries.length===0||entries.length>100000)return ['missing or excessive ZIP entries'];
  for(const entry of entries){
    if(!safeArchivePath(entry?.path)){errors.push('unsafe ZIP path');continue;}
    const directory=entry.path.endsWith('/'),key=entry.path.replace(/\/$/,'').toLowerCase();
    if(names.has(key))errors.push('duplicate or aliased ZIP entry');names.set(key,directory);
    if(!integer(entry.size)||entry.size>128*1024*1024||!integer(entry.compressedSize)||entry.compressedSize>512*1024*1024||!Number.isInteger(entry.attributes))errors.push('invalid ZIP metadata/size');
    else {
      total+=entry.size;
      if(entry.size>1024*1024&&entry.size/Math.max(1,entry.compressedSize)>500)errors.push('ZIP expansion ratio exceeds budget');
      if(((entry.attributes>>>16)&0xf000)===0xa000||(entry.attributes&1024)!==0)errors.push('ZIP symlink/reparse entry');
      if(directory&&entry.size!==0)errors.push('nonempty ZIP directory');
    }
  }
  if(total>1024*1024*1024)errors.push('ZIP expanded size exceeds budget');
  for(const key of names.keys()){
    const parts=key.split('/');parts.pop();
    while(parts.length){if(names.get(parts.join('/'))===false)errors.push('ZIP file owns descendant paths');parts.pop();}
  }
  return errors;
}
export function validateManifest(manifest,expected) {
  const errors=[],require=(condition,message)=>{if(!condition)errors.push(message);};
  require(manifest?.format===1,'unsupported manifest format');
  require(hex(manifest?.commitSha,40)&&manifest.commitSha===expected?.commitSha,'manifest source mismatch');
  require(typeof manifest?.appVersion==='string'&&/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(manifest.appVersion)&&manifest.appVersion===expected?.appVersion,'manifest application version mismatch');
  require(manifest?.platform==='win32'&&manifest?.architecture==='x64','manifest is not Windows x64');
  for(const [key,value] of Object.entries(windowsRuntime))require(manifest?.runtime?.[key]===value,`manifest runtime ${key} mismatch`);
  require(manifest?.server2019Acceptance==='not-run','Server2019 acceptance cannot be inferred from package CI');
  const files=Array.isArray(manifest?.files)?manifest.files:[];
  errors.push(...validateArchiveEntries(files.map(f=>({path:f?.path,size:f?.size,compressedSize:f?.size,attributes:0}))));
  for(const file of files){
    require(hex(file?.sha256,64),'invalid asset hash');
    const name=typeof file?.path==='string'?file.path:'';
    const staticBuildNotice=name.startsWith('licenses/build-inputs/')&&/\/(?:package\.json|(?:license|licence|copying|copyright|readme)(?:\.(?:md|txt|html|rst|markdown))?)$/i.test(name);
    require(!/(?:^|\/)(?:recovery-backup\.(?:key|json)|update-(?:control|journal)\.json|[^/]+\.fo-recovery)(?:\/|$)/i.test(name)&&!/(?:^|\/)\.env(?:\.[^/]+)?(?:\/|$)/i.test(name)&&(staticBuildNotice||!/(?:^|\/)(?:tests?|fixtures|reports)(?:\/|$)/i.test(name))&&!/^(?:app\/)?data(?:\/|$)/i.test(name)&&!/^app\/node_modules\/(?:vitest|tsx|typescript|vite|esbuild|@playwright\/test)(?:\/|$)/i.test(name),'excluded secrets/data/tests/devtools in package');
  }
  const required=['bin/node.exe','app/dist/server.cjs','app/dist/operator.cjs','app/dist/index.html','app/package.json','app/package-lock.json','app/node_modules/better-sqlite3/prebuilds/win32-x64.node','ops/Start-App.ps1','ops/Reset-Credentials.ps1','ops/Recovery.ps1','ops/Configure-Backup.ps1','licenses/node-LICENSE.txt','ops/Update.ps1','ops/Rollback.ps1','ops/UpdateCommon.ps1','ops/update-journal.mjs'];
  for(const name of required)require(files.some(f=>f.path===name),`missing package asset: ${name}`);
  const find=name=>files.find(f=>f.path===name);
  require(hex(manifest?.runtime?.nodeExeSha256,64)&&manifest.runtime.nodeExeSha256===find('bin/node.exe')?.sha256,'bundled node executable hash mismatch');
  require(manifest?.native?.version==='13.0.3'&&manifest.native.path===required[6]&&hex(manifest.native.sha256,64)&&manifest.native.sha256===find(required[6])?.sha256,'native addon metadata/hash mismatch');
  for(const name of ['legacy','jobs','snapshot'])require(manifest?.schema?.[name]?.min===1&&manifest?.schema?.[name]?.max===1,`unsupported ${name} schema bounds`);
  require(isDeepStrictEqual(manifest?.schema?.domains,{productivity:{min:1,max:5},wallet:{min:1,max:1}}),'unsupported domain schema bounds');
  const dependencies=Array.isArray(manifest?.dependencies)?manifest.dependencies:[];
  require(dependencies.length>0,'dependency manifest missing');
  const names=new Set();
  for(const dependency of dependencies){
    require(typeof dependency?.name==='string'&&dependency.name.length>0&&typeof dependency?.version==='string'&&dependency.version.length>0&&!names.has(dependency?.path),'invalid or duplicate dependency metadata');names.add(dependency?.path);
    require(safeArchivePath(dependency?.path)&&dependency.path.startsWith('app/node_modules/'),'invalid dependency path');
    require(typeof dependency?.license==='string'&&dependency.license.trim().length>0,'dependency license declaration missing');
    require(Array.isArray(dependency?.licenseFiles)&&dependency.licenseFiles.length>0&&dependency.licenseFiles.every(file=>safeArchivePath(file)&&file.startsWith(dependency.path+'/')),'dependency license files missing');
    require(files.some(file=>file.path===dependency.path+'/package.json'),'dependency package metadata bytes missing');
    require(Array.isArray(dependency?.licenseFiles)&&dependency.licenseFiles.every(file=>files.some(asset=>asset.path===file)),'dependency license bytes missing');
  }
  return errors;
}

export function retainsSnapshotRows(actual,saved){return saved.every(row=>actual.some(candidate=>isDeepStrictEqual(candidate,row)));}
