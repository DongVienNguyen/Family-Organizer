import type { AppWriteTx } from './appStore.js';
export function registerDomainMigration(_namespace: string, _version: number, _fn: (tx: AppWriteTx) => void, _checksum?: string): void {
  throw new Error('Migration registry not implemented');
}
export function applyDomainMigrations(_options: { enabled: string[]; pilot: boolean }): void {
  throw new Error('Migration registry not implemented');
}
export function getDomainVersions(): Record<string, number> { throw new Error('Migration registry not implemented'); }
