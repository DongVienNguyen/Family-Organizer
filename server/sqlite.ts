/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { COLLECTIONS, SINGLETON_KEYS, LEGACY_KEYS } from "./legacySchema.js";
import { FamilyOrganizerDB, type Task } from "../src/types.js";

import { appConfig, prepareStorage } from "./config.js";
import {isFirstAccountStorage,InstallationNotPristineError} from "./installationMode.js";
import {inspectProductivityStorage} from './productivity/inspection.js';

const DATA_DIR = appConfig.dataRoot;
prepareStorage(appConfig);
const DB_PATH = path.join(DATA_DIR, "family.db");
const SCHEMA_VERSION = 1;
export interface LegacyTaskStorageAdapter {enabled():boolean;read():Task[];write(rows:Task[]):void}
let taskStorageAdapter:LegacyTaskStorageAdapter|undefined;
/** Explicit trusted bootstrap port; storage remains owned by this connection. */
export function installLegacyTaskStorageAdapter(adapter:LegacyTaskStorageAdapter):void {
 if(taskStorageAdapter&&taskStorageAdapter!==adapter)throw new Error('Task storage adapter already installed');
 taskStorageAdapter=adapter;
}

// Map each FamilyOrganizerDB collection key -> SQLite table name.
// Each row keeps the full record as JSON plus a `seq` column so array order
// (newest-first lists, etc.) is preserved exactly across save/load.

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
// Singleton (non-array) fields stored as a single JSON row in app_meta.


