import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { it, expect } from 'vitest';
import { createReceiptFiles } from './receiptFiles.js';
import { parseReceiptUpload, receiptMediaPath } from './receiptContract.js';
const id = 'b8ac02a3-655e-4d7d-9422-519b1403b270', png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), upload = () => parseReceiptUpload({ fileName: 'Hóa đơn synthetic.png', dataUrl: 'data:image/png;base64,' + png.toString('base64') });
function fixture(work: (root: string) => void) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet receipts données ')); try {
    work(root);
}
finally {
    fs.rmSync(root, { recursive: true });
} expect(fs.existsSync(root)).toBe(false); }
const metadata = (staged: any) => ({ ...staged, recordId: 'synthetic-record', createdAt: '2026-10-17T00:00:00.000Z', createdBy: 'synthetic-adult' });
it('stages an opaque private file, verifies bytes/hash and commits ownership without creating public metadata', () => fixture(root => {
    const store = createReceiptFiles({ dataRoot: root, newId: () => id }), staged = store.stage(upload());
    expect(staged).toMatchObject({ id, fileKey: id + '.png' });
    expect(store.read(metadata(staged))).toEqual({ bytes: png, mime: 'image/png' });
    expect(fs.readdirSync(root)).toEqual(['uploads']);
    store.commit(staged);
    expect(store.rollback(staged)).toBe(false);
    expect(fs.existsSync(path.join(root, 'uploads', receiptMediaPath(staged.fileKey)))).toBe(true);
}));
it('only an owned uncommitted stage can be rolled back', () => fixture(root => { const store = createReceiptFiles({ dataRoot: root, newId: () => id }), staged = store.stage(upload()), file = path.join(root, 'uploads', receiptMediaPath(staged.fileKey)); expect(store.rollback({ ...staged } as any)).toBe(false); expect(fs.existsSync(file)).toBe(true); expect(store.rollback(staged)).toBe(true); expect(fs.existsSync(file)).toBe(false); expect(store.rollback(staged)).toBe(false); }));
it('never overwrites or removes an existing filename on a generated-id collision', () => fixture(root => { const store = createReceiptFiles({ dataRoot: root, newId: () => id }), first = store.stage(upload()); store.commit(first); expect(() => store.stage(upload())).toThrow(); expect(store.read(metadata(first)).bytes).toEqual(png); }));
it.each(['after-open', 'after-write', 'after-sync'])('a fault at %s cleans only this uncommitted ordinary file', phase => fixture(root => { const store = createReceiptFiles({ dataRoot: root, newId: () => id, onBoundary: at => { if (at === phase)
        throw Error('Synthetic write fault'); } }); expect(() => store.stage(upload())).toThrow('Synthetic write fault'); const file = path.join(root, 'uploads', receiptMediaPath(id + '.png')); expect(fs.existsSync(file)).toBe(false); }));
it('checks content after parsing and refuses a mutated buffer before writing files', () => fixture(root => { const store = createReceiptFiles({ dataRoot: root, newId: () => id }), parsed = upload(); parsed.bytes[0] = 0; expect(() => store.stage(parsed)).toThrow(); expect(fs.readdirSync(root)).toEqual([]); }));
it('rejects a linked directory instead of following it outside the receipt tree', () => fixture(root => { const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.mkdirSync(path.join(root, 'uploads')); const linked = path.join(root, 'uploads', 'wallet-receipts'); fs.symlinkSync(outside, linked, 'junction'); try {
    expect(() => createReceiptFiles({ dataRoot: root, newId: () => id }).stage(upload())).toThrow();
    expect(fs.readdirSync(outside)).toEqual([]);
}
finally {
    fs.unlinkSync(linked);
} }));
it('rejects hard links and tampered bytes without deleting either copy', () => fixture(root => { const store = createReceiptFiles({ dataRoot: root, newId: () => id }), staged = store.stage(upload()), file = path.join(root, 'uploads', receiptMediaPath(staged.fileKey)), copy = path.join(root, 'hardlink.png'); fs.linkSync(file, copy); expect(() => store.read(metadata(staged))).toThrow(); expect(store.rollback(staged)).toBe(false); fs.unlinkSync(copy); fs.writeFileSync(file, Buffer.from('foreign changed content')); expect(() => store.read(metadata(staged))).toThrow(); expect(store.rollback(staged)).toBe(false); expect(fs.readFileSync(file, 'utf8')).toBe('foreign changed content'); }));
it('rejects metadata/key/mime/checksum drift before serving bytes', () => fixture(root => { const store = createReceiptFiles({ dataRoot: root, newId: () => id }), staged = store.stage(upload()), saved = metadata(staged); for (const patch of [{ fileKey: '../outside.png' }, { mime: 'application/pdf' }, { sha256: '0'.repeat(64) }, { size: 1 }])
    expect(() => store.read({ ...saved, ...patch } as any)).toThrow(); expect(store.read(saved).bytes).toEqual(png); }));
it('factory/import creates no folders and rejects relative data roots', () => fixture(root => { const missing = path.join(root, 'not initialized'); createReceiptFiles({ dataRoot: missing }); expect(fs.existsSync(missing)).toBe(false); expect(() => createReceiptFiles({ dataRoot: 'relative-data' })).toThrow(); expect(() => createReceiptFiles({ dataRoot: root, newId: () => '../escape' }).stage(upload())).toThrow(); expect(fs.readdirSync(root)).toEqual([]); }));
