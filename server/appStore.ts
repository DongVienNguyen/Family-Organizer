import type { FamilyOrganizerDB } from '../src/types.js';
export interface AppWriteTx {
  legacy: FamilyOrganizerDB;
  exec(sql: string): void;
  run(sql: string, ...parameters: any[]): any;
  get(sql: string, ...parameters: any[]): any;
  all(sql: string, ...parameters: any[]): any[];
  afterCommit(effect: () => unknown): void;
}
export interface AppWriteMetadata { actorId: string; command: string; requestId: string; payloadHash: string }
export class AppStoreError extends Error { constructor(message: string, public status = 409) { super(message); } }
export function withAppWriteTransaction<T>(_meta: AppWriteMetadata, _fn: (tx: AppWriteTx) => T): T {
  throw new Error('Application write gateway not implemented');
}
