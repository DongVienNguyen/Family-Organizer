import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import { sqliteConnection } from '../sqlite.js';
import { configureWalletSql } from './sqlFunctions.js';
it('explicitly registers deterministic text metrics on the owned connection without schema or data mutation', () => {
    const db = sqliteConnection(), before = db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(), changes = db.prepare('SELECT total_changes() AS n').get();
    configureWalletSql(db);
    for (const text of ['', 'Synthetic 🧾\n']) {
        const row = db.prepare('SELECT fo_wallet_text_metrics(?) AS value').get(text) as any;
        expect(JSON.parse(row.value)).toEqual({ length: text.length, sha256: createHash('sha256').update(text).digest('hex') });
    }
    expect(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all()).toEqual(before);
    expect(db.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
});
it('registration is repeatable and refuses a nontext input rather than digesting a coerced value', () => { const db = sqliteConnection(); configureWalletSql(db); configureWalletSql(db); for (const value of [null, 12])
    expect(() => db.prepare('SELECT fo_wallet_text_metrics(?)').get(value)).toThrow(); expect(JSON.parse((db.prepare("SELECT fo_wallet_text_metrics('Synthetic') AS value").get() as any).value).length).toBe(9); });
it('generates distinct native audit IDs per row without a deterministic constant or persistent mutation', () => { const db = sqliteConnection(); configureWalletSql(db); const before = db.prepare('SELECT total_changes() AS n').get(), ids = (db.prepare('WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100) SELECT fo_wallet_uuid() AS id FROM n').all() as {
    id: string;
}[]).map(row => row.id); expect(new Set(ids).size).toBe(100); for (const id of ids)
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/); expect(db.prepare('SELECT total_changes() AS n').get()).toEqual(before); });
