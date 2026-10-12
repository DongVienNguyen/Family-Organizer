import {recoveryFileBytes,type ValidatedFilePatch} from './recoveryFiles.js';
import {applyRecoverySettings,type ValidatedSettingPatch} from './recoverySettings.js';
import {ordinaryBackupValue,ordinaryBackupSettings} from './backupCredentials.js';
import type { AppWriteTx } from './appStore.js';
import {reconcileMediaMetadata} from './mediaPolicy.js';
import { withAppWriteTransaction, AppStoreError, markSnapshotReadResult } from './appStore.js';
import { getAppCommandContext } from './commandContext.js';
import { sqliteConnection, sqliteBackupTo } from './sqlite.js';
import { LEGACY_KEYS } from './legacySchema.js';
import { validateSnapshotPayload, snapshotCoreTables, checksum, mediaManifest, type AppSnapshot, type ValidatedAppSnapshot } from './snapshotValidation.js';
export type { AppSnapshot, ValidatedAppSnapshot } from './snapshotValidation.js';
import { getDomainVersions } from './appMigrations.js';
import { AppJobStore } from './jobStore.js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { settingsByteLimit, publicSettingKeys, mediaRoot, settingsFile, readSettings, readMedia, readSigningKeyFile, signingKeyFile, reconcileBackupReferences, sha256, durableWrite, restorePaths, writeJournal, readJournal, recoverFiles, cleanupStaging } from './snapshotFiles.js';

export interface RestoreOptions { maintenance: <T>(work: () => Promise<T>) => Promise<T>; onBoundary?: (phase: string) => void; identity?: string; privateSettings?: ValidatedSettingPatch; privateFiles?: ValidatedFilePatch }
const connection = sqliteConnection();
const core = snapshotCoreTables;
const domainTables = new Map<string, { namespace: string; columns: readonly string[] }>();
const validated = new WeakSet<object>();
withAppWriteTransaction({ actorId: 'system:bootstrap', command: 'core:snapshot:init', requestId: 'core-snapshot-v1', payloadHash: sha256('core-snapshot-v1') }, tx => {
  tx.exec('CREATE TABLE IF NOT EXISTS app_reward_claims (claim_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,grant_entry_id TEXT NOT NULL,reverse_entry_id TEXT)');
  tx.exec('CREATE TABLE IF NOT EXISTS app_restore_commits (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, committed_at TEXT NOT NULL)');
  tx.run('INSERT OR IGNORE INTO app_meta (key,value) VALUES (?,?)','snapshot_schema_version','1');
});
const snapshotVersion=connection.prepare('SELECT value FROM app_meta WHERE key=?').get('snapshot_schema_version') as {value?:string}|undefined;
const markerColumns=(connection.prepare('PRAGMA table_info(app_restore_commits)').all() as any[]).map(row=>row.name);
if(snapshotVersion?.value!=='1'||JSON.stringify(markerColumns)!==JSON.stringify(['id','checksum','committed_at']))throw new Error('Unsupported snapshot storage schema');

