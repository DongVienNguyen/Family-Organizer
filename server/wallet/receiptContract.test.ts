import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { parseReceiptUpload, validateReceiptMetadata, receiptMediaPath } from './receiptContract.js';
const id = 'b8ac02a3-655e-4d7d-9422-519b1403b270', png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), url = (bytes: Buffer, mime = 'image/png') => 'data:' + mime + ';base64,' + bytes.toString('base64');
const metadata = () => ({ id, recordId: 'synthetic-record', fileKey: id + '.png', fileName: 'Hóa đơn synthetic.png', mime: 'image/png', size: png.length, sha256: createHash('sha256').update(png).digest('hex'), createdAt: '2026-10-17T00:00:00.000Z', createdBy: 'synthetic-adult' });
it('parses only local synthetic bytes, canonical filename and immutable size/hash', () => {
    const parsed = parseReceiptUpload({ fileName: 'Hóa đơn synthetic.PNG', dataUrl: url(png) });
    expect(parsed).toMatchObject({ fileName: 'Hóa đơn synthetic.PNG', mime: 'image/png', extension: 'png', size: 8, sha256: metadata().sha256 });
    expect(parsed.bytes).toEqual(png);
    expect(parseReceiptUpload({ fileName: 'Synthetic receipt', dataUrl: url(png) }).fileName).toBe('Synthetic receipt.png');
});
it.each(['../../receipt.png', 'C:\\receipt.png', 'receipt.png:stream', 'CON.png', 'LPT1.png', 'receipt\n.png', 'receipt\u202egnp.png', 'receipt.', 'receipt.jpg.exe'])('rejects unsafe or misleading filename %j', fileName => {
    expect(() => parseReceiptUpload({ fileName, dataUrl: url(png) })).toThrow();
});
it.each(['https://synthetic.invalid/receipt.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,PGh0bWwvPg==', 'data:image/png;base64,not base64', 'data:image/png;base64,iVBORw0KGgo=\n'])('rejects remote, active or noncanonical content %s', dataUrl => { expect(() => parseReceiptUpload({ fileName: 'receipt.png', dataUrl })).toThrow(); });
it('rejects forged MIME, zero bytes, unknown fields and nonstring bodies', () => {
    for (const input of [{ fileName: 'receipt.jpg', dataUrl: url(png, 'image/jpeg') }, { fileName: 'receipt.png', dataUrl: url(Buffer.alloc(0)) }, { fileName: 'receipt.png', dataUrl: url(png), ownerId: 'forged' }, { fileName: 'receipt.png', dataUrl: 123 }, null])
        expect(() => parseReceiptUpload(input)).toThrow();
});
it('bounds image/PDF content separately without truncating bytes', () => {
    const image = Buffer.alloc(4 * 1024 * 1024 + 1);
    png.copy(image);
    expect(() => parseReceiptUpload({ fileName: 'receipt.png', dataUrl: url(image) })).toThrow();
    const pdf = Buffer.alloc(10 * 1024 * 1024 + 1);
    Buffer.from('%PDF-1.7').copy(pdf);
    expect(() => parseReceiptUpload({ fileName: 'receipt.pdf', dataUrl: url(pdf, 'application/pdf') })).toThrow();
    const small = Buffer.from('%PDF-1.7\nSynthetic offline receipt\n%%EOF');
    expect(parseReceiptUpload({ fileName: 'receipt.pdf', dataUrl: url(small, 'application/pdf') })).toMatchObject({ mime: 'application/pdf', extension: 'pdf', size: small.length });
});
it('binds metadata file key to opaque identity and detected type, not display filename', () => {
    expect(() => validateReceiptMetadata(metadata(), new Set(['synthetic-record']), new Set(['synthetic-adult']))).not.toThrow();
    expect(receiptMediaPath(metadata().fileKey)).toBe('wallet-receipts/' + id + '.png');
});
it('keeps generated display names within the metadata limit and rejects broken Unicode while accepting emoji', () => {
    expect(() => parseReceiptUpload({ fileName: 'a'.repeat(200), dataUrl: url(png) })).toThrow();
    expect(() => parseReceiptUpload({ fileName: 'Receipt\ud800.png', dataUrl: url(png) })).toThrow();
    expect(parseReceiptUpload({ fileName: 'Receipt 😀.png', dataUrl: url(png) }).fileName).toBe('Receipt 😀.png');
});
it.each([{ fileKey: '../receipt.png' }, { fileKey: id + '.pdf' }, { id: id.toUpperCase() }, { fileKey: 'other.png' }, { size: 0 }, { size: 1.5 }, { size: 9007199254740992 }, { sha256: 'A'.repeat(64) }, { createdAt: '2026-02-30T00:00:00.000Z' }, { createdAt: null }, { recordId: 'unknown' }, { createdBy: 'unknown' }, { fileName: 'CON.png' }, { mime: 'text/html' }, { extra: 'unknown' }])('refuses invalid receipt metadata %j', patch => {
    expect(() => validateReceiptMetadata({ ...metadata(), ...patch }, new Set(['synthetic-record']), new Set(['synthetic-adult']))).toThrow();
});
