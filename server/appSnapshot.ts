import type { AppWriteTx } from './appStore.js';
import { withAppWriteTransaction, AppStoreError, markSnapshotReadResult } from './appStore.js';
import { getAppCommandContext } from './commandContext.js';
import { sqliteConnection, sqliteBackupTo, LEGACY_KEYS } from './sqlite.js';
import { getDomainVersions } from './appMigrations.js';
import { AppJobStore } from './jobStore.js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { snapshotLimits, publicSettingKeys, mediaRoot, settingsFile, readSettings, readMedia, validMediaPath, validBackupFilename, reconcileBackupReferences, sha256, durableWrite, restorePaths, writeJournal, readJournal, recoverFiles, cleanupStaging } from './snapshotFiles.js';

interface SnapshotManifest { schemaVersion: number; domains: Record<string,number>; legacyVersion: number; mediaManifest: { path: string; size: number; sha256: string }[]; checksum: string; createdAt: string }
export interface AppSnapshot { manifest: SnapshotManifest; legacy: any; tables: Record<string, any[]>; settings: Record<string,string>; media: Record<string,string> }
export type ValidatedAppSnapshot = AppSnapshot & { readonly __validated: unique symbol };
export interface RestoreOptions { maintenance: <T>(work: () => Promise<T>) => Promise<T>; onBoundary?: (phase: string) => void; identity?: string }
const connection = sqliteConnection();
const core = new Map<string, readonly string[]>([
  ['app_meta',['key','value']], ['app_commands',['command','request_id','actor_id','payload_hash','result','committed_at']],
  ['app_migrations',['namespace','version','checksum','applied_at']],
  ['app_reward_claims',['claim_id','payload_hash','grant_entry_id','reverse_entry_id']],
  ['app_jobs',['id','namespace','type','unique_key','payload','payload_hash','kind','status','available_at','lease_token','lease_until','attempts','max_attempts','error_code','created_at','completed_at']],
  ['server_metrics',['t','cpu','ram','temp','ssd','disk']],
]);
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
function canonical(input: unknown): any {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (Array.isArray(input)) return input.map(canonical);
  if (input && typeof input === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(input))) return Object.fromEntries(Object.keys(input).sort().map(key => {
    if (['__proto__','constructor','prototype'].includes(key)) throw new Error('Unsafe snapshot object key');
    return [key, canonical((input as any)[key])];
  }));
  throw new Error('Snapshot requires finite plain JSON');
}
function checksum(snapshot: AppSnapshot): string {
  const { checksum: _checksum, ...manifest } = snapshot.manifest;
  return sha256(JSON.stringify(canonical({ ...snapshot, manifest })));
}
function mediaManifest(media: Record<string,string>) {
  return Object.entries(media).map(([name, data]) => ({ path: name, size: Buffer.from(data,'base64').length, sha256: sha256(Buffer.from(data,'base64')) })).sort((a,b) => a.path.localeCompare(b.path));
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
function freeze(value: any): any { if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; }
export function validateAppSnapshot(input: unknown): ValidatedAppSnapshot {
  const encoded = JSON.stringify(canonical(input));
  if (Buffer.byteLength(encoded) > snapshotLimits.bytes) throw new Error('Snapshot exceeds 256MiB limit');
  const s = JSON.parse(encoded) as AppSnapshot;
  if (JSON.stringify(Object.keys(s).sort()) !== JSON.stringify(['manifest','legacy','tables','settings','media'].sort())) throw new Error('Invalid snapshot fields');
  if (!s.manifest || s.manifest.schemaVersion !== 1 || s.manifest.legacyVersion !== 1 || !s.manifest.domains || !/^\d{4}-/.test(s.manifest.createdAt) || !Number.isFinite(Date.parse(s.manifest.createdAt))) throw new Error('Unsupported snapshot manifest');
  const versions = getDomainVersions();
  if (JSON.stringify(canonical(s.manifest.domains)) !== JSON.stringify(canonical(versions))) throw new Error('Missing or unsupported snapshot namespace version');
  if (!s.legacy || JSON.stringify(Object.keys(s.legacy).sort()) !== JSON.stringify([...LEGACY_KEYS].sort())) throw new Error('Invalid legacy snapshot collections');
  let rowCount = 0;
  for (const key of LEGACY_KEYS) {
    if (['mealPlan','hiddenBuiltinCategories'].includes(key)) continue;
    const rows = s.legacy[key];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Invalid legacy snapshot rows');
    rowCount += rows.length;
  }
  if (!s.legacy.users.some((user: any) => user.role === 'admin')) throw new Error('Snapshot requires an administrator');
  for(const backup of s.legacy.backups)validBackupFilename(backup.filename);
  const trusted = tables();
  if (!s.tables || JSON.stringify(Object.keys(s.tables).sort()) !== JSON.stringify([...trusted.keys()].sort())) throw new Error('Missing or untrusted snapshot tables');
  for (const [name,columns] of trusted) {
    const rows = s.tables[name];
    if (!Array.isArray(rows) || rows.some(row => !row || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...columns].sort()) || Object.values(row).some(value => value !== null && typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))))) throw new Error('Invalid snapshot table rows');
    rowCount += rows.length;
  }
  // Validate native primary keys, persisted schema versions and cross-table references
  // before staging files, even if a caller recomputed a valid content checksum.
  for (const [name] of trusted) {
    const primary = (connection.prepare(`PRAGMA table_info(${name})`).all() as any[]).filter(column => column.pk).sort((a,b) => a.pk - b.pk).map(column => column.name);
    if (primary.length && new Set(s.tables[name].map(row => JSON.stringify(primary.map(key => row[key])))).size !== s.tables[name].length) throw new Error('Duplicate snapshot table primary key');
  }
  for (const [key,value] of [['schema_version','1'],['job_store_version','1'],['snapshot_schema_version','1']]) if (!s.tables.app_meta.some(row => row.key === key && row.value === value)) throw new Error('Unsupported snapshot core version');
  const migrations = (rows: any[]) => rows.map(row => [row.namespace,row.version,row.checksum]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (JSON.stringify(migrations(s.tables.app_migrations)) !== JSON.stringify(migrations(connection.prepare('SELECT namespace,version,checksum FROM app_migrations').all()))) throw new Error('Snapshot migration records disagree with supported versions');
  const rewards = new Map<string,any>(s.legacy.rewardLedger.map((row: any) => [row.id,row]));
  for (const claim of s.tables.app_reward_claims) if (!rewards.has(claim.grant_entry_id) || (claim.reverse_entry_id !== null && !rewards.has(claim.reverse_entry_id))) throw new Error('Snapshot completion claim has no canonical reward');
  for (const command of s.tables.app_commands) {
    if (['command','request_id','actor_id','payload_hash'].some(key => typeof command[key] !== 'string' || !command[key] || command[key].length > 256)) throw new Error('Invalid snapshot command metadata');
    canonical(JSON.parse(command.result));
  }
  for (const job of s.tables.app_jobs) {
    if (!['command','effect','schedule'].includes(job.kind) || !['pending','leased','completed','failed','unknown','dropped'].includes(job.status) || !Number.isSafeInteger(job.attempts) || job.attempts < 0 || !Number.isSafeInteger(job.max_attempts) || job.max_attempts < 1 || job.max_attempts > 20 || !Number.isSafeInteger(job.available_at) || job.available_at < 0) throw new Error('Invalid snapshot job state');
    canonical(JSON.parse(job.payload));
  }
  if (rowCount > snapshotLimits.rows) throw new Error('Snapshot row limit exceeded');
  if (!s.settings || Object.entries(s.settings).some(([key,value]) => !publicSettingKeys.includes(key) || typeof value !== 'string' || value.length > 10000)) throw new Error('Snapshot settings contain unsupported or secret fields');
  if (!s.media || Array.isArray(s.media) || Object.keys(s.media).length > snapshotLimits.files) throw new Error('Invalid snapshot media');
  const aliases = new Set<string>();
  const components = new Map<string,string>(); const files = new Set(Object.keys(s.media).map(name => name.normalize('NFC').toLowerCase()));
  for (const [name,data] of Object.entries(s.media)) {
    validMediaPath(name); const alias = name.normalize('NFC').toLowerCase();
    const parts = name.split('/');
    for (let index = 1; index <= parts.length; index++) {
      const component = parts.slice(0,index).join('/'); const folded = component.normalize('NFC').toLowerCase();
      if ((components.has(folded) && components.get(folded) !== component) || (index < parts.length && files.has(folded))) throw new Error('Snapshot media directory alias or file parent');
      components.set(folded,component);
    }
    if (aliases.has(alias) || typeof data !== 'string' || Buffer.from(data,'base64').toString('base64') !== data) throw new Error('Invalid snapshot media alias/encoding'); aliases.add(alias);
  }
  if (JSON.stringify(canonical(s.manifest.mediaManifest)) !== JSON.stringify(canonical(mediaManifest(s.media)))) throw new Error('Snapshot media checksum mismatch');
  if (!/^[a-f0-9]{64}$/.test(s.manifest.checksum) || checksum(s) !== s.manifest.checksum) throw new Error('Snapshot checksum mismatch');
  const result = freeze(s) as ValidatedAppSnapshot; validated.add(result); return result;
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
  const context = getAppCommandContext();
  const actorId = context?.actorId ?? 'system:restore', requestId = context?.requestId ?? randomUUID();
  const identity=options.identity??checked.manifest.checksum;
  if(!/^[a-f0-9]{64}$/.test(identity))throw new Error('Invalid internal restore identity');
  const prior=getCommittedRestore(identity);if(prior)return prior;
  let failure: unknown;
  const result = await options.maintenance(async () => {
    const id = randomUUID(); const paths = restorePaths(id);
    try {
      if (readJournal()) throw new Error('An unfinished restore must be recovered before another restore');
      validateAppSnapshot(checked); // Accepted owners may have changed schema while maintenance drained.
      // Preserve a complete native safety copy before any file/SQL promotion.
      fs.mkdirSync(path.dirname(paths.safety), { recursive: true }); await sqliteBackupTo(paths.safety);
      const safetyFd = fs.openSync(paths.safety,'r+'); try { fs.fsyncSync(safetyFd); } finally { fs.closeSync(safetyFd); }
      fs.mkdirSync(paths.stageMedia);
      for (const [name,data] of Object.entries(checked.media)) { const target = path.join(paths.stageMedia,...name.split('/')); fs.mkdirSync(path.dirname(target),{recursive:true}); durableWrite(target,Buffer.from(data,'base64')); }
      const localSettings = readSettings();for(const key of publicSettingKeys)delete localSettings[key];
      const settings = JSON.stringify({ ...localSettings, ...checked.settings },null,2);
      durableWrite(paths.stageSettings, settings);
      options.onBoundary?.('staging-complete');
      // Verify current files are ordinary before moving any root.
      readMedia();
      const journal = { id, checksum: checked.manifest.checksum, hadMedia: fs.existsSync(mediaRoot), hadSettings: fs.existsSync(settingsFile), media: checked.manifest.mediaManifest, settingsHash: sha256(settings) };
      writeJournal(journal); options.onBoundary?.('journal-written');
      if (journal.hadMedia) fs.renameSync(mediaRoot,paths.oldMedia); options.onBoundary?.('media-old-renamed');
      fs.renameSync(paths.stageMedia,mediaRoot); options.onBoundary?.('media-promoted');
      if (journal.hadSettings) fs.renameSync(settingsFile,paths.oldSettings); options.onBoundary?.('settings-old-renamed');
      fs.renameSync(paths.stageSettings,settingsFile); options.onBoundary?.('settings-promoted');
      withAppWriteTransaction({ actorId, command: 'core:snapshot:restore', requestId, payloadHash: identity }, tx => {
        tx.exec('PRAGMA defer_foreign_keys=ON');
        const definitions = [...tables()];
        for (const [name] of [...definitions].reverse()) tx.run(`DELETE FROM ${name}`);
        for (const [name,columns] of definitions) for (const row of checked.tables[name]) tx.run(`INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...columns.map(column => row[column]));
        tx.legacy = JSON.parse(JSON.stringify(checked.legacy));
        reconcileBackupReferences(tx.legacy);
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
    }
  });
  if (failure) throw failure;
  return result;
}

/** Legacy JSON/ZIP input is usable only before domain/claim cutover. */
export function legacySnapshot(legacy: unknown, media?: Record<string,string>, settings?: Record<string,string>): ValidatedAppSnapshot {
  if (Object.values(getDomainVersions()).some(version => version !== 0) || connection.prepare('SELECT claim_id FROM app_reward_claims LIMIT 1').get()) throw new Error('A shared manifest is required after domain or completion-claim cutover');
  return withAppWriteTransaction({actorId:'system:snapshot',command:'core:snapshot:legacy-read',requestId:randomUUID(),payloadHash:sha256('legacy-read')},tx=>{
    const snapshot=collectAppSnapshot(tx);snapshot.legacy=legacy;
    if (media) snapshot.media=media;
    if (settings) snapshot.settings=Object.fromEntries(publicSettingKeys.filter(key=>typeof settings[key]==='string').map(key=>[key,settings[key]]));
    snapshot.tables.app_commands=snapshot.tables.app_commands.filter(row=>['core:job-store:init','core:snapshot:init'].includes(row.command));
    snapshot.manifest.mediaManifest=mediaManifest(snapshot.media);snapshot.manifest.checksum=checksum(snapshot);
    return markSnapshotReadResult(validateAppSnapshot(snapshot));
  });
}
