import type { AppWriteTx } from './appStore.js';
import { withAppWriteTransaction, AppStoreError } from './appStore.js';
import { sqliteConnection } from './sqlite.js';
import { createHash, randomUUID } from 'node:crypto';
export type AppJobKind = 'command' | 'effect' | 'schedule';
export interface AppJobInput { namespace: string; type: string; key: string; payload: unknown; kind?: AppJobKind; availableAt?: number; maxAttempts?: number }
export interface AppJobLease { id: string; namespace: string; type: string; key: string; payload: any; kind: AppJobKind; token: string; until: number; attempt: number }
interface JobRow { id: string; namespace: string; type: string; unique_key: string; payload: string; payload_hash: string; kind: AppJobKind; status: string; available_at: number; lease_token: string | null; lease_until: number | null; attempts: number; max_attempts: number }
const connection = sqliteConnection();
const schema = `CREATE TABLE IF NOT EXISTS app_jobs (
  id TEXT PRIMARY KEY, namespace TEXT NOT NULL, type TEXT NOT NULL,
  unique_key TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('command','effect','schedule')),
  status TEXT NOT NULL CHECK(status IN ('pending','leased','completed','failed','unknown','dropped')),
  available_at INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL,
  error_code TEXT, created_at INTEGER NOT NULL, completed_at INTEGER,
  UNIQUE(namespace,type,unique_key)
);
CREATE INDEX IF NOT EXISTS idx_app_jobs_due ON app_jobs(namespace,type,status,available_at);`;
withAppWriteTransaction({ actorId: 'system:bootstrap', command: 'core:job-store:init', requestId: 'core-job-store-v1', payloadHash: createHash('sha256').update(schema).digest('hex') }, tx => {
  const stored = tx.get('SELECT value FROM app_meta WHERE key = ?', 'job_store_version');
  if (stored && stored.value !== '1') throw new Error('Unsupported durable job store version');
  tx.exec(schema);
  tx.run('INSERT OR IGNORE INTO app_meta (key,value) VALUES (?,?)', 'job_store_version', '1');
});
// Fail during explicit storage bootstrap, before readiness, on a damaged schema.
connection.prepare('SELECT id, namespace, type, unique_key, payload, payload_hash, kind, status, available_at, lease_token, lease_until, attempts, max_attempts, error_code, created_at, completed_at FROM app_jobs LIMIT 0').all();

function canonical(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || !value || seen.has(value)) throw new AppStoreError('Job payload must be finite acyclic JSON', 400);
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => item === undefined ? null : canonical(item, seen));
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new AppStoreError('Job payload must be plain JSON', 400);
    return Object.fromEntries(Object.keys(value).sort().filter(key => (value as any)[key] !== undefined).map(key => [key, canonical((value as any)[key], seen)]));
  } finally { seen.delete(value); }
}
const write = <T>(command: string, fn: (tx: AppWriteTx) => T) => withAppWriteTransaction({ actorId: 'system:jobs', command: `jobs:${command}`, requestId: randomUUID(), payloadHash: createHash('sha256').update(command).digest('hex') }, fn);
function validTime(value: number): void { if (!Number.isSafeInteger(value) || value < 0) throw new AppStoreError('Invalid job clock', 400); }
function validLease(ms: number): void { if (!Number.isSafeInteger(ms) || ms < 1 || ms > 86_400_000) throw new AppStoreError('Invalid job lease duration', 400); }

