// Synthetic browser harness preload only; normal runtime never loads this file.
// The earlier block-network preload remains the fallback for every other URL.
const fs = require('node:fs');
const blocked = globalThis.fetch;
const fixtures = new Map([
  ['api.open-meteo.com/v1/forecast', { current: { temperature_2m: 25, relative_humidity_2m: 60, weather_code: 0, wind_speed_10m: 1, wind_gusts_10m: 1, precipitation: 0 }, daily: { time: ['2026-10-12'], weather_code: [0], temperature_2m_max: [27], temperature_2m_min: [23], uv_index_max: [1], precipitation_probability_max: [0], wind_gusts_10m_max: [1] } }],
  ['earthquake.usgs.gov/fdsnws/event/1/query', { features: [] }],
  ['api.coingecko.com/api/v3/simple/price', { bitcoin: { usd: 100, vnd: 2500000, usd_24h_change: 0 }, ethereum: { usd: 10, vnd: 250000, usd_24h_change: 0 } }],
  ['open.er-api.com/v6/latest/USD', { rates: { VND: 25000 }, time_last_update_utc: 'synthetic fixed fixture' }],
]);
globalThis.fetch = async (input, init = {}) => {
  let url;
  try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); } catch { return blocked(input, init); }
  const method = String(init.method || input.method || 'GET').toUpperCase();
  const key = url.hostname + url.pathname;
  let payload = fixtures.get(key);
  if (key === 'www.vang.today/api/prices' && ['SJL1L10', 'XAUUSD'].includes(url.searchParams.get('type'))) payload = { type: url.searchParams.get('type'), buy: 1000000, sell: 1100000, update_time: 'synthetic fixed fixture' };
  if(key==='api.frankfurter.dev/v2/rate/USD/VND'&&/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date')??'')&&[...url.searchParams.keys()].length===1)payload={date:url.searchParams.get('date'),base:'USD',quote:'VND',rate:25000};
  if (url.protocol !== 'https:' || url.port || url.username || url.password || method !== 'GET' || !payload) return blocked(input, init);
  if (init.signal?.aborted) throw init.signal.reason;
  fs.appendFileSync(process.env.FO_BROWSER_PROVIDER_FIXTURES, key + '\n');
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
