import { it, expect } from 'vitest';
import { createWalletApi } from './api.js';
const nonce = 'synthetic-bulk-sdk-key', id = 'synthetic-bulk-sdk-selection', record = 'synthetic-bulk-sdk-record', filter = { period: { fromDate: '2026-10-01', toDateExclusive: '2026-11-01', timezone: 'Asia/Saigon' }, referenceCurrency: 'VND' }, selection = { selectionId: id, filter };
const summary = () => ({ id, count: 1, revision: 1, state: 'ready', sourceKind: 'filter', createdAt: '2026-10-17T01:00:00.000Z', expiresAt: '2026-10-17T01:15:00.000Z' }), ack = () => ({ matched: 1, updated: 1, unchanged: 0, selectionId: id, selectionRevision: 2 });
const state = (revision = 1) => ({ revision, categoryId: null, settlementStatus: 'cleared', note: 'Synthetic note', payee: 'Synthetic shop', labelIds: [], noteTruncated: false });
const preview = () => ({ matched: 1, updated: 1, unchanged: 0, intentHash: 'a'.repeat(64), samples: [{ id: record, before: state(), after: { ...state(2), note: 'Synthetic changed' } }] });
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }), client = (value: unknown) => createWalletApi({ request: async () => response(value), authHeaders: () => ({ Authorization: 'Bearer synthetic-offline' }) });
it('uses existing same-origin transport and explicit nonce for snapshot/apply; preview/membership remain read-only', async () => { const calls: any[] = [], api = createWalletApi({ request: async (path, options) => { calls.push({ path, options }); return response(String(path).endsWith('/members') ? { ids: [record] } : String(path).endsWith('bulk-preview') ? preview() : String(path).endsWith('bulk-metadata') ? ack() : summary()); }, authHeaders: () => ({ Authorization: 'Bearer synthetic-offline' }) }); expect(await api.createSelection({ filter }, nonce)).toEqual(summary()); expect(await api.selectionMembers(id, [record])).toEqual([record]); expect(await api.bulkPreview(selection, { note: 'Synthetic changed' })).toEqual(preview()); expect(await api.bulkMetadata(selection, 1, { note: 'Synthetic changed' }, nonce)).toEqual(ack()); for (const call of calls) {
    expect(call.options.cache).toBe('no-store');
    expect(call.options.redirect).toBe('error');
    expect(new Headers(call.options.headers).get('Authorization')).toBe('Bearer synthetic-offline');
} expect(new Headers(calls[0].options.headers).get('x-request-id')).toBe(nonce); expect(new Headers(calls[3].options.headers).get('x-request-id')).toBe(nonce); expect(JSON.parse(calls[3].options.body)).toEqual({ expectedRevision: 1, selection, patch: { note: 'Synthetic changed' } }); });
it.each(['count', 'state', 'expiry', 'extra'])('refuses invalid snapshot %s as unknown write outcome', async (kind) => { const value: any = summary(); if (kind === 'count')
    value.count = -1; if (kind === 'state')
    value.revision = 2; if (kind === 'expiry')
    value.expiresAt = value.createdAt; if (kind === 'extra')
    value.note = 'Synthetic unexpected'; await expect(client(value).createSelection({ filter }, nonce)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', unknownOutcome: true, requestId: nonce }); });
it.each(['counts', 'identity', 'revision', 'extra'])('invalid bulk acknowledgement %s never resolves an unknown write', async (kind) => { const value: any = ack(); if (kind === 'counts')
    value.unchanged = 1; if (kind === 'identity')
    value.selectionId = 'synthetic-other'; if (kind === 'revision')
    value.selectionRevision = 1; if (kind === 'extra')
    value.records = []; await expect(client(value).bulkMetadata(selection, 1, { note: 'Synthetic changed' }, nonce)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', unknownOutcome: true, requestId: nonce }); });
it.each(['counts', 'missing-sample', 'duplicate', 'revision', 'oversize'])('rejects malformed read-only preview %s without making it an unknown mutation', async (kind) => { const value: any = preview(); if (kind === 'counts')
    value.updated = 2; if (kind === 'missing-sample')
    value.samples = []; if (kind === 'duplicate') {
    value.updated = value.matched = 2;
    value.samples.push(value.samples[0]);
} if (kind === 'revision')
    value.samples[0].after.revision = 1; if (kind === 'oversize')
    value.samples[0].before.note = 'x'.repeat(1001); await expect(client(value).bulkPreview(selection, { note: 'Synthetic changed' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', unknownOutcome: false }); });
it('refuses a membership ID outside requested loaded rows and invalidates it as a read error', async () => { await expect(client({ ids: ['synthetic-unrequested'] }).selectionMembers(id, [record])).rejects.toMatchObject({ code: 'INVALID_RESPONSE', unknownOutcome: false }); });
it('one dropped bulk acknowledgement stays unknown and does not automatically retry', async () => { let calls = 0; const api = createWalletApi({ request: async () => { calls++; throw Error('Synthetic lost acknowledgement'); }, authHeaders: () => ({ Authorization: 'Bearer synthetic-offline' }) }); await expect(api.bulkMetadata(selection, 1, { note: 'Synthetic changed' }, nonce)).rejects.toMatchObject({ unknownOutcome: true, requestId: nonce }); expect(calls).toBe(1); });

it('direct-ID acknowledgement and preview must cover exactly the requested records/revisions',async()=>{const direct={ids:[record],revisions:{[record]:1}};await expect(client({matched:0,updated:0,unchanged:0}).bulkMetadata(direct,0,{note:'Synthetic changed'},nonce)).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:true});const foreign=preview();foreign.samples[0].id='synthetic-unrequested';await expect(client(foreign).bulkPreview(direct,{note:'Synthetic changed'})).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:false});const stale=preview();stale.samples[0].before.revision=2;stale.samples[0].after.revision=3;await expect(client(stale).bulkPreview(direct,{note:'Synthetic changed'})).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:false});});
