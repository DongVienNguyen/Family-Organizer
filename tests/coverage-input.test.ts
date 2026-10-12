import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expect, it } from 'vitest';
import { productionSources } from '../scripts/ci/coverage-input.mjs';

function fixture(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage source dữ liệu '));
  for (const name of ['src', 'server']) fs.mkdirSync(path.join(root, name));
  try { run(root); } finally { fs.rmSync(root, { recursive: true }); }
}
it('accounts for unexecuted source, excludes test/type declarations and hashes actual bytes', () => fixture(root => {
  fs.writeFileSync(path.join(root, 'src/unexecuted.tsx'), 'export const synthetic = 1;');
  fs.writeFileSync(path.join(root, 'src/ignored.test.ts'), 'synthetic test only');
  fs.writeFileSync(path.join(root, 'src/types.d.ts'), 'declare const synthetic: number;');
  fs.writeFileSync(path.join(root, 'server/runtime.ts'), 'export const synthetic = 2;');
  const first = productionSources(root);
  expect(first.map(file => file.path)).toEqual(['server/runtime.ts', 'src/unexecuted.tsx']);
  fs.writeFileSync(path.join(root, 'src/unexecuted.tsx'), 'export const synthetic = 3;');
  expect(productionSources(root)[1].sha256).not.toBe(first[1].sha256);
}));
it.each(['v8', 'c8', 'istanbul'])('rejects undeclared %s coverage exclusions', pragma => fixture(root => {
  fs.writeFileSync(path.join(root, 'server/runtime.ts'), `/* ${pragma} ignore next */\nexport const synthetic = 1;`);
  expect(() => productionSources(root)).toThrow('Undeclared coverage exclusion');
}));
it('rejects a linked source directory rather than silently shrinking the inventory', () => fixture(root => {
  fs.mkdirSync(path.join(root, 'outside'));
  fs.writeFileSync(path.join(root, 'outside/missing.ts'), 'export const synthetic = 1;');
  fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'src/linked'), 'junction');
  expect(() => productionSources(root)).toThrow('Source inventory contains a symlink');
}));
