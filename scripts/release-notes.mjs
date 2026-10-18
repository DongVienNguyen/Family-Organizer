import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (process.argv.length !== 3 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || '')) {
  throw new Error('Usage: npm run release:notes -- X.Y.Z');
}
const changelog = fs.readFileSync(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)), 'utf8').replaceAll('\r\n', '\n');
const headings = [...changelog.matchAll(/^## .*$/gm)];
const selected = headings.findIndex(heading => heading[0].match(/^## \[([^\]]+)\]/)?.[1] === version);
if (selected === -1) throw new Error(`CHANGELOG.md has no section for ${version}`);
const begin = headings[selected].index;
const end = headings[selected + 1]?.index ?? changelog.length;
process.stdout.write(changelog.slice(begin, end).trimEnd() + '\n');
