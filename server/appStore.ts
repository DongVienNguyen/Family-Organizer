import type { FamilyOrganizerDB } from '../src/types.js';
import { randomUUID, createHash } from 'node:crypto';
import { sqliteConnection, sqliteLoad, sqliteSave, withSqliteWriteScope } from './sqlite.js';
import { getAppCommandContext } from './commandContext.js';
import { trackAppEffect } from './appEffects.js';
import { AppStoreError } from './appErrors.js';
import {mediaReferences,bindMediaChanges} from './mediaPolicy.js';
export { AppStoreError } from './appErrors.js';
export interface AppWriteTx {
  legacy: FamilyOrganizerDB;
  exec(sql: string): void;
  run(sql: string, ...parameters: any[]): any;
  get(sql: string, ...parameters: any[]): any;
  all(sql: string, ...parameters: any[]): any[];
  afterCommit(effect: () => unknown): void;
}
export interface AppWriteMetadata { actorId: string; command: string; requestId: string; payloadHash: string }
const connection = sqliteConnection();
connection.exec(`CREATE TABLE IF NOT EXISTS app_commands (
  command TEXT NOT NULL, request_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL, result TEXT NOT NULL, committed_at TEXT NOT NULL,
  PRIMARY KEY (command, request_id)
)`);
let current: AppWriteTx | undefined;
const snapshotReadResults = new WeakSet<object>();
/** Internal read-result marker; full snapshot bytes must not enter the command cache. */
export function markSnapshotReadResult<T extends object>(value: T): T { snapshotReadResults.add(value); return value; }
export function currentAppWriteTx(): AppWriteTx | undefined { return current; }

function assertSql(sql: string): void {
  // These are trusted, internal SQL ports, never a public SQL API. The gateway
  // alone controls the transaction, including statement batches with comments.
  const statements = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  if (/(?:^|;)\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|END)\b/i.test(statements)) {
    throw new AppStoreError('Transaction control belongs to the gateway', 400);
  }
}

export function invokeSynchronousWrite<T>(fn: (tx: AppWriteTx) => T, tx: AppWriteTx): T {
  if (fn.constructor.name === 'AsyncFunction') throw new AppStoreError('Transaction callback must be synchronous', 400);
  const value = fn(tx);
  if (value && typeof (value as any).then === 'function') {
    // Promise/thenable continuations cannot own the native transaction. Observe
    // rejection, including a late attempt to access the invalidated tx handle.
    Promise.resolve(value).catch(() => {});
    throw new AppStoreError('Transaction callback must be synchronous', 400);
  }
  return value;
}

export function withAppWriteTransaction<T>(meta: AppWriteMetadata, fn: (tx: AppWriteTx) => T): T {
  return executeWriteTransaction(meta,fn);
}
/** Trusted shared restore port. The engine has validated/branded replacement
 * data and saved a native safety copy before invoking this synchronous owner.
 * Ordinary commands never bypass their current document/stale-read checks.
 */
