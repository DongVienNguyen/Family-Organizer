import type { Actor } from '../../src/features/wallet/contracts.js';
import { assertWalletActor, type WalletReader } from './access.js';
import { AppStoreError } from '../appErrors.js';
import { text, choice, integer } from '../../src/features/productivity/validation.js';
export interface WalletCatalogItem {
    id: string;
    name: string;
    archivedAt: string | null;
    hidden: boolean;
    revision: number;
    icon: string;
    color: string;
}
export interface WalletCategoryView extends WalletCatalogItem {
    parentId: string | null;
    nature: 'must' | 'need' | 'want' | 'unspecified';
}
export interface WalletCatalog {
    categories: WalletCategoryView[];
    labels: WalletCatalogItem[];
}
/** Family-wide adult catalog definitions; hidden/archived names are retained for
 * historical associations. Financial commands still authorize new selections. */
export function readWalletCatalog(reader: WalletReader, actor: Actor): WalletCatalog {
    const guard = () => { assertWalletActor(reader, actor); if (reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value !== '1')
        throw new AppStoreError('Wallet chưa sẵn sàng.', 409); };
    guard();
    const categories = reader.all('SELECT c.id,c.parent_id AS parentId,c.name,c.nature,c.archived_at AS archivedAt,m.hidden,m.revision,m.icon,m.color FROM wallet_categories c LEFT JOIN wallet_category_metadata m ON m.category_id=c.id ORDER BY c.id LIMIT 10001');
    const labels = reader.all('SELECT l.id,l.name,l.archived_at AS archivedAt,m.hidden,m.revision,m.icon,m.color FROM wallet_labels l LEFT JOIN wallet_label_metadata m ON m.label_id=l.id ORDER BY l.id LIMIT 10001');
    if (categories.length > 10000 || labels.length > 10000)
        throw new AppStoreError('Danh mục vượt giới hạn tải.', 422, 'LIMIT_EXCEEDED');
    const item = (row: any): WalletCatalogItem => { text(row.id, 256); text(row.name, 500); text(row.icon, 256, false); text(row.color, 256, false); integer(row.revision, 1); if (row.hidden !== 0 && row.hidden !== 1)
        throw Error('Invalid catalog flag'); if (row.archivedAt !== null) {
        text(row.archivedAt, 24);
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.archivedAt) || !Number.isFinite(Date.parse(row.archivedAt)) || new Date(row.archivedAt).toISOString() !== row.archivedAt)
            throw Error('Invalid catalog time');
    } return { id: row.id, name: row.name, archivedAt: row.archivedAt, hidden: row.hidden === 1, revision: row.revision, icon: row.icon, color: row.color }; };
    const result = { categories: categories.map(row => { if (row.parentId !== null)
            text(row.parentId, 256); choice(row.nature, ['must', 'need', 'want', 'unspecified']); return { ...item(row), parentId: row.parentId, nature: row.nature } as WalletCategoryView; }), labels: labels.map(item) };
    guard();
    return result;
}
