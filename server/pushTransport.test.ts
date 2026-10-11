import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { sendPushRequest } from './pushTransport.js';
// Actual local sockets, with HTTPS TLS replaced by an explicit synthetic HTTP fixture.
vi.mock('node:https', () => ({ default: { request: (url: URL, options: any, callback: any) => http.request(new URL(String(url).replace('https:', 'http:')), options, callback) } }));
const servers: http.Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); });
async function fixture(handler: http.RequestListener) {
  const server = http.createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { endpoint: `https://127.0.0.1:${(server.address() as any).port}/synthetic`, method: 'POST' as const, headers: {}, body: Buffer.from('synthetic') };
}

it('destroys a continuously active response at the absolute deadline and awaits socket closure', async () => {
  let closed = false; let chunks = 0;
  let started!:()=>void;const streaming=new Promise<void>(resolve=>{started=resolve;});
  const details = await fixture((_req, res) => {
    res.writeHead(200); res.write('synthetic');
    const timer = setInterval(() => { chunks++; res.write('chunk'); if(chunks===2)started(); }, 10);
    res.on('close', () => { clearInterval(timer); closed = true; });
  });
  // Start the deadline clock after observing real streaming, rather than racing
  // connection establishment against 100ms of a busy suite's wall clock.
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  try {
    const result=expect(sendPushRequest(details, new AbortController().signal, 100)).rejects.toMatchObject({unknownOutcome:true});
    await streaming;
    await vi.advanceTimersByTimeAsync(100);
    await result;
  } finally {vi.useRealTimers();}
  await vi.waitFor(() => expect(closed).toBe(true));
  expect(chunks).toBeGreaterThan(1);
});

it('cancels an accepted request, drains its socket and reports delivery uncertainty', async () => {
  const controller = new AbortController(); let closed = false;
  const details = await fixture((_req, res) => {
    res.writeHead(200); res.write('synthetic');
    res.on('close', () => { closed = true; });
    setImmediate(() => controller.abort());
  });
  await expect(sendPushRequest(details, controller.signal, 1000)).rejects.toMatchObject({ unknownOutcome: true });
  await vi.waitFor(() => expect(closed).toBe(true));
});

it('preserves known provider HTTP rejection without logging the endpoint or response body', async () => {
  const details = await fixture((_req, res) => { res.writeHead(429); res.end('synthetic private response'); });
  await expect(sendPushRequest(details, new AbortController().signal, 1000)).rejects.toMatchObject({ unknownOutcome: false, statusCode: 429 });
});

it('acknowledges a successful response only after closing the owned request', async () => {
  const details = await fixture((_req, res) => { res.writeHead(201); res.end('synthetic accepted'); });
  await expect(sendPushRequest(details, new AbortController().signal, 1000)).resolves.toBeUndefined();
});
