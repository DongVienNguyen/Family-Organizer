import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { FamilyDB } from './db.js';
import { createApp } from './app.js';
import { syntheticDependencies } from '../tests/app-fixture.js';
import { withAppWriteTransaction } from './appStore.js';

async function serve(test: (send: (route: string, body: any, requestId: string, token?: string) => Promise<{ status: number; body: any }>) => Promise<void>) {
  const user = FamilyDB.getUsers()[0];
  const dependencies = syntheticDependencies({ phase: 'ready', storageWritable: true });
  dependencies.db.FamilyDB = FamilyDB;
  const handle = await createApp({ production: true, codeRoot: process.cwd(), dataRoot: process.env.DATA_DIR! } as any, dependencies);
  const server = http.createServer(handle.app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const token = dependencies.auth.issue(user);
  const send = (route: string, body: any, requestId: string, auth = token) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const data = JSON.stringify(body);
    const request = http.request({ hostname: '127.0.0.1', port: (server.address() as any).port, path: route, method: 'POST', agent: false, headers: { Authorization: `Bearer ${auth}`, 'x-request-id': requestId, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, response => {
      let text = ''; response.on('data', part => { text += part; });
      response.on('end', () => resolve({ status: response.statusCode!, body: JSON.parse(text) }));
    });
    request.on('error', reject); request.end(data);
  });
  try { await test(send); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); await handle.drainHandlers(); await handle.dispose(); }
}

for (const [route, collection, create] of [
  ['/api/tasks', 'tasks', () => FamilyDB.saveTask({ title: 'Synthetic task', isShared: false }, FamilyDB.getUsers()[0].id, 'Synthetic')],
  ['/api/notes', 'notes', () => FamilyDB.saveNote({ title: 'Synthetic note', content: '', isShared: false }, FamilyDB.getUsers()[0].id, 'Synthetic')],
  ['/api/documents', 'documents', () => FamilyDB.saveDocument({ title: 'Synthetic document', type: 'other', files: [], isShared: false }, FamilyDB.getUsers()[0].id, 'Synthetic')],
] as const) {
  it(`retries ${route} after commit while retaining fresh-write conflicts and authentication`, async () => {
    const record = create();
    const base = '2026-01-01T00:00:00.000Z';
    withAppWriteTransaction({ actorId: 'synthetic', command: 'synthetic:timestamp', requestId: randomUUID(), payloadHash: 'fixture' }, tx => { tx.legacy[collection].find(item => item.id === record.id)!.updatedAt = base; });
    await serve(async send => {
      const body = { ...record, title: 'Synthetic saved update', baseUpdatedAt: base };
      const requestId = randomUUID();
      const first = await send(route, body, requestId);
      expect(first.status).toBe(200);
      expect(await send(route, body, requestId)).toEqual(first);
      const stale = await send(route, { ...body, title: 'Stale competing edit' }, randomUUID());
      expect(stale.status).toBe(409); expect(stale.body.conflict).toBe(true);
      expect((await send(route, body, requestId, 'invalid-synthetic-token')).status).toBe(401);
    });
  });
}

it('preserves typed 409 for a conflicting authenticated reward command', async () => {
  await serve(async send => {
    const requestId = randomUUID();
    const body = { userId: FamilyDB.getUsers()[0].id, points: 1, reason: 'Synthetic HTTP reward' };
    const first = await send('/api/rewards', body, requestId);
    expect(first.status).toBe(200);
    expect(await send('/api/rewards', body, requestId)).toEqual(first);
    expect((await send('/api/rewards', { ...body, points: 2 }, requestId)).status).toBe(409);
  });
});