/** Called inside the domain command, so an outbox effect commits with its data. */
export function enqueueAppJob(tx: AppWriteTx, input: AppJobInput): string {
  if (![input.namespace, input.type].every(value => /^[a-z][a-z0-9_-]{0,79}$/.test(value)) || typeof input.key !== 'string' || !input.key || input.key.length > 256) throw new AppStoreError('Invalid job namespace/type/key', 400);
  const kind = input.kind ?? 'command', maxAttempts = input.maxAttempts ?? 3;
  if (!['command', 'effect', 'schedule'].includes(kind) || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new AppStoreError('Invalid job kind/attempt limit', 400);
  const availableAt = input.availableAt ?? Date.now(); validTime(availableAt);
  const payload = JSON.stringify(canonical(input.payload));
  if (Buffer.byteLength(payload) > 1024 * 1024) throw new AppStoreError('Job payload exceeds 1MiB; queue a managed reference instead', 413);
  const hash = createHash('sha256').update(JSON.stringify([kind, maxAttempts, input.availableAt ?? null, payload])).digest('hex');
  const prior = tx.get('SELECT id,payload_hash FROM app_jobs WHERE namespace = ? AND type = ? AND unique_key = ?', input.namespace, input.type, input.key);
  if (prior) {
    if (prior.payload_hash !== hash) throw new AppStoreError('Job key payload conflict', 409);
    return prior.id;
  }
  const id = randomUUID();
  tx.run('INSERT INTO app_jobs (id,namespace,type,unique_key,payload,payload_hash,kind,status,available_at,max_attempts,created_at) VALUES (?,?,?,?,?,?,?,\'pending\',?,?,?)', id, input.namespace, input.type, input.key, payload, hash, kind, availableAt, maxAttempts, Date.now());
  return id;
}
export class AppJobStore {
  enqueue(input: AppJobInput): string { return write('enqueue', tx => enqueueAppJob(tx, input)); }
  claim(namespace: string, type: string, now: number, leaseMs: number): AppJobLease | undefined {
    validTime(now); validLease(leaseMs);
    const eligible = "namespace = ? AND type = ? AND ((status = 'pending' AND available_at <= ?) OR (status = 'leased' AND lease_until <= ?))";
    if (!connection.prepare(`SELECT id FROM app_jobs WHERE ${eligible} LIMIT 1`).get(namespace, type, now, now)) return;
    return write('claim', tx => {
      while (true) {
        const row = tx.get(`SELECT * FROM app_jobs WHERE ${eligible} ORDER BY available_at,id LIMIT 1`, namespace, type, now, now) as JobRow | undefined;
        if (!row) return;
        if (row.status === 'leased' && row.kind === 'effect') {
          tx.run("UPDATE app_jobs SET status = 'unknown', error_code = 'lease-expired-outcome-unknown', lease_token = NULL, lease_until = NULL WHERE id = ?", row.id);
          continue;
        }
        if (row.attempts >= row.max_attempts) {
          tx.run("UPDATE app_jobs SET status = 'failed', error_code = 'attempt-limit', lease_token = NULL, lease_until = NULL WHERE id = ?", row.id);
          continue;
        }
        const token = randomUUID(), until = now + leaseMs;
        validTime(until);
        tx.run("UPDATE app_jobs SET status = 'leased', lease_token = ?, lease_until = ?, attempts = attempts + 1 WHERE id = ?", token, until, row.id);
        return { id: row.id, namespace: row.namespace, type: row.type, key: row.unique_key, payload: JSON.parse(row.payload), kind: row.kind, token, until, attempt: row.attempts + 1 };
      }
    });
  }
  private owned(job: AppJobLease, now: number): boolean {
    validTime(now);
    return !!connection.prepare("SELECT id FROM app_jobs WHERE id = ? AND status = 'leased' AND lease_token = ? AND lease_until > ?").get(job.id, job.token, now);
  }
  assertLease(job: AppJobLease, now: number): void {
    if (!this.owned(job, now)) throw new AppStoreError('Job lease ownership expired or was replaced', 409);
  }
  complete(job: AppJobLease, now: number): boolean {
    if (!this.owned(job, now)) return false;
    return write('complete', tx => tx.run("UPDATE app_jobs SET status = 'completed', completed_at = ?, lease_token = NULL, lease_until = NULL, error_code = NULL WHERE id = ? AND status = 'leased' AND lease_token = ? AND lease_until > ?", now, job.id, job.token, now).changes === 1);
  }
  fail(job: AppJobLease, now: number, code = 'handler-failed', unknownOutcome = false): boolean {
    if (!this.owned(job, now)) return false;
    const safeCode = /^[a-z0-9-]{1,80}$/.test(code) ? code : 'handler-failed';
    return write('fail', tx => {
      const row = tx.get("SELECT attempts,max_attempts FROM app_jobs WHERE id = ? AND status = 'leased' AND lease_token = ? AND lease_until > ?", job.id, job.token, now);
      if (!row) return false;
      const status = unknownOutcome ? 'unknown' : row.attempts >= row.max_attempts ? 'failed' : 'pending';
      const available = now + Math.min(60_000, 1000 * 2 ** (row.attempts - 1));
      return tx.run('UPDATE app_jobs SET status = ?, available_at = ?, error_code = ?, lease_token = NULL, lease_until = NULL WHERE id = ?', status, available, safeCode, job.id).changes === 1;
    });
  }
  renew(job: AppJobLease, now: number, leaseMs: number): boolean {
    validLease(leaseMs); validTime(now + leaseMs);
    if (!this.owned(job, now)) return false;
    return write('renew', tx => tx.run("UPDATE app_jobs SET lease_until = ? WHERE id = ? AND status = 'leased' AND lease_token = ? AND lease_until > ?", now + leaseMs, job.id, job.token, now).changes === 1);
  }
  nextDue(namespace: string, type: string): number | undefined {
    const row = connection.prepare("SELECT MIN(CASE WHEN status = 'leased' THEN lease_until ELSE available_at END) AS due FROM app_jobs WHERE namespace = ? AND type = ? AND status IN ('pending','leased')").get(namespace, type) as { due: number | null };
    return row.due ?? undefined;
  }
  /** Caller must pause/drain the shared worker registry before restoring rows. */
  restorePolicy(tx: AppWriteTx, now: number): void {
    validTime(now);
    tx.run("UPDATE app_jobs SET status = CASE WHEN kind = 'schedule' AND status = 'pending' AND available_at > ? THEN 'pending' ELSE 'dropped' END, lease_token = NULL, lease_until = NULL, error_code = 'restore-policy' WHERE status IN ('pending','leased')", now);
  }
}
