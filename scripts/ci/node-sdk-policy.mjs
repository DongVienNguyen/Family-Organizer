import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {safeArchivePath} from '../windows/package-contract.mjs';
const pins=Object.freeze({
 '22.23.3':{headersSha256:'eff1a7e67736bdf25db421ddaa613ed605f751a7b9fe07fb473ea880d1348987',librarySha256:'c243185f2347870cadb637c909bf123fc703dc65dbfa769b17ec45a4b661d782'},
 '24.21.0':{headersSha256:'57c6bee2e30bbbee5bd51d6cc343eb992e174b56a2a1d0eab7a7510771c20ea2',librarySha256:'a0a84aa03917b578d286010b7521837e9ff1136ffb2e4a406c14316c33fd06f7'},
});
export function nodeSdkPolicy(version){
 if(!Object.hasOwn(pins,version))throw Error('NODE_SDK_POLICY_REJECTED');
 return {version,...pins[version],headersUrl:'https://nodejs.org/dist/v'+version+'/node-v'+version+'-headers.tar.gz',libraryUrl:'https://nodejs.org/dist/v'+version+'/win-x64/node.lib',folder:'node-v'+version};
}
export function validateNodeHeaderPaths(paths,version){
 const errors=[],require=(ok,name)=>{if(!ok)errors.push(name);};
 try{const prefix=nodeSdkPolicy(version).folder;require(Array.isArray(paths)&&paths.length>0&&paths.length<=100000,'empty/excessive header inventory');
 const seen=new Set();for(const name of paths??[]){require(safeArchivePath(name)&&(name===prefix+'/'||name.startsWith(prefix+'/')),'unsafe/foreign header path');const key=typeof name==='string'?name.replace(/\/$/,'').toLowerCase():'';require(!seen.has(key),'duplicate/aliased header path');seen.add(key);}
 for(const name of ['node_version.h','config.gypi','common.gypi'])require(paths?.includes(prefix+'/include/node/'+name),'required Node header missing');
 }catch{errors.push('invalid header inventory');}return errors;
}
export function validateNodeSdkReceipt(report,expected){
 const errors=[],require=(ok,name)=>{if(!ok)errors.push(name);};
 try{const p=nodeSdkPolicy(expected?.nodeVersion?.slice(1));require(/^[a-f0-9]{40}$/.test(expected?.commitSha??''),'invalid SDK source context');
 require(report?.commitSha===expected.commitSha&&report.nodeVersion===expected.nodeVersion&&report.platform==='win32'&&report.architecture==='x64','foreign SDK source/runtime');
 require(report?.headersSha256===p.headersSha256&&report?.librarySha256===p.librarySha256,'SDK checksum mismatch');
 const names=['policy','headers','library','list','listPolicy','extract'];require(Object.keys(report?.nativeExitCodes??{}).length===6&&names.every(name=>report.nativeExitCodes[name]===0),'SDK native commands missing/nonzero');
 require(report?.headerVersionVerified===true&&report?.localSdkConfigured===true&&report?.maxTransferRetries===2&&report?.testRetries===0&&report?.builderOnly===true&&report?.server2019Acceptance==='not-run','SDK validation/configuration/retry/scope mismatch');
 }catch{errors.push('invalid SDK receipt');}return errors;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const value=nodeSdkPolicy(process.argv[2]);if(process.platform!=='win32'||process.arch!=='x64'||process.version!=='v'+value.version)throw Error();if(process.argv[3]){const file=process.argv[3];if(fs.statSync(file).size>8*1024*1024)throw Error();const paths=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(file)).replace(/\r?\n$/,'').split(/\r?\n/);if(validateNodeHeaderPaths(paths,value.version).length)throw Error();console.log(JSON.stringify({entries:paths.length,validated:true}));}else console.log(JSON.stringify(value));}
 catch{console.error('NODE_SDK_POLICY_REJECTED');process.exitCode=1;}
}
