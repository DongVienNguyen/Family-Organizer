import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { registerDomainMigration, applyDomainMigrations, getDomainVersions } from './appMigrations.js';
import { sqliteConnection } from './sqlite.js';

describe('shared pilot migration registry', () => {
  it('runs in version order, retries without duplicate writes and reports absent domains', () => {
    const namespace = 'synthetic_' + randomUUID().replaceAll('-', '');
    const calls: number[] = [];
    registerDomainMigration(namespace, 2, tx => { calls.push(2); tx.run('INSERT INTO migration_synthetic VALUES (?)', 'two'); }, 'fixture-v2');
    registerDomainMigration(namespace, 1, tx => { calls.push(1); tx.exec('CREATE TABLE migration_synthetic (id TEXT PRIMARY KEY)'); tx.run('INSERT INTO migration_synthetic VALUES (?)', 'one'); }, 'fixture-v1');
    expect(() => applyDomainMigrations({ enabled: [namespace], pilot: false })).toThrow(/pilot/i);
    expect(calls).toEqual([]);
    applyDomainMigrations({ enabled: [], pilot: true });
    expect(calls).toEqual([]);
    applyDomainMigrations({ enabled: [namespace], pilot: true });
    applyDomainMigrations({ enabled: [namespace], pilot: true });
    expect(calls).toEqual([1, 2]);
    expect(sqliteConnection().prepare('SELECT id FROM migration_synthetic ORDER BY id').all()).toEqual([{ id: 'one' }, { id: 'two' }]);
    expect(getDomainVersions()).toMatchObject({ wallet: 0, productivity: 0, [namespace]: 2 });
    expect(() => registerDomainMigration(namespace, 1, () => {}, 'changed-v1')).toThrow(/checksum|registered/i);
  });

  it('rolls back all migration DDL and version records on failure, then allows retry', () => {
    const namespace = 'synthetic_' + randomUUID().replaceAll('-', '');
    let fail = true;
    registerDomainMigration(namespace, 1, tx => { tx.exec('CREATE TABLE migration_retry_synthetic (id TEXT)'); if (fail) throw new Error('synthetic migration failure'); }, 'fixture-retry-v1');
    expect(() => applyDomainMigrations({ enabled: [namespace], pilot: true })).toThrow('synthetic migration failure');
    expect(sqliteConnection().prepare("SELECT name FROM sqlite_master WHERE name = 'migration_retry_synthetic'").get()).toBeUndefined();
    expect(getDomainVersions()[namespace] ?? 0).toBe(0);
    fail = false;
    applyDomainMigrations({ enabled: [namespace], pilot: true });
    expect(getDomainVersions()[namespace]).toBe(1);
  });

  it('refuses gaps and unknown enabled namespaces before touching storage', () => {
    const namespace = 'synthetic_' + randomUUID().replaceAll('-', '');
    registerDomainMigration(namespace, 2, () => {}, 'fixture-gap-v2');
    expect(() => applyDomainMigrations({ enabled: [namespace], pilot: true })).toThrow(/gap|version/i);
    expect(() => applyDomainMigrations({ enabled: ['unregistered-synthetic'], pilot: true })).toThrow(/unknown/i);
  });
});
