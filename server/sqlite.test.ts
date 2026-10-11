import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyOrganizerDB } from '../src/types.js';

describe('SQLite collection adapter with synthetic data', () => {
  const originalCwd = process.cwd();
  let directory: string;
  let store: typeof import('./sqlite.js');

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fo SQLite dữ liệu '));
    process.chdir(directory);
    vi.stubEnv("DATA_DIR", path.join(directory, "data"));
    vi.resetModules();
    store = await import('./sqlite.js');
  });

  afterEach(() => {
    try {
      store?.sqliteClose();
    } finally {
      process.chdir(originalCwd);
      vi.unstubAllEnvs();
      fs.rmSync(directory, { recursive: true, force: true });
    }
    expect(fs.existsSync(directory)).toBe(false);
  });

  const fixture = () => ({
    tasks: [{ id: 'synthetic-b', title: 'Việc nhà' }, { id: 'synthetic-a', title: 'Đọc sách' }],
    rewardLedger: [{ id: 'synthetic-reward', points: 5 }],
    transactions: [{ id: 'synthetic-finance', amount: 1000 }],
    mealPlan: { label: 'Bữa cơm synthetic' },
    hiddenBuiltinCategories: ['synthetic-category'],
  } as unknown as FamilyOrganizerDB);

  it('round-trips collection order, Unicode and singleton fields', () => {
    store.sqliteSave(fixture());
    expect(store.sqliteLoad()).toMatchObject(fixture());
  });

  it('rolls back all collections when a later collection violates its primary key', () => {
    store.sqliteSave(fixture());
    const before = store.sqliteLoad();
    const invalid = { ...before, tasks: [], transactions: [{ id: 'duplicate' }, { id: 'duplicate' }] };
    expect(() => store.sqliteSave(invalid as FamilyOrganizerDB)).toThrow(/UNIQUE/);
    expect(store.sqliteLoad()).toEqual(before);
  });

  it('backs up committed WAL contents into a database that can be reopened', async () => {
    store.sqliteSave(fixture());
    const destination = path.join(directory, 'snapshot.db');
    await store.sqliteBackupTo(destination);
    const snapshot = new Database(destination, { readonly: true });
    try {
      const rows = snapshot.prepare('SELECT data FROM tasks ORDER BY seq').all() as { data: string }[];
      expect(rows.map(row => JSON.parse(row.data))).toEqual(fixture().tasks);
      expect(snapshot.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      snapshot.close();
    }
  });

  it('closes idempotently and releases the database file before deletion', () => {
    store.sqliteSave(fixture());
    store.sqliteClose();
    expect(() => store.sqliteClose()).not.toThrow();
    const databasePath = path.join(directory, 'data', 'family.db');
    fs.rmSync(databasePath);
    expect(fs.existsSync(databasePath)).toBe(false);
  });
});
