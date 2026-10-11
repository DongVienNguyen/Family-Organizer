import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
describe('native maintenance scripts', () => {
  let fixture: string;
  let codeRoot: string;
  let foreignCwd: string;
  const run = (script: string, args: string[] = []) => spawnSync(process.execPath, [path.join(codeRoot, 'scripts', script), ...args], { cwd: foreignCwd, encoding: 'utf8' });
  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fo scripts tiếng Việt '));
    codeRoot = path.join(fixture, 'code root');
    foreignCwd = path.join(fixture, 'foreign cwd');
    fs.mkdirSync(path.join(codeRoot, 'scripts'), { recursive: true });
    fs.mkdirSync(foreignCwd);
    fs.writeFileSync(path.join(codeRoot, 'package.json'), JSON.stringify({ name: 'react-example', version: '1.1.0' }));
    for (const script of ['clean.mjs', 'release-notes.mjs']) {
      const source = path.join(repoRoot, 'scripts', script);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(codeRoot, 'scripts', script));
    }
  });
  afterEach(() => fs.rmSync(fixture, { recursive: true, force: true }));

  it('cleans only verified build targets under its code root and preserves data and foreign cwd', () => {
    for (const root of [codeRoot, foreignCwd]) {
      for (const dir of ['dist', 'data', 'releases']) {
        fs.mkdirSync(path.join(root, dir));
        fs.writeFileSync(path.join(root, dir, 'keep.txt'), 'synthetic');
      }
      fs.writeFileSync(path.join(root, 'server.js'), 'old build');
    }
    const result = run('clean.mjs');
    expect(result.status, result.stderr).toBe(0);
    expect(fs.existsSync(path.join(codeRoot, 'dist'))).toBe(false);
    expect(fs.existsSync(path.join(codeRoot, 'server.js'))).toBe(false);
    for (const target of [path.join(codeRoot, 'data', 'keep.txt'), path.join(codeRoot, 'releases', 'keep.txt'), path.join(foreignCwd, 'dist', 'keep.txt'), path.join(foreignCwd, 'server.js')]) expect(fs.existsSync(target)).toBe(true);
  });

  it('refuses a linked build target without touching the external directory', () => {
    fs.writeFileSync(path.join(foreignCwd, 'preserve.txt'), 'external');
    fs.symlinkSync(foreignCwd, path.join(codeRoot, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = run('clean.mjs');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/link|reparse/i);
    expect(fs.readFileSync(path.join(foreignCwd, 'preserve.txt'), 'utf8')).toBe('external');
  });

  it('extracts exactly the selected changelog section without modifying version or creating a release', () => {
    const changelog = '# Changelog\n\n## [1.1.0] - 2026-10-11\n\n- Giữ chức năng.\n\n## [1.0.0] - 2026-01-01\n\n- Cũ.\n';
    fs.writeFileSync(path.join(codeRoot, 'CHANGELOG.md'), changelog);
    const result = run('release-notes.mjs', ['1.1.0']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('## [1.1.0] - 2026-10-11\n\n- Giữ chức năng.\n');
    expect(JSON.parse(fs.readFileSync(path.join(codeRoot, 'package.json'), 'utf8')).version).toBe('1.1.0');
    expect(fs.readFileSync(path.join(codeRoot, 'CHANGELOG.md'), 'utf8')).toBe(changelog);
    expect(run('release-notes.mjs', ['9.9.9']).status).not.toBe(0);
    expect(run('release-notes.mjs', ['$(unsafe)']).status).not.toBe(0);
  });
});