// Module evaluation owns the native connection even if a schema/statement fails.
function initializeDatabase() {
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    // Inspect and initialize under the same native write lock. Incompatible
    // databases must not gain owned tables/indexes or a different journal mode.
    db.exec('BEGIN IMMEDIATE');
    if(isFirstAccountStorage()){
      // Hold the same native connection/write lock through inspection and DDL.
      // Preserve the selected journal mode; normal runtime enables WAL later.
      if(!sqliteInstallationPristine())throw new InstallationNotPristineError();
    }else {
      const objects = db.prepare("SELECT type,name FROM sqlite_master WHERE name NOT GLOB 'sqlite_*'").all() as {type:string;name:string}[];
      if (objects.length) {
        if (!objects.some(item => item.type === 'table' && item.name === 'app_meta')) throw new Error('Unsupported legacy schema: missing metadata');
        // Preparing this before DDL also preserves the existing native diagnostic
        // for malformed app_meta columns used by runtime ownership checks.
        const stored = db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get() as {value:string}|undefined;
        if (!stored || stored.value !== String(SCHEMA_VERSION)) throw new Error(`Unsupported legacy schema version: ${stored?.value ?? 'missing'}`);
        // Reject unsupported domains under this same native lock before any
        // owned DDL or journal-mode change can alter the installation.
        inspectProductivityStorage({get:(sql,...args)=>db.prepare(sql).get(...args),all:(sql,...args)=>db.prepare(sql).all(...args)});
      }
    }

    // Schema: a document-style table per collection (id, seq, data JSON) + app_meta.
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    for (const { table } of COLLECTIONS) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id   TEXT PRIMARY KEY,
          seq  INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_${table}_seq ON ${table}(seq);
      `);
    }
    const getMetaStmt = db.prepare("SELECT value FROM app_meta WHERE key = ?");
    const setMetaStmt = db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)");
    const schema = getMetaStmt.get("schema_version") as { value: string } | undefined;
    if (schema && schema.value !== String(SCHEMA_VERSION)) {
      throw new Error(`Unsupported legacy schema version: ${schema.value}`);
    }
    if (!schema) setMetaStmt.run("schema_version", String(SCHEMA_VERSION));

    // Prepared per-collection replace statements.
    const deleteStmts = new Map<string, Database.Statement>();
    const insertStmts = new Map<string, Database.Statement>();
    for (const { table } of COLLECTIONS) {
      deleteStmts.set(table, db.prepare(`DELETE FROM ${table}`));
      insertStmts.set(table, db.prepare(`INSERT INTO ${table} (id, seq, data) VALUES (?, ?, ?)`));
    }

    // Replace only caller-owned, changed collections. Domain tables are independent.
    const saveCollections = (data: FamilyOrganizerDB, keys: readonly (keyof FamilyOrganizerDB)[]) => {
      for (const { key, table } of COLLECTIONS) {
        if (!keys.includes(key)) continue;
        if(key==='tasks'&&taskStorageAdapter?.enabled()){
          if(!writeScope)throw new Error('Canonical tasks require the application gateway');
          taskStorageAdapter.write(data.tasks);deleteStmts.get(table)!.run();continue;
        }
        // Domain history references users(id) and canonical Notes. Preserve parent rows
        // while updating the legacy collection, rather than deleting them all.
        if (key === 'users' || key === 'notes') {
          const rows = data[key] || [];
          const retainedTable = key === 'users' ? 'users' : 'notes';
          if (!Array.isArray(rows)) throw new Error('Invalid legacy collection: '+key);
          const ids = new Set<string>();
          const values = rows.map((item, index) => {
            const id = item && item.id != null ? String(item.id) : `row_${index}`;
            if (ids.has(id)) throw new Error(key==='users'?'Duplicate legacy user ID':'Duplicate legacy note ID');
            ids.add(id); return { id, index, data: JSON.stringify(item) };
          });
          const upsert = db.prepare(`INSERT INTO ${retainedTable}(id,seq,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET seq=excluded.seq,data=excluded.data`);
          for (const row of values) upsert.run(row.id, row.index, row.data);
          const remove = db.prepare(`DELETE FROM ${retainedTable} WHERE id=?`);
          for (const row of db.prepare(`SELECT id FROM ${retainedTable}`).all() as {id:string}[]) if (!ids.has(row.id)) remove.run(row.id);
          continue;
        }
        deleteStmts.get(table)!.run();
        const insert = insertStmts.get(table)!;
        const arr = (data as any)[key] || [];
        if (!Array.isArray(arr)) throw new Error(`Invalid legacy collection: ${key}`);
        arr.forEach((item: any, i: number) => {
          const id = item && item.id != null ? String(item.id) : `row_${i}`;
          insert.run(id, i, JSON.stringify(item));
        });
      }
      for (const key of SINGLETON_KEYS) {
        if (keys.includes(key)) setMetaStmt.run(`singleton:${key}`, JSON.stringify((data as any)[key] ?? null));
      }
    };

    db.exec(`
      CREATE TABLE IF NOT EXISTS server_metrics (
        t    INTEGER PRIMARY KEY,
        cpu  REAL,
        ram  REAL,
        temp REAL,
        ssd  REAL,
        disk REAL
      );
    `);

    const insertMetricStmt = db.prepare(
      "INSERT OR REPLACE INTO server_metrics (t, cpu, ram, temp, ssd, disk) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const pruneMetricStmt = db.prepare("DELETE FROM server_metrics WHERE t < ?");
    const selectMetricsStmt = db.prepare(
      "SELECT t, cpu, ram, temp, ssd, disk FROM server_metrics WHERE t >= ? ORDER BY t ASC"
    );

    db.exec('COMMIT');
    if(!isFirstAccountStorage())db.pragma("journal_mode = WAL");
    return { getMetaStmt, saveCollections, insertMetricStmt, pruneMetricStmt, selectMetricsStmt };
  } catch (error) {
    try{if(db.inTransaction)db.exec('ROLLBACK');}finally{if(db.open)db.close();}
    throw error;
  }
}
const { getMetaStmt, saveCollections, insertMetricStmt, pruneMetricStmt, selectMetricsStmt } = initializeDatabase();
export { LEGACY_KEYS } from './legacySchema.js';
const baselines = new WeakMap<FamilyOrganizerDB, Map<keyof FamilyOrganizerDB, string>>();
let writeScope: Map<FamilyOrganizerDB, Map<keyof FamilyOrganizerDB, string>> | undefined;
const encodeCollection = (data: FamilyOrganizerDB, key: keyof FamilyOrganizerDB) =>
  JSON.stringify(data[key] ?? (SINGLETON_KEYS.includes(key) ? null : []));

/** Flush only the current task view; unrelated legacy collections stay staged. */
export function sqliteFlushLegacyTasks(data:FamilyOrganizerDB):void {
 if(!taskStorageAdapter?.enabled())return;
 if(!writeScope||!db.inTransaction)throw new Error('Canonical tasks require the application gateway');
 const baseline=writeScope.get(data)??baselines.get(data);
 if(baseline&&encodeCollection(data,'tasks')===baseline.get('tasks'))return;
 if(baseline&&JSON.stringify(taskStorageAdapter.read())!==baseline.get('tasks'))throw new Error('Stale legacy collection: tasks');
 saveCollections(data,['tasks']);
 sqliteRefreshCanonicalTasks(data);
}
/** Only own committed SQL changes refresh this transaction's task baseline. */
export function sqliteRefreshCanonicalTasks(data:FamilyOrganizerDB):void {
 if(!writeScope||!db.inTransaction||!taskStorageAdapter?.enabled())throw new Error('Canonical projection requires the application gateway');
 const baseline=writeScope.get(data)??baselines.get(data);
 // An untracked restore document must still replace all its other collections.
 if(!baseline)throw new Error('Canonical projection requires a tracked transaction document');
 data.tasks=taskStorageAdapter.read();
 const updated=new Map(baseline);updated.set('tasks',encodeCollection(data,'tasks'));writeScope.set(data,updated);
}

/** The gateway passes its complete native transaction here, including COMMIT. */
export function withSqliteWriteScope<T>(commit: () => T): T {
  if (writeScope || db.inTransaction) throw new Error('Nested SQLite write scope is not permitted');
  const pending = new Map<FamilyOrganizerDB, Map<keyof FamilyOrganizerDB, string>>();
  writeScope = pending;
  try {
    const result = commit();
    if (db.inTransaction) throw new Error('SQLite write scope did not commit');
    for (const [document, baseline] of pending) baselines.set(document, baseline);
    return result;
  } finally { writeScope = undefined; }
}

/** Loaded documents retain their read baseline; untracked seed/restore documents replace all. */
export function sqliteSave(data: FamilyOrganizerDB): void {
  const ownsCommit = !db.inTransaction;
  if (!ownsCommit && !writeScope) throw new Error('Nested legacy saves require the application gateway');
  db.transaction(() => {
    const baseline = writeScope?.get(data) ?? baselines.get(data);
    const dirty = baseline ? LEGACY_KEYS.filter(key => encodeCollection(data, key) !== baseline.get(key)) : [...LEGACY_KEYS];
    if (baseline && dirty.length) {
      const current = sqliteLoad();
      for (const key of dirty) {
        if (encodeCollection(current, key) !== baseline.get(key)) throw new Error(`Stale legacy collection: ${key}`);
      }
    }
    saveCollections(data, dirty);
    // Restore can change storage mode while keeping the same projected task bytes.
    if(taskStorageAdapter?.enabled()){
      if(!writeScope)throw new Error('Canonical tasks require the application gateway');
      db.prepare('DELETE FROM tasks').run();
    }
  }).immediate();
  const saved = new Map(LEGACY_KEYS.map(key => [key, encodeCollection(data, key)]));
  // Publish only after the actual outer COMMIT; rollback discards pending maps.
  if (writeScope) writeScope.set(data, saved);
  else baselines.set(data, saved);
}

/** Internal shared connection port; never create a second application handle. */
export function sqliteConnection(): Database.Database { return db; }

/** True when the database has never been seeded (no user accounts yet). */
export function sqliteIsEmpty(): boolean {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  return row.c === 0;
}

/** Detect prior legacy initialization even when every user has been removed. */
export function sqliteHasLegacyData():boolean {
  for(const {table} of COLLECTIONS){
    if((db.prepare('SELECT COUNT(*) AS c FROM "'+table+'"').get() as {c:number}).c>0)return true;
  }
  return (db.prepare("SELECT COUNT(*) AS c FROM app_meta WHERE substr(key,1,10)='singleton:'").get() as {c:number}).c>0;
}

/** Trusted first-install port: no business, command history or unknown schema. */
export function sqliteInstallationPristine():boolean {
  const columns=new Map<string,string[]>(COLLECTIONS.map(({table})=>[table,['id','seq','data']]));
  columns.set('app_meta',['key','value']);columns.set('server_metrics',['t','cpu','ram','temp','ssd','disk']);
  columns.set('app_commands',['command','request_id','actor_id','payload_hash','result','committed_at']);
  const objects=db.prepare("SELECT type,name FROM sqlite_master WHERE name NOT GLOB 'sqlite_*'").all() as {type:string;name:string}[];
  const tables=objects.filter(row=>row.type==='table');
  if(!tables.length)return objects.length===0;
  if(objects.some(row=>row.type==='view'||row.type==='trigger'))return false;
  for(const name of [...COLLECTIONS.map(({table})=>table),'app_meta','server_metrics'])if(!tables.some(row=>row.name===name))return false;
  for(const {name} of tables){
    const expected=columns.get(name);if(!expected)return false;
    const actual=db.prepare('PRAGMA table_info("'+name.replaceAll('"','""')+'")').all() as {name:string}[];
    if(actual.length!==expected.length||actual.some((row,index)=>row.name!==expected[index]))return false;
    if(name==='app_meta'){
      if((db.prepare("SELECT COUNT(*) AS c FROM app_meta WHERE key <> 'schema_version'").get() as {c:number}).c!==0)return false;
      if((db.prepare("SELECT value FROM app_meta WHERE key='schema_version'").get() as {value:string}|undefined)?.value!==String(SCHEMA_VERSION))return false;
    }else if((db.prepare('SELECT COUNT(*) AS c FROM "'+name.replaceAll('"','""')+'"').get() as {c:number}).c!==0)return false;
  }
  return true;
}

/** Reconstruct the full in-memory DB object from SQLite, preserving order. */
export function sqliteLoad(): FamilyOrganizerDB {
  const out: any = {};
  for (const { key, table } of COLLECTIONS) {
    if(key==='tasks'&&taskStorageAdapter?.enabled()){out.tasks=taskStorageAdapter.read();continue;}
    const rows = db.prepare(`SELECT data FROM ${table} ORDER BY seq ASC`).all() as { data: string }[];
    out[key] = rows.map(r => JSON.parse(r.data));
  }
  for (const key of SINGLETON_KEYS) {
    const row = getMetaStmt.get(`singleton:${key}`) as { value: string } | undefined;
    out[key] = row && row.value ? JSON.parse(row.value) : null;
  }
  baselines.set(out, new Map(LEGACY_KEYS.map(key => [key, encodeCollection(out, key)])));
  return out as FamilyOrganizerDB;
}

/** Chụp nguyên file SQLite (gồm cả phần đang nằm trong WAL) ra `dest` — dùng trước khi cập nhật app. */
export async function sqliteBackupTo(dest: string): Promise<void> {
  await db.backup(dest);
}

/** Release native file handles; safe to call again during fixture teardown. */
export function sqliteClose(): void {
  taskStorageAdapter=undefined;
  if (db.open) db.close();
}

export function sqliteCheckpoint(): void {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (e) {
    console.error("Lỗi checkpoint WAL:", e);
  }
}

// --- TELEMETRY MÁY CHỦ (tab Quản lý Server) ---
// Bảng riêng NGOÀI mô hình document ở trên: ghi 1 phút/lần bằng INSERT đơn lẻ
// (không rewrite cả DB), tự cắt dữ liệu quá hạn. Không nằm trong backup JSON —
// telemetry là dữ liệu tạm, không cần khôi phục.

export interface ServerMetricRow {
  t: number;                 // epoch ms
  cpu: number | null;        // % CPU
  ram: number | null;        // % RAM
  temp: number | null;       // °C CPU
  ssd: number | null;        // °C SSD NVMe
  disk: number | null;       // % ổ đĩa
}

export function sqliteAppendServerMetric(row: ServerMetricRow, keepMs = 7 * 24 * 3600 * 1000): void {
  insertMetricStmt.run(row.t, row.cpu, row.ram, row.temp, row.ssd, row.disk);
  pruneMetricStmt.run(row.t - keepMs);
}

export function sqliteGetServerMetrics(sinceMs: number): ServerMetricRow[] {
  return selectMetricsStmt.all(sinceMs) as ServerMetricRow[];
}
