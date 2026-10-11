import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect } from 'vitest';

// Setup runs before test imports, including the legacy ICS -> DB import chain.
// Every file gets disposable synthetic storage; no checkout data/.env is read.
const originalCwd = process.cwd();
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fo test synthetic '));
process.chdir(fixture);
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
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  expect(fs.existsSync(fixture)).toBe(false);
  expect(unexpectedRequests, 'Unexpected external requests must be explicitly mocked').toEqual([]);
});
