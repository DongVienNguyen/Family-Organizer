import path from 'node:path';
import assert from 'node:assert/strict';
import {safeArchivePath} from './package-contract.mjs';
export const serviceRuntime=Object.freeze({version:'2.12.0',asset:'WinSW.NET461.exe',sha256:'b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f',licenseSha256:'1cdf703c10a70e5973bf3acf2a5eeabe7746237155b92db2034aeae26fdf7802',frameworkMinRelease:528040,framework:'NET Framework 4.8 or later',nodeExeSha256:'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32'});
function root(value){
 assert.ok(typeof value==='string'&&/^[A-Za-z]:[\\/]/.test(value)&&!value.includes('%'),'Fully qualified literal local Windows root required');
 const normalized=value.replace(/\\/g,'/').replace(/\/$/,'');
 assert.ok(safeArchivePath(normalized.slice(3)),'Unsafe Windows service root');
 assert.ok(!/^[A-Za-z]:\/(?:Windows|ProgramData|Program Files(?: \(x86\))?|Users)$/i.test(normalized),'System root cannot be instance/release root');
 return path.win32.normalize(normalized);
}
const xml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function renderServiceConfiguration({releaseRoot,instanceRoot,serviceId='FamilyOrganizer',port=3000}){
 releaseRoot=root(releaseRoot);instanceRoot=root(instanceRoot);
 assert.ok(/^FamilyOrganizer(?:-[A-Za-z0-9]{1,48})?$/.test(serviceId),'Invalid owned service ID');
 assert.ok(Number.isInteger(port)&&port>=1&&port<=65535,'Invalid service port');
 const inside=(parent,child)=>{const r=path.win32.relative(parent,child);return r===''||(!r.startsWith('..\\')&&r!=='..'&&!path.win32.isAbsolute(r));};
 assert.ok(!inside(releaseRoot,instanceRoot)&&!inside(instanceRoot,releaseRoot),'Release and instance roots must be separate');
 const env={NODE_ENV:'production',APP_CODE_ROOT:path.win32.join(releaseRoot,'app'),DATA_DIR:path.win32.join(instanceRoot,'data'),CONFIG_DIR:path.win32.join(instanceRoot,'config'),LOG_DIR:path.win32.join(instanceRoot,'logs'),HOST:'127.0.0.1',PORT:String(port),NODE_PATH:'',NODE_OPTIONS:''};
 return `<?xml version="1.0" encoding="UTF-8"?>\n<service>\n  <id>${xml(serviceId)}</id>\n  <name>Family Organizer</name>\n  <description>Family Organizer Windows native application</description>\n  <executable>${xml(path.win32.join(releaseRoot,'bin/node.exe'))}</executable>\n  <arguments>&quot;${xml(path.win32.join(releaseRoot,'app/dist/server.cjs'))}&quot;</arguments>\n  <workingdirectory>${xml(path.win32.join(releaseRoot,'app'))}</workingdirectory>\n  <startmode>Automatic</startmode>\n  <delayedAutoStart/>\n  <stoptimeout>45 sec</stoptimeout>\n  <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user></serviceaccount>\n  <onfailure action="restart" delay="5 sec"/>\n  <onfailure action="none"/>\n  <resetfailure>1 hour</resetfailure>\n  <logpath>${xml(path.win32.join(instanceRoot,'logs'))}</logpath>\n  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>8</keepFiles></log>\n${Object.entries(env).map(([name,value])=>`  <env name="${name}" value="${xml(value)}"/>`).join('\n')}\n</service>\n`;
}
