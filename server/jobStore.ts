import type { AppWriteTx } from './appStore.js';
export type AppJobKind = 'command' | 'effect' | 'schedule';
export interface AppJobInput { namespace: string; type: string; key: string; payload: unknown; kind?: AppJobKind; availableAt?: number; maxAttempts?: number }
export interface AppJobLease { id: string; namespace: string; type: string; key: string; payload: any; kind: AppJobKind; token: string; until: number; attempt: number }
export function enqueueAppJob(_tx: AppWriteTx, _input: AppJobInput): string { throw new Error('Durable job queue not implemented'); }
export class AppJobStore {
  enqueue(_input: AppJobInput): string { throw new Error('Durable job queue not implemented'); }
  claim(_namespace: string, _type: string, _now: number, _leaseMs: number): AppJobLease | undefined { throw new Error('Job leases not implemented'); }
  complete(_job: AppJobLease, _now: number): boolean { throw new Error('Job lease fencing not implemented'); }
  fail(_job: AppJobLease, _now: number, _code = 'handler-failed', _unknownOutcome = false): boolean { throw new Error('Job retry not implemented'); }
  renew(_job: AppJobLease, _now: number, _leaseMs: number): boolean { throw new Error('Job lease renewal not implemented'); }
  nextDue(_namespace: string, _type: string): number | undefined { throw new Error('Durable scheduling not implemented'); }
  restorePolicy(_tx: AppWriteTx, _now: number): void { throw new Error('Job restore policy not implemented'); }
}