export function registerSnapshotTable(namespace: string, table: string, columns: readonly string[]): void {
  if (!['wallet','productivity'].includes(namespace) || !new RegExp(`^${namespace}_[a-z0-9_]+$`).test(table) || !columns.length || columns.length > 100 || new Set(columns).size !== columns.length || columns.some(column => !/^[a-z][a-z0-9_]*$/.test(column))) throw new Error('Invalid trusted snapshot table registration');
  const prior = domainTables.get(table);
  if (prior && (prior.namespace !== namespace || JSON.stringify(prior.columns) !== JSON.stringify(columns))) throw new Error('Conflicting snapshot table registration');
  domainTables.set(table, { namespace, columns: [...columns] });
}
function tables(): Map<string, readonly string[]> {
  const result = new Map(core);
  for (const [name, definition] of domainTables) {
    if (connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)) result.set(name, definition.columns);
  }
  for (const [name, columns] of result) {
    const actual = connection.prepare(`PRAGMA table_info(${name})`).all().map((row: any) => row.name);
    if (JSON.stringify(actual) !== JSON.stringify(columns)) throw new Error(`Unsupported snapshot table schema: ${name}`);
  }
  const unregistered = connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'wallet_%' OR name LIKE 'productivity_%')").all().map((row: any) => row.name).filter(name => !result.has(name));
  if (unregistered.length) throw new Error('Unregistered domain snapshot tables');
  return result;
}
export function collectAppSnapshot(tx: AppWriteTx): AppSnapshot {
  const media = readMedia(); const settings = readSettings();
  const snapshot: AppSnapshot = {
    manifest: { schemaVersion: 1, domains: getDomainVersions(), legacyVersion: 1, mediaManifest: mediaManifest(media), checksum: '', createdAt: new Date().toISOString() },
    legacy: JSON.parse(JSON.stringify(tx.legacy)), tables: Object.fromEntries([...tables()].map(([name, columns]) => [name, tx.all(`SELECT ${columns.join(',')} FROM ${name}`)])),
    settings: Object.fromEntries(publicSettingKeys.filter(key => settings[key] !== undefined).map(key => [key,settings[key]])), media,
  };
  snapshot.manifest.checksum = checksum(snapshot);
  validateAppSnapshot(snapshot);
  return markSnapshotReadResult(snapshot);
}
/** Project the shared engine's snapshot; do not mutate live records or drop command/claim IDs. */
export function ordinaryAppSnapshot(source:AppSnapshot):ValidatedAppSnapshot {
  const snapshot:AppSnapshot={...source,manifest:{...source.manifest,credentials:'excluded-v1'},legacy:ordinaryBackupValue(source.legacy),tables:{...source.tables},settings:ordinaryBackupSettings(source.settings)};
  // Browser subscriptions are revocable capabilities, re-established on the target.
  snapshot.legacy.pushSubscriptions=[];
  const credentialCommands=new Set(['legacy:createUser','legacy:changePassword','legacy:adminResetPassword','legacy:addPushSubscription','legacy:removePushSubscriptionByEndpoint','legacy:removePushSubscriptionsByEndpoints']);
  snapshot.tables.app_commands=source.tables.app_commands.map(row=>({...row,
    // Retain nonce tombstones. A pre-restore credential request must conflict,
    // rather than exporting a weak-password verifier or executing it twice.
    ...(credentialCommands.has(row.command)?{payload_hash:'excluded-v1:'+sha256(JSON.stringify([row.command,row.request_id]))}:{}),
    result:JSON.stringify(ordinaryBackupValue(JSON.parse(row.result)))}));
  snapshot.tables.app_jobs=source.tables.app_jobs.map(row=>{
    const payload=ordinaryBackupValue(JSON.parse(row.payload));
    const push=row.namespace==='legacy'&&row.type==='push-delivery';
    if(push&&payload&&typeof payload==='object')delete payload.endpoint;
    return {...row,payload:JSON.stringify(payload),...(push?{payload_hash:'excluded-v1:'+sha256(row.id)}:{}),lease_token:null,lease_until:null,...(row.status==='leased'?{status:'unknown'}:{})};
  });
  snapshot.manifest.checksum=checksum(snapshot);
  return markSnapshotReadResult(validateAppSnapshot(snapshot));
}
export function collectOrdinaryAppSnapshot(tx:AppWriteTx):ValidatedAppSnapshot{return ordinaryAppSnapshot(collectAppSnapshot(tx));}
export function validateAppSnapshot(input: unknown): ValidatedAppSnapshot {
  const trusted=tables();
  const result=validateSnapshotPayload(input,{
    versions:getDomainVersions(), tables:trusted,
    primaryKeys:new Map([...trusted.keys()].map(name=>[name,(connection.prepare(`PRAGMA table_info(${name})`).all() as any[]).filter(column=>column.pk).sort((a,b)=>a.pk-b.pk).map(column=>column.name)])),
    migrations:connection.prepare('SELECT namespace,version,checksum FROM app_migrations').all(),
  }) as ValidatedAppSnapshot;
  validated.add(result);return result;
}
export function recoverAppRestore(): void {
  const journal = readJournal(); if (!journal) return;
  const marker = connection.prepare('SELECT checksum FROM app_restore_commits WHERE id=?').get(journal.id) as { checksum: string } | undefined;
  if (marker && marker.checksum !== journal.checksum) throw new Error('Restore marker checksum mismatch');
  recoverFiles(journal, !!marker);
}
/** Internal adapters bind retries to original input before reading mutable state. */
export function getCommittedRestore(identity:string): {restoredFiles:number}|undefined {
  const context=getAppCommandContext();if(!context)return;
  const prior=connection.prepare('SELECT actor_id,payload_hash,result FROM app_commands WHERE command=? AND request_id=?').get('core:snapshot:restore',context.requestId) as any;
  if(!prior)return;
  if(prior.actor_id!==context.actorId||prior.payload_hash!==identity)throw new AppStoreError('Restore request conflicts with committed command',409);
  return JSON.parse(prior.result).value;
}
export async function restoreAppSnapshot(snapshot: ValidatedAppSnapshot, options: RestoreOptions): Promise<{ restoredFiles: number }> {
  if (!validated.has(snapshot)) throw new Error('Restore requires a validated immutable snapshot');
  const checked = validateAppSnapshot(snapshot);
  if (!options?.maintenance) throw new Error('Restore requires the runtime maintenance owner');
  if(options.privateSettings!==undefined)applyRecoverySettings({},options.privateSettings);
  if(options.privateFiles!==undefined){const files=recoveryFileBytes(options.privateFiles);for(const bytes of Object.values(files))bytes?.fill(0);}
  const context = getAppCommandContext();
  const actorId = context?.actorId ?? 'system:restore', requestId = context?.requestId ?? randomUUID();
  const identity=options.identity??checked.manifest.checksum;
  if(!/^[a-f0-9]{64}$/.test(identity))throw new Error('Invalid internal restore identity');
  const prior=getCommittedRestore(identity);if(prior)return prior;
  let failure: unknown;
  const result = await options.maintenance(async () => {
    const id = randomUUID(); const paths = restorePaths(id);
    const privateFiles=options.privateFiles===undefined?{}:recoveryFileBytes(options.privateFiles);
    const keySelected=Object.hasOwn(privateFiles,'session_secret.key'),keyBytes=privateFiles['session_secret.key'];
    let hadKey=false;
    try {
      if (readJournal()) throw new Error('An unfinished restore must be recovered before another restore');
      validateAppSnapshot(checked); // Accepted owners may have changed schema while maintenance drained.
      let localSettings=readSettings();for(const key of publicSettingKeys)delete localSettings[key];
      if(options.privateSettings!==undefined)localSettings=applyRecoverySettings(localSettings,options.privateSettings);
      const settings=JSON.stringify({...localSettings,...checked.settings},null,2);
      if(Buffer.byteLength(settings)>settingsByteLimit)throw new Error('Local settings size limit exceeded');
      if(keySelected){const existing=readSigningKeyFile();hadKey=existing!==undefined;existing?.fill(0);}
      // Preserve a complete native safety copy before any file/SQL promotion.
      fs.mkdirSync(path.dirname(paths.safety), { recursive: true }); await sqliteBackupTo(paths.safety);
      const safetyFd = fs.openSync(paths.safety,'r+'); try { fs.fsyncSync(safetyFd); } finally { fs.closeSync(safetyFd); }
      // Publish recoverable ownership before writing any plaintext stage bytes.
      // Verify current files are ordinary before moving any root.
      readMedia();
      const journal = { id, checksum: checked.manifest.checksum, hadMedia: fs.existsSync(mediaRoot), hadSettings: fs.existsSync(settingsFile), media: checked.manifest.mediaManifest, settingsHash: sha256(settings),...(keySelected?{signingKey:{hadFile:hadKey,sha256:keyBytes===null?null:sha256(keyBytes),size:keyBytes===null?null:keyBytes.length}}:{}) };
      writeJournal(journal); options.onBoundary?.('journal-written');
      fs.mkdirSync(paths.stageMedia);
      for (const [name,data] of Object.entries(checked.media)) { const target = path.join(paths.stageMedia,...name.split('/')); fs.mkdirSync(path.dirname(target),{recursive:true}); durableWrite(target,Buffer.from(data,'base64')); }
      durableWrite(paths.stageSettings, settings);
      if(keySelected&&keyBytes!==null)durableWrite(paths.stageSigningKey,keyBytes);
      options.onBoundary?.('staging-complete');
      if (journal.hadMedia) fs.renameSync(mediaRoot,paths.oldMedia); options.onBoundary?.('media-old-renamed');
      fs.renameSync(paths.stageMedia,mediaRoot); options.onBoundary?.('media-promoted');
      if (journal.hadSettings) fs.renameSync(settingsFile,paths.oldSettings); options.onBoundary?.('settings-old-renamed');
      fs.renameSync(paths.stageSettings,settingsFile); options.onBoundary?.('settings-promoted');
      if(keySelected){if(hadKey)fs.renameSync(signingKeyFile,paths.oldSigningKey);options.onBoundary?.('signing-key-old-renamed');if(keyBytes!==null)fs.renameSync(paths.stageSigningKey,signingKeyFile);options.onBoundary?.('signing-key-promoted');}
      withAppWriteTransaction({ actorId, command: 'core:snapshot:restore', requestId, payloadHash: identity }, tx => {
        tx.exec('PRAGMA defer_foreign_keys=ON');
        const definitions = [...tables()];
        for (const [name] of [...definitions].reverse()) tx.run(`DELETE FROM ${name}`);
        for (const [name,columns] of definitions) for (const row of checked.tables[name]) tx.run(`INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...columns.map(column => row[column]));
        tx.legacy = JSON.parse(JSON.stringify(checked.legacy));
        reconcileBackupReferences(tx.legacy);
        reconcileMediaMetadata(tx);
        if(tx.get("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_sessions'"))tx.run('DELETE FROM auth_sessions');
        new AppJobStore().restorePolicy(tx,Date.now());
        tx.run('INSERT INTO app_restore_commits VALUES (?,?,?)',id,checked.manifest.checksum,new Date().toISOString());
        return { restoredFiles: Object.keys(checked.media).length };
      });
      options.onBoundary?.('sql-committed'); recoverAppRestore();
      return { restoredFiles: Object.keys(checked.media).length };
    } catch (error) {
      // A failed recovery propagates inside maintenance and keeps the runtime failed.
      // A fully rolled-back operation can resume owners, then report its original failure.
      recoverAppRestore(); cleanupStaging(id); failure = error; return { restoredFiles: 0 };
    }finally{keyBytes?.fill(0);}
  });
  if (failure) throw failure;
  return result;
}

/** Legacy JSON/ZIP input is usable only before domain/claim cutover. */
export function legacySnapshot(legacy: unknown, media?: Record<string,string>, settings?: Record<string,string>): ValidatedAppSnapshot {
  if (Object.values(getDomainVersions()).some(version => version !== 0) || connection.prepare('SELECT claim_id FROM app_reward_claims LIMIT 1').get()) throw new Error('A shared manifest is required after domain or completion-claim cutover');
  return withAppWriteTransaction({actorId:'system:snapshot',command:'core:snapshot:legacy-read',requestId:randomUUID(),payloadHash:sha256('legacy-read')},tx=>{
    const snapshot=collectAppSnapshot(tx);snapshot.legacy=legacy;
    snapshot.tables.app_meta=snapshot.tables.app_meta.filter(row=>!row.key.startsWith('media:')&&row.key!=='media_version');
    if (media) snapshot.media=media;
    if (settings) snapshot.settings=Object.fromEntries(publicSettingKeys.filter(key=>typeof settings[key]==='string').map(key=>[key,settings[key]]));
    snapshot.tables.app_commands=snapshot.tables.app_commands.filter(row=>['core:job-store:init','core:snapshot:init'].includes(row.command));
    snapshot.manifest.mediaManifest=mediaManifest(snapshot.media);snapshot.manifest.checksum=checksum(snapshot);
    return markSnapshotReadResult(validateAppSnapshot(snapshot));
  });
}
