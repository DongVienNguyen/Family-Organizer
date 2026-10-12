import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import {captureRecoverySettings,selectRecoverySettings} from './recoverySettings.js';
import { collectAppSnapshot, validateAppSnapshot, restoreAppSnapshot, registerSnapshotTable } from './appSnapshot.js';
import { withAppWriteTransaction } from './appStore.js';
import { registerDomainMigration, applyDomainMigrations } from './appMigrations.js';
import { AppJobStore } from './jobStore.js';
import { AppJobs } from './appJobs.js';
import { RewardStoreTx } from './rewardStore.js';
import { FamilyDB, setAppSetting, getAppSettings } from './db.js';
import { sqliteConnection, sqliteLoad } from './sqlite.js';
import { UPLOADS_DIR } from './media.js';

const meta = () => ({ actorId: 'synthetic-snapshot', command: 'synthetic:snapshot', requestId: randomUUID(), payloadHash: createHash('sha256').update('synthetic').digest('hex') });
const capture = () => withAppWriteTransaction(meta(), collectAppSnapshot);
const options = { maintenance: async <T>(work: () => Promise<T>) => work() };
const file = path.join(UPLOADS_DIR, 'synthetic.bin');
let initialized = false;
function fixture() {
  if (!initialized) {
    registerSnapshotTable('wallet', 'wallet_snapshot_fixture', ['id','minor']);
    registerDomainMigration('wallet', 1, tx => tx.exec('CREATE TABLE wallet_snapshot_fixture (id TEXT PRIMARY KEY, minor INTEGER NOT NULL)'), 'synthetic-snapshot-wallet-v1');
    applyDomainMigrations({ enabled: ['wallet'], pilot: true });
    initialized = true;
  }
  fs.mkdirSync(UPLOADS_DIR,{recursive:true});
  fs.writeFileSync(file, 'synthetic original bytes');
  setAppSetting('rewardsEnabled', '1'); setAppSetting('geminiApiKey', 'synthetic-secret-excluded');
  setAppSetting('homelabLinks', JSON.stringify([{id:'synthetic-link',name:'Synthetic service',url:'https://service.invalid/synthetic'}]));
  withAppWriteTransaction(meta(), tx => {
    tx.run('INSERT OR REPLACE INTO wallet_snapshot_fixture VALUES (?,?)', 'synthetic-wallet', 1700);
    tx.legacy.tasks = [{ id: 'synthetic-snapshot-task', title: 'Synthetic task', status: 'todo', createdAt: '2026-01-01' } as any];
    new RewardStoreTx(tx).applyCompletionGrant({ claimId: randomUUID(), taskId: 'synthetic-snapshot-task', userId: tx.legacy.users[0].id, points: 4, actorId: tx.legacy.users[0].id, reason: 'Synthetic snapshot points' });
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('collects one consistent WAL snapshot of task, Wallet rows, canonical points, media and namespace versions', async () => {
  fixture(); const snapshot = capture();
  expect(sqliteConnection().pragma('journal_mode', { simple: true })).toBe('wal');
  expect(snapshot.manifest).toMatchObject({ schemaVersion: 1, domains: { wallet: 1, productivity: 0 }, legacyVersion: 1 });
  expect(snapshot.legacy.tasks[0].id).toBe('synthetic-snapshot-task');
  expect(snapshot.tables.wallet_snapshot_fixture).toEqual([{ id: 'synthetic-wallet', minor: 1700 }]);
  expect(snapshot.legacy.rewardLedger.some((row: any) => row.points === 4)).toBe(true);
  expect(snapshot.manifest.mediaManifest).toContainEqual(expect.objectContaining({ path: 'synthetic.bin', sha256: createHash('sha256').update('synthetic original bytes').digest('hex') }));
  expect(snapshot.settings.homelabLinks).toBe(getAppSettings().homelabLinks);
  expect(snapshot.settings.rewardsEnabled).toBe('1'); expect(JSON.stringify(snapshot)).not.toContain('synthetic-secret-excluded');
  withAppWriteTransaction(meta(), tx => { tx.legacy.tasks = []; tx.legacy.rewardLedger = []; tx.run('UPDATE wallet_snapshot_fixture SET minor=99'); });
  fs.writeFileSync(file, 'synthetic changed'); setAppSetting('rewardsEnabled', '0');
  expect(await restoreAppSnapshot(validateAppSnapshot(JSON.parse(JSON.stringify(snapshot))), options)).toMatchObject({ restoredFiles: 1 });
  expect(sqliteLoad().tasks).toEqual(snapshot.legacy.tasks); expect(sqliteLoad().rewardLedger).toEqual(snapshot.legacy.rewardLedger);
  expect(sqliteConnection().prepare('SELECT * FROM wallet_snapshot_fixture').all()).toEqual(snapshot.tables.wallet_snapshot_fixture);
  expect(fs.readFileSync(file, 'utf8')).toBe('synthetic original bytes'); expect(getAppSettings().rewardsEnabled).toBe('1');
  // Ordinary restore never imports provider keys and preserves local secret configuration.
  expect(getAppSettings().geminiApiKey).toBe('synthetic-secret-excluded');
});

it.each(['checksum','namespace','future-version','table','media-path'])('rejects invalid %s before changing live database or media', mode => {
  fixture(); const snapshot = capture(); const before = sqliteLoad(); const bytes = fs.readFileSync(file);
  const changed = JSON.parse(JSON.stringify(snapshot));
  if (mode === 'checksum') changed.manifest.checksum = '0'.repeat(64);
  if (mode === 'namespace') delete changed.manifest.domains.productivity;
  if (mode === 'future-version') changed.manifest.domains.wallet = 900;
  if (mode === 'table') changed.tables['wallet_uploaded_sql;DROP TABLE users'] = [];
  if (mode === 'media-path') changed.media['../outside:stream'] = Buffer.from('synthetic').toString('base64');
  expect(() => validateAppSnapshot(changed)).toThrow();
  expect(sqliteLoad()).toEqual(before); expect(fs.readFileSync(file)).toEqual(bytes);
});

it('drops restored historical effects and leases, retaining only explicit future schedules that can run', async () => {
  fixture(); const store = new AppJobStore();
  const effect = store.enqueue({ namespace: 'synthetic_restore', type: 'queue', key: randomUUID(), payload: {}, kind: 'effect' });
  const future = store.enqueue({ namespace: 'synthetic_restore', type: 'queue', key: randomUUID(), payload: { synthetic: true }, kind: 'schedule', availableAt: Date.now() + 60_000 });
  const snapshot = capture();
  await restoreAppSnapshot(validateAppSnapshot(snapshot), options);
  expect(sqliteConnection().prepare('SELECT status FROM app_jobs WHERE id=?').get(effect)).toEqual({ status: 'dropped' });
  expect(sqliteConnection().prepare('SELECT status FROM app_jobs WHERE id=?').get(future)).toEqual({ status: 'pending' });
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 60_001);
  const calls: string[] = []; const jobs = new AppJobs(error => { throw error; }, store);
  jobs.registerAppJob('synthetic_restore', 'queue', (_signal, job) => { calls.push(job!.id); });
  try { jobs.start(); await vi.advanceTimersByTimeAsync(1); expect(calls).toEqual([future]); }
  finally { await jobs.stop(); }
});

it('waits for accepted workers to drain before replacing their storage and resumes future work', async () => {
  fixture(); const snapshot = capture(); const store = new AppJobStore();
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); const errors: unknown[] = [];
  const jobs = new AppJobs(error => errors.push(error), store);
  jobs.registerAppJob('synthetic_drain', 'writer', async () => { entered(); await held; FamilyDB.addRewardEntry({ userId: FamilyDB.getUsers()[0].id, points: 21 }, 'synthetic', 'Synthetic'); });
  store.enqueue({ namespace: 'synthetic_drain', type: 'writer', key: randomUUID(), payload: {} });
  jobs.start(); await started; let restored = false;
  const restoring = restoreAppSnapshot(validateAppSnapshot(snapshot), { maintenance: async work => { await jobs.pause(); const result = await work(); jobs.resume(); return result; } }).then(() => { restored = true; });
  try {
    await new Promise(resolve => setTimeout(resolve, 20)); expect(restored).toBe(false);
    release(); await restoring; expect(errors).toEqual([]);
    expect(sqliteLoad().rewardLedger).toEqual(snapshot.legacy.rewardLedger);
  } finally { release(); await restoring; await jobs.stop(); }
});

it('rolls files and SQL back if promotion fails before commit, then leaves no active journal', async () => {
  fixture(); const snapshot = capture();
  fs.writeFileSync(file, 'synthetic current bytes'); setAppSetting('rewardsEnabled', '0');
  withAppWriteTransaction(meta(), tx => { tx.run('UPDATE wallet_snapshot_fixture SET minor=99'); });
  const before = sqliteLoad();
  await expect(restoreAppSnapshot(validateAppSnapshot(snapshot), { ...options, onBoundary: phase => { if (phase === 'media-promoted') throw new Error('Synthetic promotion failure'); } })).rejects.toThrow('Synthetic promotion failure');
  expect(sqliteLoad()).toEqual(before); expect(fs.readFileSync(file, 'utf8')).toBe('synthetic current bytes');
  expect(getAppSettings().rewardsEnabled).toBe('0');
  expect(sqliteConnection().prepare('SELECT minor FROM wallet_snapshot_fixture').get()).toEqual({ minor: 99 });
  expect(fs.existsSync(path.join(process.env.DATA_DIR!, 'restore-journal.json'))).toBe(false);
});

function rehash(snapshot: any) {
  const sort = (value: any): any => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,sort(value[key])])) : value;
  const { checksum: _checksum, ...manifest } = snapshot.manifest;
  snapshot.manifest.checksum = createHash('sha256').update(JSON.stringify(sort({ ...snapshot,manifest }))).digest('hex');
  return snapshot;
}
it.each(['directory-alias','file-parent','core-version','migration-version','dangling-claim','column-alias'])('rejects structurally unsafe %s even when the uploaded checksum is correct', mode => {
  fixture(); const snapshot = JSON.parse(JSON.stringify(capture()));
  if (mode === 'directory-alias' || mode === 'file-parent') {
    snapshot.media = mode === 'directory-alias' ? { 'A/x': 'eA==', 'a/y': 'eQ==' } : { a: 'eA==', 'a/b': 'eQ==' };
    snapshot.manifest.mediaManifest = Object.entries(snapshot.media).map(([path,data]: any) => ({ path,size:Buffer.from(data,'base64').length,sha256:createHash('sha256').update(Buffer.from(data,'base64')).digest('hex') }));
  }
  if (mode === 'core-version') snapshot.tables.app_meta.find((row: any) => row.key === 'job_store_version').value = '900';
  if (mode === 'migration-version') snapshot.tables.app_migrations.find((row: any) => row.namespace === 'wallet').version = 900;
  if (mode === 'column-alias') snapshot.tables.server_metrics = [{ 'cpu,disk,ram,ssd,t,temp': 42 }];
  if (mode === 'dangling-claim') snapshot.tables.app_reward_claims[0].grant_entry_id = 'synthetic-missing-reward';
  expect(() => validateAppSnapshot(rehash(snapshot))).toThrow();
});

