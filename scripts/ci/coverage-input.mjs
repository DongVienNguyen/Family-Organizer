import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const coverageMetrics = ['lines', 'statements', 'functions', 'branches'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function productionSources(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Source inventory contains a symlink');
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$|\.d\.ts$/.test(entry.name)) {
        const bytes = fs.readFileSync(absolute);
        if (/\/(?:\*+|\/)\s*(?:v8|c8|istanbul|node:coverage)\s+ignore\b/i.test(bytes.toString('utf8'))) throw new Error('Undeclared coverage exclusion pragma');
        files.push({ path: path.relative(root, absolute).replaceAll('\\', '/'), sha256: sha256(bytes) });
      }
    }
  }
  for (const name of ['src', 'server']) walk(path.join(root, name));
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
export function readCoverageInputs(root, reportDirectory) {
  const normalize = file => path.relative(root, path.resolve(root, file)).replaceAll('\\', '/');
  const read = name => JSON.parse(fs.readFileSync(path.join(reportDirectory, name), 'utf8'));
  const summary = Object.fromEntries(Object.entries(read('coverage-summary.json')).map(([key, value]) => [key === 'total' ? key : normalize(key), value]));
  const full = Object.fromEntries(Object.entries(read('coverage-final.json')).map(([key, value]) => [normalize(key), { ...value, path: normalize(value.path) }]));
  const sourceInventory = productionSources(root);
  return { summary, full, sourceFiles: sourceInventory.map(file => file.path), sourceInventory, lcov: fs.readFileSync(path.join(reportDirectory, 'lcov.info'), 'utf8') };
}
