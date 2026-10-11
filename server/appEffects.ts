const pending = new Set<Promise<void>>();

/** Detached legacy push callbacks can still write SQLite; retain their ownership. */
export function trackAppEffect<T>(effect: Promise<T>): Promise<T> {
  const observed = effect.then(() => {}, error => console.error('Background effect failed', error))
    .finally(() => { pending.delete(observed); });
  pending.add(observed);
  return effect;
}
export async function drainAppEffects(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}
