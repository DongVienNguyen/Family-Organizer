import type { AppWriteTx } from './appStore.js';
import { withAppWriteTransaction, invokeSynchronousWrite } from './appStore.js';
import { sqliteConnection } from './sqlite.js';
import { createHash, randomUUID } from 'node:crypto';

interface Migration { version: number; checksum: string; apply: (tx: AppWriteTx) => void }
const registry = new Map<string, Map<number, Migration>>();
const connection = sqliteConnection();
connection.exec(`CREATE TABLE IF NOT EXISTS app_migrations (
  namespace TEXT NOT NULL, version INTEGER NOT NULL, checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL, PRIMARY KEY (namespace, version)
)`);

export function registerDomainMigration(namespace: string, version: number, fn: (tx: AppWriteTx) => void, checksum?: string): void {
  if (!/^[a-z][a-z0-9_]{0,79}$/.test(namespace) || !Number.isSafeInteger(version) || version < 1) throw new Error('Invalid migration namespace/version');
  // A stable explicit identity is required; compiled function source is not stable.
  if (!checksum?.trim()) throw new Error('Migration requires an immutable explicit checksum');
  const versions = registry.get(namespace) ?? new Map<number, Migration>();
  const prior = versions.get(version);
  if (prior) {
    if (prior.checksum !== checksum || prior.apply !== fn) throw new Error('Migration already registered; checksum or implementation changed');
    return;
  }
  versions.set(version, { version, checksum, apply: fn });
  registry.set(namespace, versions);
}
export function applyDomainMigrations(options: { enabled: string[]; pilot: boolean }): void {
  if (options.enabled.length && !options.pilot) throw new Error('New domain migrations require an explicit pilot snapshot');
  const namespaces = [...new Set(options.enabled)].sort();
  for (const namespace of namespaces) {
    const versions = registry.get(namespace);
    if (!versions) throw new Error(`Unknown enabled namespace: ${namespace}`);
    const ordered = [...versions.keys()].sort((a, b) => a - b);
    if (ordered.some((version, i) => version !== i + 1)) throw new Error(`Migration version gap: ${namespace}`);
  }
  if (!namespaces.length) return;
  withAppWriteTransaction({ actorId: 'system:migrations', command: 'domain:migrate', requestId: randomUUID(), payloadHash: createHash('sha256').update(JSON.stringify(namespaces)).digest('hex') }, tx => {
    for (const namespace of namespaces) {
      const migrations = registry.get(namespace)!;
      const applied = tx.all('SELECT version, checksum FROM app_migrations WHERE namespace = ? ORDER BY version', namespace) as { version: number; checksum: string }[];
      for (const [index, record] of applied.entries()) {
        if (record.version !== index + 1 || !migrations.has(record.version)) throw new Error(`Unsupported stored migration version: ${namespace}`);
        if (migrations.get(record.version)!.checksum !== record.checksum) throw new Error(`Migration checksum changed: ${namespace}/${record.version}`);
      }
      for (const migration of [...migrations.values()].sort((a, b) => a.version - b.version)) {
        if (migration.version <= applied.length) continue;
        invokeSynchronousWrite(migration.apply, tx);
        tx.run('INSERT INTO app_migrations VALUES (?, ?, ?, ?)', namespace, migration.version, migration.checksum, new Date().toISOString());
      }
    }
  });
}
export function getDomainVersions(): Record<string, number> {
  const versions: Record<string, number> = { wallet: 0, productivity: 0 };
  for (const row of connection.prepare('SELECT namespace, MAX(version) AS version FROM app_migrations GROUP BY namespace').all() as { namespace: string; version: number }[]) versions[row.namespace] = row.version;
  return versions;
}
