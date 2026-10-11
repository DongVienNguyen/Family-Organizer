import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { withAppWriteTransaction } from './appStore.js';
import { RewardStoreTx } from './rewardStore.js';
import { FamilyDB } from './db.js';
import { sqliteLoad } from './sqlite.js';

const command = () => ({ actorId: 'synthetic', command: 'synthetic:reward', requestId: randomUUID(), payloadHash: createHash('sha256').update('fixture').digest('hex') });
it('grants and reverses a completion once in the existing canonical reward collection', () => {
  const userId = sqliteLoad().users[0].id;
  const before = FamilyDB.getRewardLedger().length;
  const claim = { claimId: randomUUID(), taskId: 'synthetic-task', userId, points: 5, actorId: userId, reason: 'Synthetic completion' };
  const grant = withAppWriteTransaction(command(), tx => new RewardStoreTx(tx).applyCompletionGrant(claim));
  const retry = withAppWriteTransaction(command(), tx => new RewardStoreTx(tx).applyCompletionGrant(claim));
  expect(retry).toEqual(grant);
  expect(grant).toMatchObject({ userId, taskId: claim.taskId, points: 5, createdById: userId });
  expect(grant.id).toMatch(/^reward_/);
  expect(FamilyDB.getRewardLedger()).toHaveLength(before + 1);
  const reverse = withAppWriteTransaction(command(), tx => new RewardStoreTx(tx).applyCompletionReverse(claim.claimId, userId));
  const reverseRetry = withAppWriteTransaction(command(), tx => new RewardStoreTx(tx).applyCompletionReverse(claim.claimId, userId));
  expect(reverseRetry).toEqual(reverse);
  expect(reverse.points).toBe(-5);
  expect(FamilyDB.getRewardLedger()).toHaveLength(before + 2);
  expect(FamilyDB.getRewardLedger().filter(e => e.id === grant.id || e.id === reverse.id).reduce((sum, e) => sum + e.points, 0)).toBe(0);
  expect(() => withAppWriteTransaction(command(), tx => new RewardStoreTx(tx).applyCompletionGrant({ ...claim, points: 6 }))).toThrow(/conflict/i);
});

it('rolls back a completion claim with its points and allows a successful retry', () => {
  const userId = sqliteLoad().users[0].id;
  const before = sqliteLoad();
  const claim = { claimId: randomUUID(), taskId: 'synthetic-abort', userId, points: 3, actorId: userId, reason: 'Synthetic abort' };
  expect(() => withAppWriteTransaction(command(), tx => { new RewardStoreTx(tx).applyCompletionGrant(claim); throw new Error('abort'); })).toThrow('abort');
  expect(sqliteLoad()).toEqual(before);
  const result = withAppWriteTransaction(command(), tx => new RewardStoreTx(tx).applyCompletionGrant(claim));
  expect(sqliteLoad().rewardLedger.some(e => e.id === result.id)).toBe(true);
});
