/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// Shared backup format2: trusted manifest/rows/settings plus immutable media bytes.
// Provider/session secrets stay local; F07 supplies separate encrypted recovery.
import { ZipArchive } from 'archiver';
import { Open } from 'unzipper';
import { randomUUID } from 'node:crypto';
import { FamilyDB, normalizeDB } from './db.js';
import { withAppWriteTransaction } from './appStore.js';
import { collectAppSnapshot, validateAppSnapshot, restoreAppSnapshot, legacySnapshot, type RestoreOptions } from './appSnapshot.js';
import { snapshotLimits, validMediaPath } from './snapshotFiles.js';
const APP='family-organizer';
export function streamFullBackup(out:NodeJS.WritableStream):Promise<void> {
  const snapshot=withAppWriteTransaction({actorId:'system:snapshot',command:'core:snapshot:zip-read',requestId:randomUUID(),payloadHash:'shared-zip-v2'},collectAppSnapshot);
  return new Promise((resolve,reject)=>{
    const archive=new ZipArchive({zlib:{level:6}});archive.on('error',reject);archive.on('warning',reject);out.on('error',reject);archive.on('end',resolve);archive.pipe(out);
    archive.append(JSON.stringify({app:APP,format:2,createdAt:snapshot.manifest.createdAt}),{name:'manifest.json'});
    archive.append(JSON.stringify({...snapshot,media:{}}),{name:'snapshot.json'});
    for(const [name,data] of Object.entries(snapshot.media))archive.append(Buffer.from(data,'base64'),{name:'uploads/'+name});
    void archive.finalize().catch(reject);
  });
}
export function fullBackupFilename():string {return `family-organizer_full_${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.zip`;}
export async function importFullBackup(buffer:Buffer,userId:string,username:string,options:RestoreOptions):Promise<{restoredFiles:number}> {
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>snapshotLimits.bytes)throw new Error('Backup ZIP is empty or exceeds256MiB');
  const archive=await Open.buffer(buffer).catch(()=>{throw new Error('Invalid backup ZIP');});
  if(archive.files.length>snapshotLimits.files+4)throw new Error('Backup ZIP entry limit exceeded');
  const names=new Set<string>();let advertised=0;
  for(const entry of archive.files){
    const name=entry.type==='Directory'?entry.path.replace(/\/$/,''):entry.path;validMediaPath(name);
    if(!['manifest.json','snapshot.json','db.json','app_settings.json','uploads'].includes(name)&&!name.startsWith('uploads/'))throw new Error('Unexpected backup ZIP entry');
    const alias=name.normalize('NFC').toLowerCase();if(names.has(alias))throw new Error('Duplicate backup ZIP entry');names.add(alias);
    if((Number((entry as any).externalFileAttributes)>>>16&0xf000)===0xa000)throw new Error('Backup ZIP links are unsupported');
    advertised+=entry.uncompressedSize;
    if(!Number.isSafeInteger(advertised)||advertised>snapshotLimits.bytes)throw new Error('Backup ZIP expanded size limit exceeded');
  }
  const contents=new Map<string,Buffer>();let actual=0;
  for(const entry of archive.files){
    if(entry.type==='Directory')continue;
    const chunks:Buffer[]=[];
    for await(const chunk of entry.stream()){
      const bytes=Buffer.from(chunk);actual+=bytes.length;
      if(actual>snapshotLimits.bytes)throw new Error('Backup ZIP expanded size limit exceeded');chunks.push(bytes);
    }
    contents.set(entry.path,Buffer.concat(chunks));
  }
  const parse=(name:string)=>{const bytes=contents.get(name);return bytes?JSON.parse(bytes.toString('utf8')):undefined;};
  const manifest=parse('manifest.json');
  if(manifest&&(manifest.app!==APP||![1,2].includes(manifest.format)))throw new Error('Unsupported backup ZIP manifest');
  const media=Object.fromEntries([...contents].filter(([name])=>name.startsWith('uploads/')).map(([name,data])=>[name.slice(8),data.toString('base64')]));
  let snapshot;
  if(manifest?.format===2){
    const parsed=parse('snapshot.json');if(!parsed||Object.keys(parsed.media??{}).length)throw new Error('Invalid shared backup metadata');
    snapshot=validateAppSnapshot({...parsed,media});
  }else{
    const legacy=parse('db.json');if(!legacy||!Array.isArray(legacy.users)||!Array.isArray(legacy.tasks))throw new Error('Invalid legacy backup records');
    snapshot=legacySnapshot(normalizeDB(legacy),media,parse('app_settings.json'));
  }
  const report=await restoreAppSnapshot(snapshot,options);
  FamilyDB.logActivity(userId,username,'Phục hồi toàn phần','Đã khôi phục backup đã xác minh manifest và tệp media.');
  return report;
}