it('returns a committed restore result on the same request retry without overwriting later writes', async () => {
  const { withAppCommandContext } = await import('./commandContext.js');
  fixture(); const snapshot = validateAppSnapshot(capture()); const context = { actorId: 'synthetic-admin', requestId: randomUUID() };
  const first = await withAppCommandContext(context, () => restoreAppSnapshot(snapshot, options));
  withAppWriteTransaction(meta(), tx => { tx.legacy.tasks.push({ id: 'synthetic-after-restore', title: 'Preserve later write' } as any); });
  const later = sqliteLoad();
  expect(await withAppCommandContext(context, () => restoreAppSnapshot(snapshot, options))).toEqual(first);
  expect(sqliteLoad()).toEqual(later);
});

it('keeps repeated snapshot reads bounded instead of embedding earlier snapshot results recursively', () => {
  fixture(); const first = capture(); const firstSize = Buffer.byteLength(JSON.stringify(first));
  let latest = first;
  for (let index = 0; index < 4; index++) latest = capture();
  expect(Buffer.byteLength(JSON.stringify(latest))).toBeLessThan(firstSize * 1.5);
});
it('refuses a non-retryable full snapshot result from a command that mutated canonical storage', () => {
  fixture(); const before = sqliteLoad();
  expect(() => withAppWriteTransaction(meta(), tx => { tx.legacy.tasks = []; return collectAppSnapshot(tx); })).toThrow(/snapshot.*read|read.*snapshot/i);
  expect(sqliteLoad()).toEqual(before);
});

