import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../scripts/ci/browser-providers.cjs', import.meta.url), 'utf8');
function adapter() {
  const calls: string[] = [], blocked: string[] = [];
  const sandbox: any = { URL, Response, process: { env: { FO_BROWSER_PROVIDER_FIXTURES: 'synthetic-file' } }, require: () => ({ appendFileSync: (_file: string, line: string) => calls.push(line) }), fetch: async (url: string) => { blocked.push(url); throw new Error('blocked synthetic request'); } };
  vm.runInNewContext(source, sandbox);
  return { fetch: sandbox.fetch, calls, blocked };
}
it.each([
  'https://api.open-meteo.com/v1/forecast?latitude=10&longitude=106',
  'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson',
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum',
  'https://open.er-api.com/v6/latest/USD',
  'https://www.vang.today/api/prices?type=SJL1L10',
])('supplies offline dashboard GET fixture %s', async url => {
  const fixture = adapter(), result = await fixture.fetch(url);
  expect(result.status).toBe(200); expect(await result.json()).toBeTruthy();
  expect(fixture.calls).toHaveLength(1); expect(fixture.blocked).toEqual([]);
});
it.each([
  ['https://api.telegram.org/botsynthetic/sendMessage', {}],
  ['https://api.open-meteo.com/v1/forecast', { method: 'POST' }],
  ['http://api.open-meteo.com/v1/forecast', {}],
  ['https://api.open-meteo.com:444/v1/forecast', {}],
])('retains external-delivery block for %s', async (url, init) => {
  const fixture = adapter();
  await expect(fixture.fetch(url, init)).rejects.toThrow('blocked synthetic request');
  expect(fixture.calls).toEqual([]); expect(fixture.blocked).toHaveLength(1);
});
