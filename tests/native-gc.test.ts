import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('survives allocation-driven SQLite statement finalization without a native abort', () => {
  const result = spawnSync(process.execPath, ['--max-old-space-size=64', '--max-semi-space-size=8', fileURLToPath(new URL('../scripts/ci/probe-native-gc.mjs', import.meta.url))], { encoding: 'utf8', timeout: 15_000 });
  expect(result.error, JSON.stringify({code:(result.error as NodeJS.ErrnoException|undefined)?.code,status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr})).toBeUndefined();
  expect(result.signal, result.stderr).toBeNull();
  expect(result.status, result.stderr).toBe(0);
  const stress=JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('native-gc-stress '))?.slice('native-gc-stress '.length) || '{}');
  expect(stress.iterations).toBe(300_000);
  expect(stress.heapLimitBytes).toBeGreaterThan(0);
  expect(stress.heapLimitBytes).toBeLessThanOrEqual(128*1024*1024);
  expect(stress.explicitGcAvailable).toBe(false);
  expect(result.stdout).toContain('allocation-driven native statement cleanup passed');
}, 20_000);