it('fails closed on a structurally plausible but corrupt restore journal without deleting live files', async () => {
  fixture(); const { recoverAppRestore }=await import('./appSnapshot.js');const journal=path.join(process.env.DATA_DIR!,'restore-journal.json');
  const before=sqliteLoad();const bytes=fs.readFileSync(file);
  fs.writeFileSync(journal,JSON.stringify({id:randomUUID(),checksum:'0'.repeat(64),hadMedia:false,hadSettings:false,media:[],settingsHash:'0'.repeat(64)}));
  try{expect(()=>recoverAppRestore()).toThrow();expect(sqliteLoad()).toEqual(before);expect(fs.readFileSync(file)).toEqual(bytes);}
  finally{fs.rmSync(journal,{force:true});}
});
it('cleans only its own staging after a pre-promotion failure, retaining live bytes and the native safety copy',async()=>{
  fixture();const snapshot=validateAppSnapshot(capture());const before=sqliteLoad();const bytes=fs.readFileSync(file);
  await expect(restoreAppSnapshot(snapshot,{...options,onBoundary:phase=>{if(phase==='staging-complete')throw new Error('Synthetic pre-journal failure');}})).rejects.toThrow('Synthetic pre-journal failure');
  expect(sqliteLoad()).toEqual(before);expect(fs.readFileSync(file)).toEqual(bytes);
  expect(fs.readdirSync(process.env.DATA_DIR!).filter(name=>name.startsWith('.restore-'))).toEqual([]);
  expect(fs.readdirSync(path.join(process.env.DATA_DIR!,'backups')).some(name=>name.startsWith('pre-restore_')&&name.endsWith('.sqlite'))).toBe(true);
});

