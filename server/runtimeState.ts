export interface RuntimeState {
  phase: 'created' | 'starting' | 'ready' | 'maintenance' | 'draining' | 'stopped' | 'failed';
  migrating?: boolean;
  storageWritable: boolean;
}
export function isReady(state: RuntimeState): boolean {
  return state.phase === 'ready' && state.storageWritable && !state.migrating;
}
