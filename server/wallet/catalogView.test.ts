import { it, expect, vi } from 'vitest';
import { readWalletCatalog } from './catalogView.js';
const actor = { userId: 'adult', role: 'member' as const };
function fixture() {
    const reader: any = { legacy: { users: [{ id: 'adult', role: 'member' }] }, get: vi.fn(() => ({ value: '1' })), all: vi.fn((sql: string) => sql.includes('wallet_categories') ? [{ id: 'cat', parentId: null, name: 'Synthetic category', nature: 'need', archivedAt: null, hidden: 0, revision: 1, icon: '', color: '' }] : [{ id: 'label', name: 'Synthetic label', archivedAt: null, hidden: 1, revision: 2, icon: '', color: '' }]) };
    return reader;
}
it('returns adult family catalog metadata including historical hidden choices without financial bodies', () => {
    const reader = fixture(), value = readWalletCatalog(reader, actor);
    expect(value).toEqual({ categories: [{ id: 'cat', parentId: null, name: 'Synthetic category', nature: 'need', archivedAt: null, hidden: false, revision: 1, icon: '', color: '' }], labels: [{ id: 'label', name: 'Synthetic label', archivedAt: null, hidden: true, revision: 2, icon: '', color: '' }] });
    expect(reader.all).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(value)).not.toMatch(/minor|balance|posting|token|createdBy/);
});
it.each(['child', 'guest', 'deleted', 'mismatched'])('rejects %s before any catalog read', kind => {
    const reader = fixture();
    reader.legacy.users[0] = { id: 'adult', role: kind === 'mismatched' ? 'admin' : kind === 'deleted' ? 'member' : kind, isDeleted: kind === 'deleted' };
    expect(() => readWalletCatalog(reader, actor)).toThrow();
    expect(reader.all).not.toHaveBeenCalled();
});
it('refuses inactive storage before catalog reads', () => { const reader = fixture(); reader.get.mockReturnValue({ value: '0' }); expect(() => readWalletCatalog(reader, actor)).toThrow(); expect(reader.all).not.toHaveBeenCalled(); });
it('rechecks current actor before returning a collected catalog', () => { const reader = fixture(); reader.all.mockImplementationOnce(() => { reader.legacy.users[0].isDeleted = true; return []; }); expect(() => readWalletCatalog(reader, actor)).toThrow(); });
it('uses an explicit catalog limit rather than reporting a truncated success', () => { const reader = fixture(); reader.all.mockReturnValue(Array.from({ length: 10001 }, (_, i) => ({ id: String(i) }))); expect(() => readWalletCatalog(reader, actor)).toThrow(); });
