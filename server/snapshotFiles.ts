import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { appConfig } from './config.js';
import type { FamilyOrganizerDB } from '../src/types.js';

export const snapshotLimits = { bytes: 256 * 1024 * 1024, files: 10_000, rows: 100_000 };
export const settingsByteLimit = 1024 * 1024;
// 10k entries, each with at most512 UTF-16 path units plus hashes/metadata,
// fit below32MiB even when every path unit needs3 UTF-8 bytes.
export const journalByteLimit = 32 * 1024 * 1024;
export function validBackupFilename(name: unknown): asserts name is string {
  if(typeof name!=='string'||name.length>255||!/^backup_[a-z0-9_.-]+\.json$/i.test(name))throw new Error('Invalid backup filename');
}
/** Backup references describe installation-local ordinary files, never uploaded paths. */
export function reconcileBackupReferences(legacy:FamilyOrganizerDB):void {
  const directory=path.join(appConfig.dataRoot,'backups');
  if(!fs.existsSync(directory)){legacy.backups=[];return;}
  const root=fs.lstatSync(directory);if(root.isSymbolicLink()||!root.isDirectory())throw new Error('Backup directory must be ordinary');
  const files=new Map<string,fs.Stats>();
  for(const name of fs.readdirSync(directory)){
    try{validBackupFilename(name);}catch{continue;}
    const stat=fs.lstatSync(path.join(directory,name));
    if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=snapshotLimits.bytes)files.set(name,stat);
  }
  legacy.backups=legacy.backups.filter(backup=>files.has(backup.filename));
  const listed=new Set(legacy.backups.map(backup=>backup.filename)),ids=new Set(legacy.backups.map(backup=>backup.id));
  for(const [filename,stat] of files){
    if(listed.has(filename))continue;
    const base='backup_disk_'+sha256(filename).slice(0,24);let id=base,index=0;while(ids.has(id))id=base+'_'+(++index);ids.add(id);
    legacy.backups.push({id,filename,createdAt:stat.mtime.toISOString(),sizeKb:Math.ceil(stat.size/1024),type:filename.includes('_auto_')?'auto':'manual'});
  }
  legacy.backups.sort((a,b)=>String(b.createdAt??'').localeCompare(String(a.createdAt??'')));
}
export const publicSettingKeys = ['homelabLinks','rewardsEnabled','rewardApprovalThreshold','telegramBackupEnabled','telegramWeeklyDigestEnabled','telegramBackupLastSent','telegramWeeklyDigestLastSent'];
export const mediaRoot = path.join(appConfig.dataRoot, 'uploads');
export const settingsFile = path.join(appConfig.configRoot, 'app_settings.json');
export const journalFile = path.join(appConfig.dataRoot, 'restore-journal.json');
export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export function validMediaPath(name: string): void {
  if (!name || name.length > 512 || name.includes('\\') || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..' || /[:<>"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Invalid snapshot media path');
}
function ordinaryFile(file: string): void {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Snapshot requires ordinary files without links');
}
export function readSettings(): Record<string,string> {
  if (!fs.existsSync(settingsFile)) return {};
  ordinaryFile(settingsFile);
  if (fs.statSync(settingsFile).size > settingsByteLimit) throw new Error('Local settings size limit exceeded');
  const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some(value => typeof value !== 'string')) throw new Error('Invalid local settings');
  return parsed;
}
export function readMedia(root = mediaRoot): Record<string,string> {
  const media: Record<string,string> = {}; let bytes = 0;
  const aliases = new Set<string>();
  function walk(directory: string, prefix = '') {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Snapshot media directories cannot be links');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const name = prefix + entry.name; validMediaPath(name);
      const alias = name.normalize('NFC').toLowerCase();
      if (aliases.has(alias)) throw new Error('Snapshot media path alias'); aliases.add(alias);
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Snapshot media cannot contain links');
      if (entry.isDirectory()) walk(file, name + '/');
      else {
        ordinaryFile(file);
        if (fs.statSync(file).size > snapshotLimits.bytes - bytes) throw new Error('Snapshot media limit exceeded');
        const data = fs.readFileSync(file); bytes += data.length;
        if (bytes > snapshotLimits.bytes || Object.keys(media).length >= snapshotLimits.files) throw new Error('Snapshot media limit exceeded');
        media[name] = data.toString('base64');
      }
    }
  }
  if (fs.existsSync(root)) walk(root);
  return media;
}
export function durableWrite(file: string, bytes: string | Buffer): void {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
export interface RestoreJournal {
  id: string; checksum: string; hadMedia: boolean; hadSettings: boolean;
  media: { path: string; sha256: string; size: number }[]; settingsHash: string;
}
export function restorePaths(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error('Invalid restore journal identity');
  const base = `.restore-${id}`;
  return { stageMedia: path.join(appConfig.dataRoot, base + '-media'), oldMedia: path.join(appConfig.dataRoot, base + '-old-media'), stageSettings: path.join(appConfig.configRoot, base + '-settings'), oldSettings: path.join(appConfig.configRoot, base + '-old-settings'), safety: path.join(appConfig.dataRoot, 'backups', `pre-restore_${id}.sqlite`) };
}
export function writeJournal(journal: RestoreJournal): void {
  if (fs.existsSync(journalFile)) throw new Error('An unfinished restore already exists');
  const bytes=JSON.stringify({...journal,journalHash:sha256(JSON.stringify(journal))});
  if(Buffer.byteLength(bytes)>journalByteLimit)throw new Error('Invalid restore journal size');
  const tmp = journalFile + '.' + journal.id;
  durableWrite(tmp, bytes); fs.renameSync(tmp, journalFile);
}
export function readJournal(): RestoreJournal | undefined {
  if (!fs.existsSync(journalFile)) return;
  ordinaryFile(journalFile);
  if (fs.statSync(journalFile).size > journalByteLimit) throw new Error('Invalid restore journal size');
  const value = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['id','checksum','hadMedia','hadSettings','media','settingsHash','journalHash'].sort()) || typeof value.hadMedia !== 'boolean' || typeof value.hadSettings !== 'boolean' || !/^[a-f0-9]{64}$/.test(value.checksum) || !/^[a-f0-9]{64}$/.test(value.settingsHash) || !Array.isArray(value.media) || value.media.length > snapshotLimits.files) throw new Error('Invalid restore journal');
  const {journalHash,...content}=value;
  if (typeof journalHash !== 'string' || sha256(JSON.stringify(content)) !== journalHash) throw new Error('Corrupt restore journal integrity');
  restorePaths(value.id);
  for (const file of value.media) { validMediaPath(file.path); if (!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error('Invalid restore journal media'); }
  return value;
}
function removeOwned(file: string): void {
  if (!fs.existsSync(file)) return;
  const stat = fs.lstatSync(file); if (stat.isSymbolicLink()) throw new Error('Restore cleanup refuses links');
  if (stat.isDirectory()) readMedia(file); else ordinaryFile(file);
  fs.rmSync(file, { recursive: stat.isDirectory() });
}
/** Called only before readiness or while the same runtime's owners are drained. */
export function recoverFiles(journal: RestoreJournal, committed: boolean): void {
  const paths = restorePaths(journal.id);
  if (committed) {
    const media = readMedia();
    const actual = Object.entries(media).map(([name, data]) => ({ path: name, size: Buffer.from(data,'base64').length, sha256: sha256(Buffer.from(data,'base64')) })).sort((a,b) => a.path.localeCompare(b.path));
    if (JSON.stringify(actual.map(file => [file.path,file.size,file.sha256])) !== JSON.stringify([...journal.media].sort((a,b) => a.path.localeCompare(b.path)).map(file => [file.path,file.size,file.sha256])) || !fs.existsSync(settingsFile) || sha256(fs.readFileSync(settingsFile)) !== journal.settingsHash) throw new Error('Committed restore files failed integrity verification');
  } else {
    if (fs.existsSync(paths.oldMedia)) { removeOwned(mediaRoot); fs.renameSync(paths.oldMedia, mediaRoot); }
    else if (!journal.hadMedia && !fs.existsSync(paths.stageMedia)) removeOwned(mediaRoot);
    if (fs.existsSync(paths.oldSettings)) { removeOwned(settingsFile); fs.renameSync(paths.oldSettings, settingsFile); }
    else if (!journal.hadSettings && !fs.existsSync(paths.stageSettings)) removeOwned(settingsFile);
  }
  for (const file of [paths.stageMedia, paths.oldMedia, paths.stageSettings, paths.oldSettings]) removeOwned(file);
  fs.unlinkSync(journalFile);
}

/** Remove only this operation's unpublished staging, never another journal/root. */
export function cleanupStaging(id: string): void {
  const paths=restorePaths(id);for(const file of [paths.stageMedia,paths.stageSettings])removeOwned(file);
}
