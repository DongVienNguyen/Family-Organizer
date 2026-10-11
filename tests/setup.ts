import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect } from 'vitest';

// Setup runs before test imports, including the legacy ICS -> DB import chain.
// Every file gets disposable synthetic storage; no checkout data/.env is read.
const originalCwd = process.cwd();
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fo test synthetic '));
process.chdir(fixture);
const originalRoots = Object.fromEntries(["DATA_DIR", "APP_CODE_ROOT", "CONFIG_DIR", "LOG_DIR"].map(name => [name, process.env[name]]));
process.env.DATA_DIR = path.join(fixture, "data");
for (const name of ["APP_CODE_ROOT", "CONFIG_DIR", "LOG_DIR"]) delete process.env[name];
const originalFetch = globalThis.fetch;
const unexpectedRequests: string[] = [];
globalThis.fetch = async input => {
  unexpectedRequests.push(String(input));
  throw new Error('Tests must use an explicit offline fetch fixture');
};
for (const name of ['GEMINI_API_KEY', 'API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'GITHUB_TOKEN']) {
  delete process.env[name];
}

afterAll(async () => {
  try {
    if (fs.existsSync(path.join(fixture, 'data', 'family.db'))) {
      const { sqliteClose } = await import('../server/sqlite.js');
      sqliteClose();
    }
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalRoots)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  expect(fs.existsSync(fixture)).toBe(false);
  expect(unexpectedRequests, 'Unexpected external requests must be explicitly mocked').toEqual([]);
});
