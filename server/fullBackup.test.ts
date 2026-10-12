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
import { withAppCommandContext } from './commandContext.js';
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
it('retries identical legacy ZIP input without rerunning restore or losing later writes',async()=>{
  const buffer=await zip({'db.json':JSON.stringify(FamilyDB.getFullSnapshot())});const context={actorId:'synthetic-admin',requestId:randomUUID()};let calls=0;
  const owned={maintenance:async<T>(work:()=>Promise<T>)=>{calls++;return work();}};
  const first=await withAppCommandContext(context,()=>importFullBackup(buffer,'user_admin','Synthetic',owned));change('Synthetic later preserved');
  expect(await withAppCommandContext(context,()=>importFullBackup(buffer,'user_admin','Synthetic',owned))).toEqual(first);
  expect(calls).toBe(1);expect(FamilyDB.getTasks()[0].title).toBe('Synthetic later preserved');
});
it('resolves committed file-backed restore retries independently of mutable backup references',async()=>{
  FamilyDB.createBackup('manual','user_admin','Synthetic');const backup=FamilyDB.getFullSnapshot().backups[0];const context={actorId:'synthetic-admin',requestId:randomUUID()};let calls=0;
  const owned={maintenance:async<T>(work:()=>Promise<T>)=>{calls++;return work();}};
  await withAppCommandContext(context,()=>FamilyDB.restoreBackup(backup.id,'user_admin','Synthetic',owned));
  expect(FamilyDB.getBackups().some(item=>item.filename===backup.filename)).toBe(true);
  // Even explicit later metadata deletion must not invalidate a committed response.
  withAppWriteTransaction({actorId:'synthetic',command:'synthetic:delete-reference',requestId:randomUUID(),payloadHash:'fixture'},tx=>{tx.legacy.backups=[];});change('Synthetic later preserved');
  await withAppCommandContext(context,()=>FamilyDB.restoreBackup(backup.id,'user_admin','Synthetic',owned));
  expect(calls).toBe(1);expect(FamilyDB.getTasks()[0].title).toBe('Synthetic later preserved');
});

function syntheticCredentialFixture(){
  const requestId=randomUUID(),hash='synthetic-backup-credential-canary';
  const before=FamilyDB.getFullSnapshot();
  withAppWriteTransaction({actorId:'synthetic',command:'synthetic:backup-credential-fixture',requestId:randomUUID(),payloadHash:'fixture'},tx=>{
    tx.legacy.users[0].passwordHash=hash;
    tx.run('INSERT INTO app_commands(command,request_id,actor_id,payload_hash,result,committed_at) VALUES(?,?,?,?,?,?)',['synthetic:cached-user',requestId,'synthetic','synthetic-stable-digest',JSON.stringify({user:{id:tx.legacy.users[0].id,passwordHash:hash},transaction:{id:'synthetic-preserved-finance-id',amount:321},success:true}),Date.now()]);
  });
  return {requestId,hash,userIds:before.users.map(user=>user.id)};
}
function assertCredentialFreeSnapshot(snapshot:any,fixture:ReturnType<typeof syntheticCredentialFixture>){
  expect(JSON.stringify(snapshot)).not.toContain(fixture.hash);
  expect(snapshot.legacy.users.map((user:any)=>user.id)).toEqual(fixture.userIds);
  expect(snapshot.legacy.users.every((user:any)=>!Object.hasOwn(user,'passwordHash'))).toBe(true);
  const row=snapshot.tables.app_commands.find((command:any)=>command.request_id===fixture.requestId);
  expect(row).toMatchObject({command:'synthetic:cached-user',request_id:fixture.requestId,actor_id:'synthetic',payload_hash:'synthetic-stable-digest'});
  expect(JSON.parse(row.result)).toEqual({user:{id:fixture.userIds[0]},transaction:{id:'synthetic-preserved-finance-id',amount:321},success:true});
  expect(FamilyDB.getUsers()[0].passwordHash).toBe(fixture.hash);
}
it('ordinary ZIP excludes user/cached credentials while retaining IDs and command dedupe/results',async()=>{
  const fixture=syntheticCredentialFixture();const archive=await Open.buffer(await capture());
  const snapshot=JSON.parse((await archive.files.find(file=>file.path==='snapshot.json')!.buffer()).toString('utf8'));
  assertCredentialFreeSnapshot(snapshot,fixture);
});
it.each(['manual','auto'] as const)('ordinary %s JSON backup excludes credentials without changing live authentication',type=>{
  const fixture=syntheticCredentialFixture();const result=FamilyDB.createBackup(type,'user_admin','Synthetic');
  const snapshot=JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR!,'backups',result.filename),'utf8'));
  assertCredentialFreeSnapshot(snapshot,fixture);
});

it.each(['legacy-zip','legacy-json'])('ordinary %s restore excludes historical credentials and preserves canonical user IDs',async format=>{
  const fixture=syntheticCredentialFixture();const legacy=FamilyDB.getFullSnapshot();
  if(format==='legacy-zip')await importFullBackup(await zip({'manifest.json':JSON.stringify({app:'family-organizer',format:1}),'db.json':JSON.stringify(legacy)}),'user_admin','Synthetic',options);
  else await FamilyDB.restoreFromSnapshot(legacy,'user_admin','Synthetic','synthetic legacy JSON',options);
  expect(FamilyDB.getUsers().map(user=>user.id)).toEqual(fixture.userIds);
  expect(FamilyDB.getUsers().every(user=>!Object.hasOwn(user,'passwordHash'))).toBe(true);
});

it('ordinary backup removes push capabilities and password-command verifiers without losing finance dedupe',async()=>{
  const endpoint='https://push.synthetic.invalid/synthetic-capability-canary';
  const verifier='synthetic-unsalted-password-verifier';
  const requestId=randomUUID();
  withAppWriteTransaction({actorId:'synthetic',command:'synthetic:capability-fixture',requestId:randomUUID(),payloadHash:'fixture'},tx=>{
    tx.legacy.pushSubscriptions=[{id:'synthetic-subscription',userId:tx.legacy.users[0].id,subscription:{endpoint,keys:{auth:'synthetic-auth',p256dh:'synthetic-key'}}} as any];
    tx.run('INSERT INTO app_commands VALUES(?,?,?,?,?,?)',['legacy:changePassword',requestId,'synthetic',verifier,JSON.stringify({value:{success:true}}),new Date().toISOString()]);
    tx.run('INSERT INTO app_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',['synthetic-push','legacy','push-delivery','synthetic-push-dedupe',JSON.stringify({notificationId:'synthetic-notification',endpoint,userId:tx.legacy.users[0].id}),verifier,'effect','pending',Date.now(),null,null,0,5,null,new Date().toISOString(),null]);
  });
  const archive=await Open.buffer(await capture());const snapshot=JSON.parse((await archive.files.find(file=>file.path==='snapshot.json')!.buffer()).toString());
  expect(JSON.stringify(snapshot)).not.toContain(endpoint);expect(JSON.stringify(snapshot)).not.toContain(verifier);
  expect(snapshot.legacy.pushSubscriptions).toEqual([]);
  expect(snapshot.tables.app_commands.find((row:any)=>row.request_id===requestId)).toMatchObject({command:'legacy:changePassword',request_id:requestId,actor_id:'synthetic',result:JSON.stringify({value:{success:true}})});
  expect(snapshot.tables.app_jobs.find((row:any)=>row.id==='synthetic-push')).toMatchObject({id:'synthetic-push',unique_key:'synthetic-push-dedupe',type:'push-delivery',lease_token:null});
});
