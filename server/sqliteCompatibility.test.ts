import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

async function fixture(run: (root: string, file: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'schema compatibility dữ liệu '));
  vi.stubEnv('DATA_DIR', root);
  vi.stubEnv('CONFIG_DIR', root);
  vi.stubEnv('LOG_DIR', path.join(root, 'logs'));
  vi.resetModules();
  try { await run(root, path.join(root, 'family.db')); }
  finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true }); }
}
function inspect(file: string) {
  const sql = new Database(file, { readonly: true });
  try {
    const schema = sql.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all() as { type: string; name: string }[];
    const rows = Object.fromEntries(schema.filter(item => item.type === 'table').map(item => [item.name, sql.prepare('SELECT * FROM "' + item.name.replaceAll('"', '""') + '"').all()]));
    return { journal: sql.pragma('journal_mode', { simple: true }), schema, rows, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
  } finally { sql.close(); }
}
const incompatible: [string, string][] = [
  ['future version', "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','999');"],
  ['older unsupported version', "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','0');"],
  ['empty metadata version', "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','');"],
  ['missing version with records', "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('synthetic_setting','preserve-me');"],
  ['missing version without records', 'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);'],
  ['foreign database', "CREATE TABLE synthetic_foreign(id TEXT PRIMARY KEY,value TEXT);INSERT INTO synthetic_foreign VALUES('synthetic','preserve-me');"],
  ['malformed metadata', "CREATE TABLE app_meta(key TEXT PRIMARY KEY);INSERT INTO app_meta VALUES('schema_version');"],
  ['malformed owned table on supported version', "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','1');CREATE TABLE tasks(id TEXT PRIMARY KEY,payload TEXT);INSERT INTO tasks VALUES('synthetic-task','preserve-me');"],
];
it.each(incompatible)('refuses %s without altering bytes/schema/records/journal and closes its native connection', (_kind, ddl) => fixture(async (_root, file) => {
  const seed = new Database(file);
  try { seed.exec(ddl); } finally { seed.close(); }
  const before = inspect(file);
  const close = vi.spyOn(Database.prototype, 'close');
  const attempt = import('./sqlite.js');
  try {
    await expect(attempt).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    expect(inspect(file)).toEqual(before);
    fs.renameSync(file, file + '.closed');
    fs.renameSync(file + '.closed', file);
    expect(inspect(file)).toEqual(before);
  } finally {
    // Preserve cleanup even when a baseline incorrectly accepts the fixture.
    const accepted = await attempt.catch(() => null);
    accepted?.sqliteClose();
  }
}));

it('initializes a genuinely empty database and persists owned records on restart', () => fixture(async (_root, file) => {
  const first = await import('./sqlite.js');
  try {
    const data = first.sqliteLoad();
    data.tasks.push({ id: 'synthetic-new', title: 'Preserve synthetic task' } as any);
    first.sqliteSave(data);
    expect(first.sqliteConnection().inTransaction).toBe(false);
  } finally { first.sqliteClose(); }
  vi.resetModules();
  const restarted = await import('./sqlite.js');
  try { expect(restarted.sqliteLoad().tasks).toEqual([{ id: 'synthetic-new', title: 'Preserve synthetic task' }]); }
  finally { restarted.sqliteClose(); }
  expect(inspect(file).journal).toBe('wal');
}));
it('completes a supported version1 partial legacy schema while preserving rows and domain tables', () => fixture(async (_root, file) => {
  const seed = new Database(file);
  try {
    seed.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO app_meta VALUES('schema_version','1');CREATE TABLE tasks(id TEXT PRIMARY KEY,seq INTEGER NOT NULL,data TEXT NOT NULL);CREATE TABLE synthetic_domain(id TEXT PRIMARY KEY,value TEXT);INSERT INTO synthetic_domain VALUES('synthetic-domain','preserve-me');");
    seed.prepare('INSERT INTO tasks VALUES(?,?,?)').run('synthetic-task', 0, JSON.stringify({ id: 'synthetic-task', title: 'Legacy task' }));
  } finally { seed.close(); }
  const store = await import('./sqlite.js');
  try {
    expect(store.sqliteLoad().tasks).toEqual([{ id: 'synthetic-task', title: 'Legacy task' }]);
    expect(store.sqliteConnection().prepare('SELECT * FROM synthetic_domain').all()).toEqual([{ id: 'synthetic-domain', value: 'preserve-me' }]);
    expect(store.sqliteConnection().inTransaction).toBe(false);
    expect(store.sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='schema_version'").get()).toEqual({ value: '1' });
  } finally { store.sqliteClose(); }
}));
