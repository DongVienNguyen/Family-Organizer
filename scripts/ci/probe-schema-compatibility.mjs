import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function probeSchemaCompatibility(packageRoot, fixtureRoot, foreignCwd) {
  const Database = createRequire(path.join(packageRoot, 'package.json'))('better-sqlite3');
  const parent = fs.mkdtempSync(path.join(fixtureRoot, 'incompatible schema dữ liệu '));
  const cases = [
    ['future', "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','999');"],
    ['missing-version', "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('synthetic_setting','preserve-me');"],
    ['foreign', "CREATE TABLE synthetic_foreign(id TEXT PRIMARY KEY,value TEXT);INSERT INTO synthetic_foreign VALUES('synthetic','preserve-me');"],
    ['sqliteX', "CREATE TABLE sqliteX(value TEXT);INSERT INTO sqliteX VALUES('preserve-me');"],
    ['sqliteData', "CREATE TABLE sqliteData(value TEXT);INSERT INTO sqliteData VALUES('preserve-me');"],
    ['malformed-metadata', 'CREATE TABLE app_meta(key TEXT PRIMARY KEY);'],
    ['malformed-owned-table', "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','1');CREATE TABLE tasks(id TEXT PRIMARY KEY,payload TEXT);INSERT INTO tasks VALUES('synthetic-task','preserve-me');"],
  ];
  const reports = [];
  let active;
  function snapshot(file) {
    const sql = new Database(file, { readonly: true });
    try {
      const schema = sql.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name").all();
      const rows = Object.fromEntries(schema.filter(item => item.type === 'table').map(item => [item.name, sql.prepare('SELECT * FROM "' + item.name.replaceAll('"', '""') + '"').all()]));
      return { sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'), schema, rows, journal: sql.pragma('journal_mode', { simple: true }) };
    } finally { sql.close(); }
  }
  try {
    for (const [name, ddl] of cases) {
      const root = path.join(parent, name); fs.mkdirSync(root);
      const file = path.join(root, 'family.db');
      const seed = new Database(file);
      try { seed.exec(ddl); } finally { seed.close(); }
      const before = snapshot(file);
      const env = {};
      for (const key of ['PATH', 'SystemRoot', 'windir', 'TMP', 'TEMP', 'HOME', 'USERPROFILE']) if (process.env[key]) env[key] = process.env[key];
      Object.assign(env, { NODE_ENV: 'production', DATA_DIR: root, CONFIG_DIR: root, LOG_DIR: path.join(root, 'logs'), PORT: '0', FO_NETWORK_ATTEMPTS: path.join(root, 'external-attempts.jsonl') });
      active = spawn(process.execPath, ['--require', fileURLToPath(new URL('./block-network.cjs', import.meta.url)), path.join(packageRoot, 'dist/server.cjs')], { cwd: foreignCwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      const child = active;
      let output = '', timedOut = false, overflow = false;
      const capture = chunk => {
        if (Buffer.byteLength(output) + chunk.length > 64 * 1024) { overflow = true; child.kill('SIGKILL'); return; }
        output += chunk.toString('utf8');
      };
      child.stdout.on('data', capture); child.stderr.on('data', capture);
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 15000);
      let result;
      try { result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); }); }
      finally { clearTimeout(timer); }
      active = undefined;
      assert.equal(timedOut, false, 'Incompatible startup did not fail within its deadline');
      assert.equal(overflow, false, 'Incompatible startup exceeded its log budget');
      assert.equal(result.signal, null); assert.equal(result.code, 1, output);
      assert.match(output, /Unsupported legacy schema|no such column: (value|seq)/);
      assert.doesNotMatch(output, /Server is running/);
      assert.deepEqual(snapshot(file), before, 'Rejected compiled startup changed database bytes/schema/rows/journal');
      assert.equal(fs.existsSync(file + '-wal'), false); assert.equal(fs.existsSync(file + '-shm'), false);
      assert.equal(fs.existsSync(env.FO_NETWORK_ATTEMPTS) ? fs.readFileSync(env.FO_NETWORK_ATTEMPTS, 'utf8') : '', '');
      fs.renameSync(file, file + '.closed'); fs.renameSync(file + '.closed', file);
      reports.push({ name, exitCode: result.code, bytesSchemaRowsJournalPreserved: true, databaseSha256: before.sha256, journal: before.journal, nativeHandlesReleased: true, networkAttempts: [] });
    }
    return reports;
  } finally {
    if (active?.pid && active.exitCode === null && active.signalCode === null) {
      const child = active;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Compatibility probe child cleanup deadline')), 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGKILL');
      });
    }
    fs.rmSync(parent, { recursive: true });
  }
}
