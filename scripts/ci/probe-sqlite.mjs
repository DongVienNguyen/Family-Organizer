import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';

const require = createRequire(import.meta.url);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fo native SQLite '));
const database = new Database(path.join(directory, 'synthetic.db'));
let snapshot;
try {
  assert.equal(process.arch, 'x64');
  database.pragma('journal_mode = WAL');
  database.exec('CREATE TABLE fixture (id TEXT PRIMARY KEY, label TEXT NOT NULL)');
  database.prepare('INSERT INTO fixture VALUES (?, ?)').run('synthetic', 'Gia đình');
  assert.throws(database.transaction(() => {
    database.prepare('UPDATE fixture SET label = ?').run('rollback');
    throw new Error('synthetic rollback');
  }), /synthetic rollback/);
  assert.equal(database.prepare('SELECT label FROM fixture').get().label, 'Gia đình');
  const destination = path.join(directory, 'backup.db');
  await database.backup(destination);
  snapshot = new Database(destination, { readonly: true });
  assert.equal(snapshot.prepare('SELECT label FROM fixture').get().label, 'Gia đình');
  assert.equal(snapshot.pragma('integrity_check', { simple: true }), 'ok');
  const loadedBinaries = Object.keys(require.cache).filter(file => file.endsWith('.node') && file.includes('better-sqlite3'));
  assert.equal(loadedBinaries.length, 1, 'Expected exactly one loaded SQLite native binary');
  const binary = loadedBinaries[0];
  const evidence = {
    nodeVersion: process.version, nodeABI: process.versions.modules,
    platform: process.platform, architecture: process.arch,
    addonVersion: require('better-sqlite3/package.json').version,
    bindingApi: 'N-API', nodeNapi: process.versions.napi,
    binaryPath: path.relative(path.dirname(require.resolve('better-sqlite3/package.json')), binary).split(path.sep).join('/'),
    sqliteVersion: database.prepare('SELECT sqlite_version() AS version').get().version,
    binarySha256: crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),
    checks: ['native-load', 'write-read', 'transaction-rollback', 'WAL-backup', 'integrity-check', 'file-cleanup'],
  };
  snapshot.close();
  snapshot = undefined;
  database.close();
  fs.rmSync(directory, { recursive: true });
  assert.equal(fs.existsSync(directory), false);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/native.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (snapshot?.open) snapshot.close();
  if (database.open) database.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