it.each(['../synthetic-sentinel.txt','C:\\synthetic.json','backup_x.json:stream'])('rejects imported backup filename %s with a correct snapshot checksum', filename=>{
  fixture();const snapshot=JSON.parse(JSON.stringify(capture()));
  snapshot.legacy.backups=[{id:'synthetic-malicious',filename,type:'manual',createdAt:'2026-01-01',sizeKb:1}];
  expect(()=>validateAppSnapshot(rehash(snapshot))).toThrow(/backup/i);
});
it('replaces absent public settings with defaults while retaining local-only credentials',async()=>{
  fixture();const snapshot=JSON.parse(JSON.stringify(capture()));snapshot.settings={};
  setAppSetting('rewardApprovalThreshold','999');setAppSetting('telegramBackupEnabled','1');
  await restoreAppSnapshot(validateAppSnapshot(rehash(snapshot)),options);
  const settings=getAppSettings();expect(settings.rewardApprovalThreshold).toBeUndefined();expect(settings.telegramBackupEnabled).toBeUndefined();expect(settings.homelabLinks).toBeUndefined();expect(settings.geminiApiKey).toBe('synthetic-secret-excluded');
});
it('can read the journal emitted for an accepted large media manifest before any promotion',async()=>{
  fixture();const {writeJournal,readJournal,journalFile}=await import('./snapshotFiles.js');const snapshot=JSON.parse(JSON.stringify(capture()));
  snapshot.media=Object.fromEntries(Array.from({length:8500},(_,i)=>[`${'a'.repeat(200)}/${'b'.repeat(200)}/${String(i).padStart(6,'0')}.bin`, '']));
  snapshot.manifest.mediaManifest=Object.keys(snapshot.media).map(path=>({path,size:0,sha256:createHash('sha256').update('').digest('hex')}));
  const accepted=validateAppSnapshot(rehash(snapshot));const journal={id:randomUUID(),checksum:accepted.manifest.checksum,hadMedia:true,hadSettings:true,media:accepted.manifest.mediaManifest,settingsHash:'0'.repeat(64)};
  try{writeJournal(journal);expect(fs.statSync(journalFile).size).toBeGreaterThan(4*1024*1024);expect(readJournal()?.media).toEqual(journal.media);}finally{fs.rmSync(journalFile,{force:true});}
});
it.each(['delete','retention'])('constrains %s of previously persisted malicious backup metadata',action=>{
  fixture();const sentinel=path.join(process.env.DATA_DIR!,'synthetic-sentinel.txt');fs.writeFileSync(sentinel,'synthetic must survive');
  withAppWriteTransaction(meta(),tx=>{tx.legacy.backups=Array.from({length:31},(_,i)=>({id:`synthetic-unsafe-${i}`,filename:'../synthetic-sentinel.txt',type:'auto',createdAt:'2026-01-01',sizeKb:1}));});
  try{
    if(action==='delete')expect(()=>FamilyDB.deleteBackup('synthetic-unsafe-0','user_admin','Synthetic')).toThrow(/backup/i);
    else expect(()=>FamilyDB.createBackup('auto','user_admin','Synthetic')).toThrow(/backup/i);
    expect(fs.readFileSync(sentinel,'utf8')).toBe('synthetic must survive');
  }finally{fs.rmSync(sentinel,{force:true});withAppWriteTransaction(meta(),tx=>{tx.legacy.backups=[];});}
});

