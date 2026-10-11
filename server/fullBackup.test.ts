import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { ZipArchive } from 'archiver';
import { Open } from 'unzipper';
import { expect, it } from 'vitest';
import { streamFullBackup, importFullBackup } from './fullBackup.js';
import { FamilyDB, getAppSettings, setAppSetting } from './db.js';
import { UPLOADS_DIR } from './media.js';
import { withAppWriteTransaction } from './appStore.js';
import { randomUUID } from 'node:crypto';
const options={maintenance:async <T>(work:()=>Promise<T>)=>work()};
async function capture() { const out=new PassThrough();const chunks:Buffer[]=[];out.on('data',chunk=>chunks.push(chunk));const finished=once(out,'end');await streamFullBackup(out);await finished;return Buffer.concat(chunks); }
async function zip(entries:Record<string,string|Buffer>) {
  const out=new PassThrough();const chunks:Buffer[]=[];out.on('data',chunk=>chunks.push(chunk));const finished=once(out,'end');const archive=new ZipArchive();archive.pipe(out);for(const [name,data] of Object.entries(entries))archive.append(data,{name});await archive.finalize();await finished;return Buffer.concat(chunks);
}
const change=(title:string)=>withAppWriteTransaction({actorId:'synthetic',command:'synthetic:zip',requestId:randomUUID(),payloadHash:'fixture'},tx=>{tx.legacy.tasks=[{id:'synthetic-zip-task',title} as any];});
it('exports shared versions/immutable media without provider keys and restores through the supplied owner',async()=>{
  change('Synthetic original');fs.writeFileSync(path.join(UPLOADS_DIR,'synthetic.bin'),'original bytes');setAppSetting('geminiApiKey','synthetic-local-key');setAppSetting('rewardsEnabled','1');
  const buffer=await capture();const archive=await Open.buffer(buffer);const snapshot=archive.files.find(file=>file.path==='snapshot.json');expect(snapshot).toBeDefined();
  const content=await snapshot!.buffer();expect(content.toString()).not.toContain('synthetic-local-key');expect(JSON.parse(content.toString()).manifest.domains).toEqual({wallet:0,productivity:0});
  change('Synthetic later');fs.writeFileSync(path.join(UPLOADS_DIR,'synthetic.bin'),'later bytes');setAppSetting('rewardsEnabled','0');let maintenanceCalls=0;
  await (importFullBackup as any)(buffer,'user_admin','Synthetic',{maintenance:async(work:any)=>{maintenanceCalls++;return work();}});
  expect(maintenanceCalls).toBe(1);expect(FamilyDB.getTasks()[0].title).toBe('Synthetic original');expect(fs.readFileSync(path.join(UPLOADS_DIR,'synthetic.bin'),'utf8')).toBe('original bytes');expect(getAppSettings()).toMatchObject({rewardsEnabled:'1',geminiApiKey:'synthetic-local-key'});
});
it.each(['uploads/../outside','uploads/file:stream','uploads/NUL.txt'])('rejects unsafe ZIP entry %s before promoting files or changing records',async name=>{
  const before=FamilyDB.getFullSnapshot();const buffer=await zip({'db.json':JSON.stringify(before),[name]:'synthetic'});
  await expect((importFullBackup as any)(buffer,'user_admin','Synthetic',options)).rejects.toThrow();expect(FamilyDB.getFullSnapshot()).toEqual(before);
});
it('imports a pre-domain format1 backup while preserving local provider credentials',async()=>{
  change('Synthetic legacy');const legacy=FamilyDB.getFullSnapshot();
  const buffer=await zip({'manifest.json':JSON.stringify({app:'family-organizer',format:1}),'db.json':JSON.stringify(legacy),'app_settings.json':JSON.stringify({geminiApiKey:'synthetic-uploaded-key',rewardsEnabled:'1'}),'uploads/legacy.bin':'legacy bytes'});
  change('Synthetic changed');setAppSetting('geminiApiKey','synthetic-local-key');
  await (importFullBackup as any)(buffer,'user_admin','Synthetic',options);
  expect(FamilyDB.getTasks()[0].title).toBe('Synthetic legacy');expect(getAppSettings().geminiApiKey).toBe('synthetic-local-key');expect(fs.readFileSync(path.join(UPLOADS_DIR,'legacy.bin'),'utf8')).toBe('legacy bytes');
});