export function withAppSnapshotRestoreTransaction<T>(meta:AppWriteMetadata,replacement:FamilyOrganizerDB,fn:(tx:AppWriteTx)=>T):T {
  if(meta.command!=='core:snapshot:restore')throw new AppStoreError('Replacement data belongs to shared snapshot restore',400);
  return executeWriteTransaction(meta,fn,replacement);
}
function executeWriteTransaction<T>(meta:AppWriteMetadata,fn:(tx:AppWriteTx)=>T,restoreLegacy?:FamilyOrganizerDB):T {
  if (current) throw new AppStoreError('Nested public transaction is not permitted', 409);
  getAppCommandContext()?.assertWriteOwnership?.();
  for (const key of ['actorId', 'command', 'requestId', 'payloadHash'] as const) {
    if (typeof meta[key] !== 'string' || !meta[key].trim() || meta[key].length > 256) throw new AppStoreError(`Invalid command ${key}`, 400);
  }
  const effects: (() => unknown)[] = [];
  const result = withSqliteWriteScope(() => connection.transaction(() => {
    const prior = connection.prepare('SELECT actor_id, payload_hash, result FROM app_commands WHERE command = ? AND request_id = ?').get(meta.command, meta.requestId) as any;
    if (prior) {
      if (prior.actor_id !== meta.actorId || prior.payload_hash !== meta.payloadHash) throw new AppStoreError('Request conflicts with committed command', 409);
      const cached = JSON.parse(prior.result);
      if (cached.snapshotRead === true) throw new AppStoreError('Snapshot reads require a fresh request ID',409);
      return cached.value as T;
    }
    let active = true;
    let legacy = restoreLegacy ? JSON.parse(JSON.stringify(restoreLegacy)) as FamilyOrganizerDB : sqliteLoad();
    const priorMediaReferences=mediaReferences(legacy);
    const assertActive = () => { if (!active) throw new AppStoreError('Transaction handle is closed', 409); };
    const statement = (sql: string) => { assertActive(); assertSql(sql); return connection.prepare(sql); };
    const tx: AppWriteTx = {
      get legacy() { assertActive(); return legacy; },
      set legacy(value) { assertActive(); legacy = value; },
      exec(sql) { assertActive(); assertSql(sql); connection.exec(sql); },
      run(sql, ...parameters) { return statement(sql).run(...parameters); },
      get(sql, ...parameters) { return statement(sql).get(...parameters); },
      all(sql, ...parameters) { return statement(sql).all(...parameters); },
      afterCommit(effect) { assertActive(); effects.push(effect); },
    };
    current = tx;
    const initialChanges = connection.prepare('SELECT total_changes() AS count').get() as { count: number };
    const initialSchema = connection.pragma('schema_version', { simple: true });
    try {
      const value = invokeSynchronousWrite(fn, tx);
      const snapshotRead = !!value && typeof value === 'object' && snapshotReadResults.has(value as object);
      bindMediaChanges(tx,priorMediaReferences,meta.actorId);
      sqliteSave(legacy);
      if(restoreLegacy)sqliteLoad(); // Replacement DTOs must be readable before COMMIT.
      if (snapshotRead && ((connection.prepare('SELECT total_changes() AS count').get() as { count: number }).count !== initialChanges.count || connection.pragma('schema_version', { simple: true }) !== initialSchema)) throw new AppStoreError('A full snapshot result is only valid for a read command',400);
      const serialized = JSON.stringify(snapshotRead ? { snapshotRead: true } : { value });
      connection.prepare('INSERT INTO app_commands VALUES (?, ?, ?, ?, ?, ?)').run(meta.command, meta.requestId, meta.actorId, meta.payloadHash, serialized, new Date().toISOString());
      // Fence a delayed worker before native COMMIT, including callbacks whose
      // synchronous writes exceeded their lease. A lost owner rolls back all.
      getAppCommandContext()?.assertWriteOwnership?.();
      return value;
    } finally { active = false; current = undefined; }
  }).immediate());
  for (const effect of effects) {
    try {
      const pending = effect();
      if (pending && typeof (pending as any).then === 'function') trackAppEffect(Promise.resolve(pending));
    } catch (error) { console.error('Committed application effect failed:', error); }
  }
  return result;
}

/** Explicit reuse policy for synchronous legacy methods, never for public callers. */
export function runLegacyCommand<T>(command: string, args: unknown[], actorId: string, fn: () => T): T {
  if (current) return fn();
  const context = getAppCommandContext();
  return withAppWriteTransaction({
    actorId: context?.actorId ?? actorId, command: `legacy:${command}`,
    requestId: context?.requestId ?? randomUUID(),
    payloadHash: createHash('sha256').update(JSON.stringify(args)).digest('hex'),
  }, fn);
}

export function afterAppCommit(effect: () => unknown): void {
  if (current) current.afterCommit(effect);
  else {
    const result = effect();
    if (result && typeof (result as any).then === 'function') trackAppEffect(Promise.resolve(result));
  }
}
