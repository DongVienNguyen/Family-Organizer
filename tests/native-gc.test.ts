import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('survives allocation-driven SQLite statement finalization without a native abort', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/ci/probe-native-gc.mjs', import.meta.url))], { encoding: 'utf8', timeout: 15_000 });
  expect(result.error).toBeUndefined();
  expect(result.signal, result.stderr).toBeNull();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('allocation-driven native statement cleanup passed');
}, 20_000);