it('refuses an unbranded private setting override before maintenance or file staging',async()=>{
 fixture();const saved=validateAppSnapshot(capture());let calls=0;
 await expect(restoreAppSnapshot(saved,{maintenance:async work=>{calls++;return work();},privateSettings:{geminiApiKey:'synthetic-forged'} as any} as any)).rejects.toThrow('RECOVERY_SETTINGS_INVALID');
 expect(calls).toBe(0);expect(FamilyDB.getTasks()[0].id).toBe(saved.legacy.tasks[0].id);
});

it('rejects merged private/public settings beyond the existing byte budget without promotion',async()=>{
 fixture();setAppSetting('homelabLinks',JSON.stringify(Array.from({length:3},(_,index)=>({id:'synthetic-'+index,url:'https://synthetic.invalid/'+ 'x'.repeat(1500)}))));const saved=validateAppSnapshot(capture());
 const {settingsFile,settingsByteLimit}=await import('./snapshotFiles.js');const before=Buffer.from(JSON.stringify({unselectedPrivate:'x'.repeat(settingsByteLimit-3000),geminiApiKey:'synthetic-target',homelabLinks:'[]'}));fs.writeFileSync(settingsFile,before);
 const patch=selectRecoverySettings(captureRecoverySettings({geminiApiKey:'x'.repeat(512)},['gemini']),['gemini']);
 await expect(restoreAppSnapshot(saved,{...options,privateSettings:patch} as any)).rejects.toThrow('Local settings size limit exceeded');expect(fs.readFileSync(settingsFile).equals(before)).toBe(true);
});

