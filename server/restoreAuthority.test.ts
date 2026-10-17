import { withAppCommandContext } from './commandContext.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import * as sqlite from './sqlite.js';
import * as gateway from './appStore.js';
import * as snapshot from './appSnapshot.js';
import { UPLOADS_DIR } from './media.js';
import { UserRole } from '../src/types.js';
const adminId = 'synthetic-restore-guard-admin', file = path.join(UPLOADS_DIR, 'synthetic-restore-guard.bin');
const meta = () => ({ actorId: adminId, command: 'synthetic:restore-guard', requestId: randomUUID(), payloadHash: 'synthetic' }), write = <T>(fn: Parameters<typeof gateway.withAppWriteTransaction<T>>[1]) => gateway.withAppWriteTransaction(meta(), fn);
function setup() { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); fs.writeFileSync(file, 'synthetic saved media'); write(tx => { tx.legacy.users = [{ id: adminId, username: 'synthetic-restore-guard', fullName: 'Synthetic restore guard', role: UserRole.ADMIN, passwordHash: 'synthetic-offline', avatarColor: 'blue', createdAt: '2026-10-17T00:00:00.000Z' }]; tx.legacy.tasks = []; tx.run("INSERT OR REPLACE INTO app_meta VALUES('synthetic_restore_guard','saved')"); }); const saved = write(tx => snapshot.collectAppSnapshot(tx)); write(tx => { tx.legacy.tasks = [{ id: 'synthetic-guard-current-task', title: 'Synthetic current work', status: 'todo', createdAt: '2026-10-17' } as any]; tx.run("UPDATE app_meta SET value='current' WHERE key='synthetic_restore_guard'"); }); fs.writeFileSync(file, 'synthetic current media'); return snapshot.validateAppSnapshot(saved); }
const maintenance = async <T>(work: () => Promise<T>) => work();
it.each(['after-drain', 'before-files', 'before-sql'])('rechecks current live authority at %s and restores current bytes without resurrecting the saved Admin', async (boundary) => {
    const saved = setup(), phases: string[] = [];
    const demote = () => write(tx => { tx.legacy.users[0].role = UserRole.MEMBER; });
    await expect(snapshot.restoreAppSnapshot(saved, { maintenance: async (work) => { if (boundary === 'after-drain')
            demote(); return work(); }, onBoundary: phase => { if (boundary === 'before-files' && phase === 'safety-backup-complete' || boundary === 'before-sql' && phase === 'staging-complete')
            demote(); }, assertCurrent: (phase: any, live: any) => { phases.push(phase); if (live.legacy.users[0].role !== UserRole.ADMIN)
            throw Error('Synthetic current Admin revoked'); } } as any)).rejects.toThrow('Synthetic current Admin revoked');
    expect(phases.at(-1)).toBe(boundary);
    expect(sqlite.sqliteLoad().users[0].role).toBe(UserRole.MEMBER);
    expect(sqlite.sqliteLoad().tasks[0].id).toBe('synthetic-guard-current-task');
    expect(sqlite.sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='synthetic_restore_guard'").get()).toEqual({ value: 'current' });
    expect(fs.readFileSync(file, 'utf8')).toBe('synthetic current media');
    expect(fs.existsSync(path.join(process.env.DATA_DIR!, 'restore-journal.json'))).toBe(false);
});
it('the atomic guard reads original live SQL and legacy rather than replacement roles and exposes no writer or lingering read handle', async () => {
    const saved = setup(), phases: string[] = [];
    let held: any;
    await snapshot.restoreAppSnapshot(saved, { maintenance, assertCurrent: (phase: any, live: any) => { phases.push(phase); held = live; expect(live.run).toBeUndefined(); expect(live.exec).toBeUndefined(); expect(live.afterCommit).toBeUndefined(); expect(live.legacy.tasks[0].id).toBe('synthetic-guard-current-task'); expect(live.get("SELECT value FROM app_meta WHERE key='synthetic_restore_guard'")).toEqual({ value: 'current' }); expect(sqlite.sqliteConnection().inTransaction).toBe(phase === 'before-sql'); } } as any);
    expect(phases).toEqual(['after-drain', 'before-files', 'before-sql']);
    expect(() => held.get('SELECT 1')).toThrow('Restore guard is closed');
    expect(() => held.legacy).toThrow('Restore guard is closed');
    expect(sqlite.sqliteLoad().tasks).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe('synthetic saved media');
});
it.each(['async', 'thenable'])('rejects a %s authority callback before any SQL/file promotion and consumes late rejection', async (kind) => {
    const saved = setup(), before = sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get(), current = fs.readFileSync(file), guard = kind === 'async' ? async () => { throw Error('Synthetic late rejection'); } : () => Promise.reject(Error('Synthetic late rejection'));
    await expect(snapshot.restoreAppSnapshot(saved, { maintenance, assertCurrent: guard } as any)).rejects.toThrow('Restore guard must be synchronous');
    await new Promise(resolve => setImmediate(resolve));
    expect(sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(before);
    expect(fs.readFileSync(file)).toEqual(current);
    expect(fs.existsSync(path.join(process.env.DATA_DIR!, 'restore-journal.json'))).toBe(false);
});
it.each(['get', 'all'] as const)('a guard cannot mutate SQL through its read %s facade', async (method) => { const saved = setup(), before = sqlite.sqliteLoad(), bytes = fs.readFileSync(file); await expect(snapshot.restoreAppSnapshot(saved, { maintenance, assertCurrent: (_phase, live) => { live[method]("UPDATE app_meta SET value='forbidden' WHERE key='synthetic_restore_guard' RETURNING value"); } })).rejects.toThrow('Restore guard is read-only'); expect(sqlite.sqliteLoad()).toEqual(before); expect(sqlite.sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='synthetic_restore_guard'").get()).toEqual({ value: 'current' }); expect(fs.readFileSync(file)).toEqual(bytes); });
it('cached restore acknowledgement still invokes a fresh current-authority guard without rewriting files or rows', async () => { const saved = setup(), context = { actorId: adminId, requestId: randomUUID() }, phases: string[] = [], options = { maintenance, assertCurrent: (phase: any, live: any) => { phases.push(phase); if (live.legacy.users[0].role !== UserRole.ADMIN)
        throw Error('Synthetic cached Admin revoked'); } }; const first = await withAppCommandContext(context, () => snapshot.restoreAppSnapshot(saved, options)); expect(await withAppCommandContext(context, () => snapshot.restoreAppSnapshot(saved, options))).toEqual(first); expect(phases.at(-1)).toBe('replay'); write(tx => { tx.legacy.users[0].role = UserRole.MEMBER; }); const before = sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get(), bytes = fs.readFileSync(file); await expect(withAppCommandContext(context, () => snapshot.restoreAppSnapshot(saved, options))).rejects.toThrow('Synthetic cached Admin revoked'); expect(phases.at(-1)).toBe('replay'); expect(sqlite.sqliteConnection().prepare('SELECT total_changes() AS n').get()).toEqual(before); expect(fs.readFileSync(file)).toEqual(bytes); expect(sqlite.sqliteLoad().users[0].role).toBe(UserRole.MEMBER); });
