import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

function absolute(value, name) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${name} requires an absolute path`);
  return path.resolve(value);
}
function overlaps(a, b) {
  const inside = (parent, child) => {
    const rel = path.relative(parent, child);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
  };
  return inside(a, b) || inside(b, a);
}
function resolvedDestination(target) {
  let existing = target;
  const missing = [];
  while (!fs.existsSync(existing)) {
    missing.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  return path.join(fs.realpathSync(existing), ...missing);
}
function inventory(root, directory = root) {
  const files = [];
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error('Symlink/reparse migration input is forbidden');
    if (stat.isDirectory()) files.push(...inventory(root, file));
    else if (stat.isFile()) files.push({ path: path.relative(root, file).split(path.sep).join('/'), bytes: stat.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
    else throw new Error('Unsupported migration input');
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
async function copySnapshot(source, destination, files) {
  for (const entry of files) {
    if (['family.db', 'family.db-wal', 'family.db-shm'].includes(entry.path)) continue;
    const target = path.join(destination, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, entry.path), target, fs.constants.COPYFILE_EXCL);
  }
  if (fs.existsSync(path.join(source, 'family.db'))) {
    // Even readonly SQLite opens can create WAL/SHM beside the database. Open
    // only a private physical copy so the legacy installation remains untouched.
    const working = fs.mkdtempSync(path.join(destination, '.sqlite-migration-'));
    try {
      for (const name of ['family.db', 'family.db-wal']) {
        if (fs.existsSync(path.join(source, name))) fs.copyFileSync(path.join(source, name), path.join(working, name), fs.constants.COPYFILE_EXCL);
      }
      const db = new Database(path.join(working, 'family.db'), { fileMustExist: true });
      try {
        if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Source SQLite integrity check failed');
        await db.backup(path.join(destination, 'family.db'));
      } finally { db.close(); }
    } finally { fs.rmSync(working, { recursive: true, force: true }); }
  }
  return inventory(destination);
}

/** Explicit copy only. The operator must stop the old application first. */
export async function migrateData(options) {
  const sourceInput = absolute(options.source, 'source');
  if (fs.lstatSync(sourceInput).isSymbolicLink()) throw new Error('Symlink/reparse source is forbidden');
  const source = fs.realpathSync(sourceInput);
  if (!fs.statSync(source).isDirectory()) throw new Error('Source must be a directory');
  const target = resolvedDestination(absolute(options.target, 'target'));
  const backup = options.backup ? resolvedDestination(absolute(options.backup, 'backup')) : undefined;
  if (overlaps(source, target) || (backup && (overlaps(source, backup) || overlaps(target, backup)))) throw new Error('Source/target/backup must not overlap');
  if (fs.existsSync(target)) throw new Error('Target already exists; refusing overwrite');
  const files = inventory(source);
  if (!files.some(file => ['family.db', 'db.json'].includes(file.path))) throw new Error('Source has no legacy database');
  const report = { format: 1, mode: 'dry-run', source, target, backup, files };
  if (!options.apply) return report;
  if (!backup) throw new Error('An external backup path is required for apply');
  if (!options.confirmOffline) throw new Error('Stop the application and confirm offline before apply');
  if (fs.existsSync(backup)) throw new Error('Backup path already exists; refusing overwrite');
  const staging = `${target}.migration-${crypto.randomUUID()}`;
  // Never remove source or backup on failure. Remove only our uniquely owned staging.
  fs.mkdirSync(backup, { recursive: true });
  try {
    const backupFiles = await copySnapshot(source, backup, files);
    fs.mkdirSync(staging, { recursive: true });
    const copiedFiles = await copySnapshot(backup, staging, backupFiles);
    if (JSON.stringify(copiedFiles) !== JSON.stringify(backupFiles)) throw new Error('Backup/target hash verification failed');
    if (JSON.stringify(inventory(source)) !== JSON.stringify(files)) throw new Error('Source changed during offline migration; retry after stopping writers');
    if (fs.existsSync(target)) throw new Error('Target appeared during migration; refusing overwrite');
    fs.renameSync(staging, target);
    return { ...report, mode: 'applied', files: copiedFiles };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    let reportPath;
    for (let index = 0; index < args.length; index++) {
      const flag = args[index];
      if (flag === '--apply') options.apply = true;
      else if (flag === '--confirm-offline') options.confirmOffline = true;
      else if (['--source', '--target', '--backup', '--report'].includes(flag)) {
        const value = args[++index];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
        if (flag === '--report') reportPath = absolute(value, 'report');
        else options[flag.slice(2)] = value;
      } else throw new Error(`Unknown option ${flag}`);
    }
    if (!reportPath) throw new Error('--report absolute path is required');
    if (fs.existsSync(reportPath)) throw new Error('Report already exists; refusing overwrite');
    for (const root of [options.source, options.target, options.backup].filter(Boolean)) {
      if (overlaps(absolute(root, 'root'), resolvedDestination(reportPath))) throw new Error('Report must be outside source/target/backup');
    }
    // Reserve report before mutation so an unwritable report cannot go unnoticed.
    const reportFd = fs.openSync(reportPath, 'wx', 0o600);
    try {
      const report = await migrateData(options);
      fs.writeFileSync(reportFd, JSON.stringify(report, null, 2) + '\n');
      console.log(`${report.mode}: ${report.files.length} files; report saved`);
    } finally { fs.closeSync(reportFd); }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