it('rejects an unbranded private file patch before maintenance or staging',async()=>{
 fixture();const snapshot=validateAppSnapshot(capture()),maintenance=vi.fn(async work=>work());
 await expect(restoreAppSnapshot(snapshot,{maintenance,privateFiles:{sessionSigningKey:'c3ludGhldGlj'} as any} as any)).rejects.toThrow('RECOVERY_FILES_INVALID');expect(maintenance).not.toHaveBeenCalled();
});
it('promotes an explicitly selected signing key with the shared SQL/files restore',async()=>{
 fixture();const {appConfig}=await import('./config.js');const {captureRecoveryFiles,selectRecoveryFiles}=await import('./recoveryFiles.js');const keyFile=path.join(appConfig.configRoot,'session_secret.key');fs.mkdirSync(appConfig.configRoot,{recursive:true});fs.writeFileSync(keyFile,'synthetic-current-session-key');const snapshot=validateAppSnapshot(capture());
 const patch=selectRecoveryFiles(captureRecoveryFiles({sessionSigningKey:Buffer.from('synthetic-selected-session-key\n')},['sessionSigningKey']),['sessionSigningKey']);await restoreAppSnapshot(snapshot,{...options,privateFiles:patch} as any);expect(fs.readFileSync(keyFile,'utf8')).toBe('synthetic-selected-session-key\n');expect(sqliteLoad().tasks).toEqual(snapshot.legacy.tasks);
});

it.each(['early-eof','partial-read-error','growth-read-error'])('clears the partial signing-key buffer after %s and closes its handle',async mode=>{
 const {appConfig}=await import('./config.js'),{readSigningKeyFile}=await import('./snapshotFiles.js');const keyFile=path.join(appConfig.configRoot,'session_secret.key');fs.mkdirSync(appConfig.configRoot,{recursive:true});fs.writeFileSync(keyFile,'synthetic-read-fault-signing-key');
 const originalOpen=fs.openSync;let descriptor:number|undefined,captured:Buffer|undefined,calls=0;
 vi.spyOn(fs,'openSync').mockImplementation(((...args:any[])=>{descriptor=(originalOpen as any)(...args);return descriptor;}) as any);
 vi.spyOn(fs,'readSync').mockImplementation(((_fd:number,buffer:Buffer)=>{calls++;if(calls===1){captured=buffer;buffer.fill(65);return mode==='growth-read-error'?buffer.length:2;}if(mode==='early-eof')return 0;throw new Error('Synthetic native read failure');}) as any);
 try{expect(()=>readSigningKeyFile()).toThrow();expect(captured).toBeDefined();expect(captured!.every(byte=>byte===0)).toBe(true);expect(()=>fs.fstatSync(descriptor!)).toThrow();}finally{vi.restoreAllMocks();}
});

it('rejects unbranded provider env before maintenance or staging',async()=>{fixture();const snapshot=validateAppSnapshot(capture()),maintenance=vi.fn(async work=>work());await expect(restoreAppSnapshot(snapshot,{maintenance,privateEnv:{GEMINI_API_KEY:'unsafe'} as any} as any)).rejects.toThrow('RECOVERY_ENV_INVALID');expect(maintenance).not.toHaveBeenCalled();});
it('merges selected provider env through the shared journal while keeping unselected bytes',async()=>{fixture();const {appConfig}=await import('./config.js'),{captureRecoveryEnv,selectRecoveryEnv}=await import('./recoveryEnv.js');const file=path.join(appConfig.configRoot,'.env');fs.mkdirSync(appConfig.configRoot,{recursive:true});fs.writeFileSync(file,'# retained\r\nAPP_URL=https://retained.invalid\r\nGEMINI_API_KEY=synthetic-old\r\nVAPID_PUBLIC_KEY=retained-public\r\n');const snapshot=validateAppSnapshot(capture()),patch=selectRecoveryEnv(captureRecoveryEnv('GEMINI_API_KEY=synthetic-restored\n',['gemini']),['gemini']);await restoreAppSnapshot(snapshot,{...options,privateEnv:patch} as any);const {parse}=await import('dotenv');expect(parse(fs.readFileSync(file))).toEqual({APP_URL:'https://retained.invalid',GEMINI_API_KEY:'synthetic-restored',VAPID_PUBLIC_KEY:'retained-public'});expect(fs.readFileSync(file,'utf8')).toContain('# retained\r\n');expect(sqliteLoad().tasks).toEqual(snapshot.legacy.tasks);});
