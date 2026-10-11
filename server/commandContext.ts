import { AsyncLocalStorage } from 'node:async_hooks';

export interface AppCommandContext { actorId: string; requestId: string; assertWriteOwnership?: () => void }
const context = new AsyncLocalStorage<AppCommandContext>();
export function withAppCommandContext<T>(value: AppCommandContext, fn: () => T): T {
  return context.run(value, fn);
}
export function getAppCommandContext(): AppCommandContext | undefined { return context.getStore(); }
