import type { AppWriteTx } from './appStore.js';
export interface AppSnapshot { manifest: any; legacy: any; tables: Record<string, any[]>; settings: Record<string,string>; media: Record<string,string> }
export type ValidatedAppSnapshot = AppSnapshot;
export interface RestoreOptions { maintenance: <T>(work: () => Promise<T>) => Promise<T>; onBoundary?: (phase: string) => void }
export function registerSnapshotTable(_namespace: string, _table: string, _columns: readonly string[]): void { throw new Error('Shared snapshot registry is not implemented'); }
export function collectAppSnapshot(_tx: AppWriteTx): AppSnapshot { throw new Error('Shared snapshot collection is not implemented'); }
export function validateAppSnapshot(_input: unknown): ValidatedAppSnapshot { throw new Error('Shared snapshot validation is not implemented'); }
export async function restoreAppSnapshot(_snapshot: ValidatedAppSnapshot, _options: RestoreOptions): Promise<{ restoredFiles: number }> { throw new Error('Coordinated snapshot restore is not implemented'); }
export function recoverAppRestore(): void { throw new Error('Restore journal recovery is not implemented'); }
