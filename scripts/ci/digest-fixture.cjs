// Synthetic production probe preload only; never loaded by normal startup/package.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const blockedFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (String(input) !== 'https://api.telegram.org/botsynthetic-compiled-digest-token/sendMessage') return blockedFetch(input, options);
  assert.equal(options.method, 'POST');
  const body = JSON.parse(options.body);
  assert.equal(body.chat_id, 'synthetic-compiled-digest-chat');
  assert.equal(body.parse_mode, 'HTML');
  assert.equal(typeof body.text, 'string');
  assert.ok(body.text.length > 0 && body.text.length <= 4096);
  fs.appendFileSync(process.env.FO_DIGEST_CAPTURE, JSON.stringify(body) + '\n');
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};
