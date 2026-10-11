import { randomUUID, createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FamilyDB } from './db.js';
import { sqliteLoad, sqliteSave, sqliteConnection } from './sqlite.js';
import { withAppWriteTransaction, AppStoreError } from './appStore.js';
import { withAppCommandContext } from './commandContext.js';
import fs from 'node:fs';
import ts from 'typescript';

const meta = (command = 'synthetic', requestId = randomUUID(), payload = 'fixture') => ({
  actorId: 'synthetic-actor', command, requestId,
  payloadHash: createHash('sha256').update(payload).digest('hex'),
});

describe('shared synchronous application write ownership', () => {
  it('rolls back a task, claim, existing points and fake Wallet adjustment together', () => {
    const before = sqliteLoad();
    expect(() => withAppWriteTransaction(meta(), tx => {
      tx.exec('CREATE TABLE wallet_synthetic (id TEXT PRIMARY KEY, amount TEXT); CREATE TABLE productivity_synthetic_claims (id TEXT PRIMARY KEY)');
      tx.run('INSERT INTO wallet_synthetic VALUES (?, ?)', 'adjustment', '1200');
      tx.run('INSERT INTO productivity_synthetic_claims VALUES (?)', 'claim');
      FamilyDB.saveTask({ title: 'Synthetic rollback task', isShared: false }, before.users[0].id, 'Synthetic');
      FamilyDB.addRewardEntry({ userId: before.users[0].id, points: 7 }, before.users[0].id, 'Synthetic');
      throw new Error('synthetic abort');
    })).toThrow('synthetic abort');
    expect(sqliteLoad()).toEqual(before);
    expect(sqliteConnection().prepare("SELECT name FROM sqlite_master WHERE name IN ('wallet_synthetic','productivity_synthetic_claims')").all()).toEqual([]);
  });

  it('preserves domain rows and both serialized legacy reward writers', () => {
    const user = sqliteLoad().users[0];
    withAppWriteTransaction(meta(), tx => {
      tx.exec('CREATE TABLE IF NOT EXISTS wallet_synthetic (id TEXT PRIMARY KEY, amount TEXT)');
      tx.run('INSERT INTO wallet_synthetic VALUES (?, ?)', 'retained', '99');
      FamilyDB.addRewardEntry({ userId: user.id, points: 3 }, user.id, 'Synthetic');
    });
    FamilyDB.addRewardEntry({ userId: user.id, points: 4 }, user.id, 'Synthetic');
    expect(FamilyDB.getRewardLedger().filter(e => e.userId === user.id).reduce((sum, e) => sum + e.points, 0)).toBe(7);
    expect(sqliteConnection().prepare('SELECT amount FROM wallet_synthetic WHERE id = ?').get('retained')).toEqual({ amount: '99' });
  });

  it('returns the committed result on a same-payload retry and rejects changed payload or actor', () => {
    const request = meta();
    const callback = vi.fn(() => ({ id: 'synthetic-result', points: 5 }));
    expect(withAppWriteTransaction(request, callback)).toEqual({ id: 'synthetic-result', points: 5 });
    expect(withAppWriteTransaction(request, callback)).toEqual({ id: 'synthetic-result', points: 5 });
    expect(callback).toHaveBeenCalledTimes(1);
    for (const changed of [{ ...request, payloadHash: meta().payloadHash + 'x' }, { ...request, actorId: 'another-actor' }]) {
      try { withAppWriteTransaction(changed, callback); throw new Error('expected conflict'); }
      catch (error) { expect(error).toBeInstanceOf(AppStoreError); expect((error as AppStoreError).status).toBe(409); }
    }
  });

  it('rejects nested public transactions, async callbacks and escaped transaction handles', () => {
    expect(() => withAppWriteTransaction(meta(), () => withAppWriteTransaction(meta(), () => 1))).toThrow(/nested/i);
    expect(() => withAppWriteTransaction(meta(), async tx => { tx.legacy.notes.push({ id: 'async-invalid' } as any); })).toThrow(/synchronous/i);
    expect(sqliteLoad().notes.some(n => n.id === 'async-invalid')).toBe(false);
    let escaped: Parameters<Parameters<typeof withAppWriteTransaction>[1]>[0];
    withAppWriteTransaction(meta(), tx => { escaped = tx; });
    expect(() => escaped.run('SELECT 1')).toThrow(/closed/i);
    expect(() => withAppWriteTransaction(meta(), tx => tx.exec('COMMIT'))).toThrow(/transaction control/i);
  });

  it('does not publish effects on rollback and publishes once after a successful commit', () => {
    const effect = vi.fn();
    const request = meta();
    expect(() => withAppWriteTransaction(request, tx => { tx.afterCommit(effect); throw new Error('rollback'); })).toThrow('rollback');
    expect(effect).not.toHaveBeenCalled();
    withAppWriteTransaction(request, tx => { tx.afterCommit(effect); return 1; });
    withAppWriteTransaction(request, tx => { tx.afterCommit(effect); return 1; });
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('only saves dirty legacy collections and refuses stale edits to the same collection', () => {
    const stale = sqliteLoad();
    const owner = sqliteLoad().users[0];
    FamilyDB.addRewardEntry({ userId: owner.id, points: 2 }, owner.id, 'Synthetic');
    const committedPoints = sqliteLoad().rewardLedger;
    stale.notes.push({ id: 'synthetic-independent-note' } as any);
    sqliteSave(stale);
    expect(sqliteLoad().rewardLedger).toEqual(committedPoints);
    expect(sqliteLoad().rewardLedger.some(e => e.points === 2)).toBe(true);
    const first = sqliteLoad();
    const second = sqliteLoad();
    first.notes.push({ id: 'first-note' } as any);
    sqliteSave(first);
    second.notes.push({ id: 'stale-note' } as any);
    expect(() => sqliteSave(second)).toThrow(/stale/i);
    expect(sqliteLoad().notes.some(n => n.id === 'first-note')).toBe(true);
  });

  it('keeps nested activity writes and task creation in one canonical document', () => {
    const actor = sqliteLoad().users[0];
    const before = FamilyDB.getActivityLogs().length;
    const task = FamilyDB.saveTask({ title: 'Synthetic nested log', isShared: false }, actor.id, 'Synthetic');
    expect(FamilyDB.getTasks().some(t => t.id === task.id)).toBe(true);
    expect(FamilyDB.getActivityLogs().length).toBe(before + 2);
  });

  it('propagates SQLite write failures and rolls back activity rows', () => {
    const before = sqliteLoad();
    sqliteConnection().exec("CREATE TRIGGER synthetic_write_failure BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END");
    try {
      expect(() => FamilyDB.saveTask({ title: 'Must fail', isShared: false }, before.users[0].id, 'Synthetic')).toThrow('synthetic write failure');
      expect(sqliteLoad()).toEqual(before);
    } finally { sqliteConnection().exec('DROP TRIGGER synthetic_write_failure'); }
  });

  it('audits the authenticated actor and deduplicates a legacy command without storing its payload', () => {
    const owner = sqliteLoad().users[0];
    const requestId = randomUUID();
    const context = { actorId: 'authenticated-synthetic-actor', requestId };
    const execute = () => FamilyDB.addRewardEntry({ userId: owner.id, points: 11, reason: 'synthetic-private-payload' }, owner.id, 'Synthetic');
    const first = withAppCommandContext(context, execute);
    const second = withAppCommandContext(context, execute);
    expect(second).toEqual(first);
    expect(sqliteLoad().rewardLedger.filter(e => e.id === first.id)).toHaveLength(1);
    const command = sqliteConnection().prepare('SELECT actor_id, payload_hash FROM app_commands WHERE request_id = ?').get(requestId) as any;
    expect(command.actor_id).toBe(context.actorId);
    expect(command.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(command)).not.toContain('synthetic-private-payload');
  });

  it('audits every public legacy method that can reach a collection writer', () => {
    const source = ts.createSourceFile('db.ts', fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'FamilyDB') as ts.ClassDeclaration;
    const methods = declaration.members.filter(ts.isMethodDeclaration);
    const calls = new Map<string, Set<string>>();
    for (const method of methods) {
      const targets = new Set<string>();
      const scan = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          if (ts.isPropertyAccessExpression(node.expression) && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword) targets.add(node.expression.name.text);
          if (ts.isIdentifier(node.expression) && node.expression.text === 'sqliteSave') targets.add('writeRaw');
        }
        ts.forEachChild(node, scan);
      };
      if (method.body) scan(method.body);
      calls.set(method.name.getText(source), targets);
    }
    const writers = new Set(['writeRaw', 'addNotificationInternal']);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, targets] of calls) if (!writers.has(name) && [...targets].some(target => writers.has(target))) { writers.add(name); changed = true; }
    }
    const unowned = methods.filter(method => method.modifiers?.some(m => m.kind === ts.SyntaxKind.PublicKeyword) && writers.has(method.name.getText(source)) && !method.body?.getText(source).includes('return runLegacyCommand(')).map(m => m.name.getText(source));
    expect(unowned).toEqual([]);
    expect(writers.has('saveTask')).toBe(true);
    expect(writers.has('approveTaskCompletion')).toBe(true);
    expect(writers.has('redeemRewardItem')).toBe(true);
  });
});
