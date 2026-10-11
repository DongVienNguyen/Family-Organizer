import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('explicit offline data migration', () => {
  let fixture: string;
  let source: string;
  let target: string;
  let backup: string;
  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fo migration dữ liệu '));
    source = path.join(fixture, 'legacy data');
    target = path.join(fixture, 'new data');
    backup = path.join(fixture, 'recovery backup');
    fs.mkdirSync(path.join(source, 'uploads'), { recursive: true });
    const db = new Database(path.join(source, 'family.db'));
    db.pragma('journal_mode=WAL');
    db.exec('CREATE TABLE tasks(id TEXT PRIMARY KEY, title TEXT);');
    db.prepare('INSERT INTO tasks VALUES (?, ?)').run('preserved-task', 'Đọc sách');
    db.close();
    fs.writeFileSync(path.join(source, 'db.json'), JSON.stringify({ users: [{ id: 'preserved-user' }], tasks: [{ id: 'preserved-task' }] }));
    fs.writeFileSync(path.join(source, 'session_secret.key'), 'synthetic-session-only');
    fs.writeFileSync(path.join(source, 'app_settings.json'), JSON.stringify({ synthetic: 'preserved' }));
    fs.writeFileSync(path.join(source, 'uploads', 'proof.bin'), 'synthetic-media');
  });
  afterEach(() => fs.rmSync(fixture, { recursive: true, force: true }));

  it('dry-runs without creating a database, backup or target and reports only file metadata', async () => {
    const { migrateData } = await import('../scripts/migrate-data.mjs');
    const report = await migrateData({ source, target });
    expect(report.mode).toBe('dry-run');
    expect(report.files.map(f => f.path)).toContain('session_secret.key');
    expect(JSON.stringify(report)).not.toContain('synthetic-session-only');
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(backup)).toBe(false);
  });

  it('copies legacy IDs/settings/session/media with a verified SQLite snapshot and preserves source', async () => {
    const { migrateData } = await import('../scripts/migrate-data.mjs');
    const sourceBytes = fs.readFileSync(path.join(source, 'family.db'));
    const report = await migrateData({ source, target, backup, apply: true, confirmOffline: true });
    expect(report.mode).toBe('applied');
    expect(fs.readFileSync(path.join(source, 'family.db'))).toEqual(sourceBytes);
    for (const file of ['db.json', 'session_secret.key', 'app_settings.json', path.join('uploads', 'proof.bin')]) {
      expect(fs.readFileSync(path.join(target, file))).toEqual(fs.readFileSync(path.join(source, file)));
      expect(fs.readFileSync(path.join(backup, file))).toEqual(fs.readFileSync(path.join(source, file)));
    }
    for (const directory of [target, backup]) {
      const db = new Database(path.join(directory, 'family.db'), { readonly: true });
      try {
        expect(db.prepare('SELECT * FROM tasks').get()).toEqual({ id: 'preserved-task', title: 'Đọc sách' });
        expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
      } finally { db.close(); }
    }
  });

  it('requires an external backup and explicit offline confirmation before any write', async () => {
    const { migrateData } = await import('../scripts/migrate-data.mjs');
    await expect(migrateData({ source, target, apply: true, confirmOffline: true })).rejects.toThrow(/backup/i);
    await expect(migrateData({ source, target, backup, apply: true })).rejects.toThrow(/offline/i);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(backup)).toBe(false);
  });

  it('refuses existing or overlapping targets without overwriting data', async () => {
    const { migrateData } = await import('../scripts/migrate-data.mjs');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'preserve.txt'), 'keep');
    await expect(migrateData({ source, target, backup, apply: true, confirmOffline: true })).rejects.toThrow(/exist/i);
    await expect(migrateData({ source, target: path.join(source, 'nested') })).rejects.toThrow(/overlap/i);
    expect(fs.readFileSync(path.join(target, 'preserve.txt'), 'utf8')).toBe('keep');
  });

  it('rejects symlink/reparse input so migration cannot copy data outside the source', async () => {
    const { migrateData } = await import('../scripts/migrate-data.mjs');
    const outside = path.join(fixture, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(migrateData({ source, target })).rejects.toThrow(/link|reparse/i);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('leaves source and destination untouched when SQLite validation fails', async () => {
    const { migrateData } = await import('../scripts/migrate-data.mjs');
    fs.writeFileSync(path.join(source, 'family.db'), 'corrupt synthetic database');
    await expect(migrateData({ source, target, backup, apply: true, confirmOffline: true })).rejects.toThrow();
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(path.join(source, 'family.db'), 'utf8')).toBe('corrupt synthetic database');
  });
});
