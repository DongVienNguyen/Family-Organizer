// Loaded only by the synthetic production probe, never by normal app startup.
const fs = require('node:fs');
function block(url) {
  fs.appendFileSync(process.env.FO_NETWORK_ATTEMPTS, JSON.stringify(String(url)) + '\n');
  throw new Error('Synthetic production tests prohibit external network access');
}
globalThis.fetch = async input => block(input);
for (const name of ['node:http', 'node:https']) {
  const module = require(name);
  for (const method of ['request', 'get']) {
    const original = module[method];
    module[method] = function (input, ...args) {
      const hostname = typeof input === 'string' || input instanceof URL
        ? new URL(input).hostname : input?.hostname || input?.host || 'localhost';
      if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) return block(hostname);
      return original.call(this, input, ...args);
    };
  }
}
