// Shared payload validation has no SQLite/storage bootstrap dependency.
import { canonicalMediaUrl, parseMediaMetadata } from './mediaPolicy.js';
import { LEGACY_KEYS } from './legacySchema.js';
import { snapshotLimits, publicSettingKeys, validMediaPath, validBackupFilename, sha256 } from './snapshotFiles.js';
export interface SnapshotManifest { credentials?: 'excluded-v1'; schemaVersion: number; domains: Record<string,number>; legacyVersion: number; mediaManifest: { path: string; size: number; sha256: string }[]; checksum: string; createdAt: string }
export interface AppSnapshot { manifest: SnapshotManifest; legacy: any; tables: Record<string, any[]>; settings: Record<string,string>; media: Record<string,string> }
export type ValidatedAppSnapshot = AppSnapshot & { readonly __validated: unique symbol };
export interface SnapshotValidationContext {
  versions:Record<string,number>;
  tables:Map<string,readonly string[]>;
  primaryKeys:Map<string,readonly string[]>;
  migrations:any[];
  domainValidators?:ReadonlyMap<string,(snapshot:AppSnapshot)=>void>;
}
export const snapshotCoreTables = new Map<string, readonly string[]>([
  ['app_meta',['key','value']], ['app_commands',['command','request_id','actor_id','payload_hash','result','committed_at']],
  ['app_migrations',['namespace','version','checksum','applied_at']],
  ['app_reward_claims',['claim_id','payload_hash','grant_entry_id','reverse_entry_id']],
  ['app_jobs',['id','namespace','type','unique_key','payload','payload_hash','kind','status','available_at','lease_token','lease_until','attempts','max_attempts','error_code','created_at','completed_at']],
  ['server_metrics',['t','cpu','ram','temp','ssd','disk']],
]);
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
export function checksum(snapshot: AppSnapshot): string {
  const { checksum: _checksum, ...manifest } = snapshot.manifest;
  return sha256(JSON.stringify(canonical({ ...snapshot, manifest })));
}
export function mediaManifest(media: Record<string,string>) {
  return Object.entries(media).map(([name, data]) => ({ path: name, size: Buffer.from(data,'base64').length, sha256: sha256(Buffer.from(data,'base64')) })).sort((a,b) => a.path.localeCompare(b.path));
}
function freeze(value: any): any { if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; }
export function validateSnapshotPayload(input: unknown, context:SnapshotValidationContext): AppSnapshot {
  const encoded = JSON.stringify(canonical(input));
  if (Buffer.byteLength(encoded) > snapshotLimits.bytes) throw new Error('Snapshot exceeds 256MiB limit');
  const s = JSON.parse(encoded) as AppSnapshot;
  if (JSON.stringify(Object.keys(s).sort()) !== JSON.stringify(['manifest','legacy','tables','settings','media'].sort())) throw new Error('Invalid snapshot fields');
  if(s.manifest?.credentials!==undefined&&s.manifest.credentials!=='excluded-v1')throw new Error('Unsupported snapshot credential policy');
  if (!s.manifest || s.manifest.schemaVersion !== 1 || s.manifest.legacyVersion !== 1 || !s.manifest.domains || !/^\d{4}-/.test(s.manifest.createdAt) || !Number.isFinite(Date.parse(s.manifest.createdAt))) throw new Error('Unsupported snapshot manifest');
  const versions = context.versions;
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
  const trusted = context.tables;
  if (!s.tables || JSON.stringify(Object.keys(s.tables).sort()) !== JSON.stringify([...trusted.keys()].sort())) throw new Error('Missing or untrusted snapshot tables');
  for (const [name,columns] of trusted) {
    const rows = s.tables[name];
    if (!Array.isArray(rows) || rows.some(row => !row || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...columns].sort()) || Object.values(row).some(value => value !== null && typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))))) throw new Error('Invalid snapshot table rows');
    rowCount += rows.length;
  }
  for(const row of s.tables.app_meta)if(row.key.startsWith('media:')){canonicalMediaUrl(row.key.slice(6));parseMediaMetadata(row.value);}
  const mediaVersion=s.tables.app_meta.find(row=>row.key==='media_version');if(mediaVersion&&mediaVersion.value!=='1')throw new Error('Unsupported media metadata version');
  // Validate native primary keys, persisted schema versions and cross-table references
  // before staging files, even if a caller recomputed a valid content checksum.
  for (const [name] of trusted) {
    const primary = context.primaryKeys.get(name) ?? [];
    if (primary.length && new Set(s.tables[name].map(row => JSON.stringify(primary.map(key => row[key])))).size !== s.tables[name].length) throw new Error('Duplicate snapshot table primary key');
  }
  for (const [key,value] of [['schema_version','1'],['job_store_version','1'],['snapshot_schema_version','1']]) if (!s.tables.app_meta.some(row => row.key === key && row.value === value)) throw new Error('Unsupported snapshot core version');
  const migrations = (rows: any[]) => rows.map(row => [row.namespace,row.version,row.checksum]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (JSON.stringify(migrations(s.tables.app_migrations)) !== JSON.stringify(migrations(context.migrations))) throw new Error('Snapshot migration records disagree with supported versions');
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
  for(const validate of context.domainValidators?.values()??[])validate(s);
  return freeze(s);
}
