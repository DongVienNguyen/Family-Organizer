import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.name !== 'react-example') throw new Error('Unrecognized project root');
if (process.argv.length !== 2) throw new Error('clean accepts no external target path');
const targets = ['dist', 'server.js'].map(name => path.join(root, name));
// Preflight all targets before the first deletion, including junction/reparse targets.
for (const target of targets) {
  if (!fs.existsSync(target) && !fs.lstatSync(target, { throwIfNoEntry: false })) continue;
  if (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== target) {
    throw new Error('Refusing linked/reparse build target');
  }
}
for (const target of targets) fs.rmSync(target, { recursive: true, force: true });
console.log('Removed verified build outputs: dist, server.js');
