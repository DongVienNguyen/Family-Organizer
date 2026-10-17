import { it, expect } from 'vitest';
import { createWalletApi } from './api.js';
const item = { id: 'cat', name: 'Synthetic category', archivedAt: null, hidden: false, revision: 1, icon: '', color: '' };
const catalog = () => ({ categories: [{ ...item, parentId: null, nature: 'need' }], labels: [{ ...item, id: 'label', hidden: true }] });
const client = (body: unknown) => createWalletApi({ request: async (path) => { expect(path).toBe('/api/wallet/catalog'); return new Response(JSON.stringify(body)); }, authHeaders: () => ({ Authorization: 'Bearer synthetic-only' }) }) as any;
it('decodes family catalog definitions without reflecting unexpected financial/provenance fields', async () => {
    const value = catalog();
    Object.assign(value.categories[0], { openingMinor: '9007199254740993', createdBy: 'synthetic-hidden' });
    expect(await client(value).catalog()).toEqual(catalog());
});
it.each(['duplicate', 'missing-parent', 'cycle', 'bad-hidden', 'bad-revision', 'bad-time', 'bad-nature', 'oversized'])('rejects invalid catalog %s as a read error', async (kind) => {
    const value: any = catalog();
    if (kind === 'duplicate')
        value.labels.push(value.labels[0]);
    if (kind === 'missing-parent')
        value.categories[0].parentId = 'missing';
    if (kind === 'cycle')
        value.categories[0].parentId = 'cat';
    if (kind === 'bad-hidden')
        value.categories[0].hidden = 1;
    if (kind === 'bad-revision')
        value.labels[0].revision = 0;
    if (kind === 'bad-time')
        value.labels[0].archivedAt = '2026-02-30T00:00:00.000Z';
    if (kind === 'bad-nature')
        value.categories[0].nature = 'other';
    if (kind === 'oversized')
        value.labels = Array(10001).fill(value.labels[0]);
    await expect(client(value).catalog()).rejects.toMatchObject({ code: 'INVALID_RESPONSE', unknownOutcome: false });
});
