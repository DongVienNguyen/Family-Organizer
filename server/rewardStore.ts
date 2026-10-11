import type { AppWriteTx } from './appStore.js';
import type { RewardPointEntry } from '../src/types.js';
import { AppStoreError } from './appStore.js';
import { createHash, randomUUID } from 'node:crypto';
export interface CompletionGrant { claimId: string; taskId: string; userId: string; points: number; actorId: string; reason: string }
export class RewardStoreTx {
  constructor(private tx: AppWriteTx) {
    tx.exec(`CREATE TABLE IF NOT EXISTS app_reward_claims (
      claim_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL,
      grant_entry_id TEXT NOT NULL, reverse_entry_id TEXT
    )`);
  }
  applyCompletionGrant(grant: CompletionGrant): RewardPointEntry {
    if (!grant.claimId || !grant.taskId || !grant.actorId || !Number.isSafeInteger(grant.points) || grant.points <= 0) throw new AppStoreError('Invalid completion grant', 400);
    if (!this.tx.legacy.users.some(user => user.id === grant.userId)) throw new AppStoreError('Reward recipient does not exist', 404);
    const hash = createHash('sha256').update(JSON.stringify([grant.taskId, grant.userId, grant.points, grant.actorId, grant.reason])).digest('hex');
    const prior = this.tx.get('SELECT payload_hash, grant_entry_id FROM app_reward_claims WHERE claim_id = ?', grant.claimId);
    if (prior) {
      if (prior.payload_hash !== hash) throw new AppStoreError('Completion claim conflict', 409);
      return this.requireEntry(prior.grant_entry_id);
    }
    const entry = this.entry(grant.userId, grant.taskId, grant.points, grant.actorId, grant.reason);
    this.tx.legacy.rewardLedger.unshift(entry);
    this.tx.run('INSERT INTO app_reward_claims (claim_id, payload_hash, grant_entry_id) VALUES (?, ?, ?)', grant.claimId, hash, entry.id);
    return entry;
  }
  applyCompletionReverse(claimId: string, actorId: string): RewardPointEntry {
    const claim = this.tx.get('SELECT grant_entry_id, reverse_entry_id FROM app_reward_claims WHERE claim_id = ?', claimId);
    if (!claim) throw new AppStoreError('Completion claim does not exist', 404);
    if (!actorId) throw new AppStoreError('Reversal actor is required', 400);
    if (claim.reverse_entry_id) return this.requireEntry(claim.reverse_entry_id);
    const grant = this.requireEntry(claim.grant_entry_id);
    const reverse = this.entry(grant.userId, grant.taskId, -grant.points, actorId, `Reverse: ${grant.reason}`);
    this.tx.legacy.rewardLedger.unshift(reverse);
    this.tx.run('UPDATE app_reward_claims SET reverse_entry_id = ? WHERE claim_id = ?', reverse.id, claimId);
    return reverse;
  }
  private requireEntry(id: string): RewardPointEntry {
    const entry = this.tx.legacy.rewardLedger.find(entry => entry.id === id);
    if (!entry) throw new AppStoreError('Completion claim has no canonical reward entry', 409);
    return entry;
  }
  private entry(userId: string, taskId: string | undefined, points: number, actorId: string, reason: string): RewardPointEntry {
    return { id: `reward_${Date.now()}_${randomUUID()}`, userId, taskId, points, reason, createdById: actorId, createdAt: new Date().toISOString() };
  }
}
