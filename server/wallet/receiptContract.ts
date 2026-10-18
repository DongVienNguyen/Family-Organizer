import { createHash } from 'node:crypto';
import { detectedMediaType } from '../mediaContent.js';
import { AppStoreError } from '../appErrors.js';
import { object, keys, text, integer, choice } from '../../src/features/productivity/validation.js';
export const receiptTypes = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' } as const;
export const privateReceiptMediaPrefix = 'wallet-receipts/';
export type ReceiptMime = keyof typeof receiptTypes;
export interface WalletReceiptMetadata {
    id: string;
    recordId: string;
    fileKey: string;
    fileName: string;
    mime: ReceiptMime;
    size: number;
    sha256: string;
    createdAt: string;
    createdBy: string;
}
export interface ReceiptUpload {
    bytes: Buffer;
    fileName: string;
    mime: ReceiptMime;
    extension: string;
    size: number;
    sha256: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const limit = (mime: ReceiptMime) => (mime === 'application/pdf' ? 10 : 4) * 1024 * 1024;
function fileName(value: unknown, mime: ReceiptMime): string {
    text(value, 200);
    const name = value.normalize('NFC');
    if (Buffer.from(name, 'utf8').toString('utf8') !== name)
        throw Error('Invalid receipt Unicode');
    if (name !== name.trim() || /[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(name) || /[. ]$/.test(name) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))
        throw Error('Invalid receipt name');
    const extension = receiptTypes[mime], dot = name.lastIndexOf('.');
    if (dot === 0)
        throw Error('Invalid receipt name');
    if (dot < 0) {
        const completed = name + '.' + extension;
        text(completed, 200);
        return completed;
    }
    const suffix = name.slice(dot + 1).toLowerCase();
    if (suffix !== extension && !(mime === 'image/jpeg' && suffix === 'jpeg'))
        throw Error('Misleading receipt extension');
    return name;
}
export { fileName as normalizeReceiptFileName };
export function parseReceiptUpload(value: unknown): ReceiptUpload {
    let raw: Record<string, unknown>;
    try {
        raw = object(value);
        keys(raw, ['fileName', 'dataUrl']);
        if (Object.keys(raw).length !== 2)
            throw Error();
    }
    catch {
        throw new AppStoreError('Dữ liệu hóa đơn không hợp lệ.', 400, 'INVALID_INPUT');
    }
    if (typeof raw.dataUrl !== 'string')
        throw new AppStoreError('Nội dung hóa đơn không hợp lệ.', 422, 'INVALID_INPUT');
    if (raw.dataUrl.length > 15 * 1024 * 1024)
        throw new AppStoreError('Hóa đơn vượt giới hạn kích thước.', 413, 'LIMIT_EXCEEDED');
    try {
        const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(raw.dataUrl);
        if (!match)
            throw Error('Invalid data URL');
        const declared = match[1].toLowerCase(), mime = (declared === 'image/jpg' ? 'image/jpeg' : declared) as ReceiptMime;
        if (!Object.hasOwn(receiptTypes, mime))
            throw Error('Unsupported type');
        const name = fileName(raw.fileName, mime), bytes = Buffer.from(match[2], 'base64');
        if (bytes.length > limit(mime))
            throw new AppStoreError('Hóa đơn vượt giới hạn kích thước.', 413, 'LIMIT_EXCEEDED');
        if (!bytes.length || bytes.toString('base64') !== match[2] || detectedMediaType(bytes) !== mime)
            throw Error('Invalid bytes');
        return { bytes, fileName: name, mime, extension: receiptTypes[mime], size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    catch (error) {
        if (error instanceof AppStoreError)
            throw error;
        throw new AppStoreError('Nội dung hoặc tên hóa đơn không hợp lệ.', 422, 'INVALID_INPUT');
    }
}
export function receiptMediaPath(fileKey: string): string {
    if (typeof fileKey !== 'string')
        throw Error('Invalid receipt key');
    const dot = fileKey.lastIndexOf('.'), id = fileKey.slice(0, dot), extension = fileKey.slice(dot + 1);
    if (!uuid.test(id) || !Object.values(receiptTypes).includes(extension as any) || fileKey !== id + '.' + extension)
        throw Error('Invalid receipt key');
    return privateReceiptMediaPrefix + fileKey;
}
export function validateReceiptMetadata(value: unknown, recordIds?: Set<string>, userIds?: Set<string>): asserts value is WalletReceiptMetadata {
    const row = object(value), fields = ['id', 'recordId', 'fileKey', 'fileName', 'mime', 'size', 'sha256', 'createdAt', 'createdBy'];
    keys(row, fields);
    if (Object.keys(row).length !== fields.length)
        throw Error('Incomplete receipt metadata');
    text(row.id, 36);
    if (!uuid.test(row.id))
        throw Error('Invalid receipt identity');
    text(row.recordId, 256);
    text(row.createdBy, 256);
    choice(row.mime, Object.keys(receiptTypes) as ReceiptMime[]);
    receiptMediaPath(row.fileKey as string);
    if (row.fileKey !== row.id + '.' + receiptTypes[row.mime] || fileName(row.fileName, row.mime) !== row.fileName)
        throw Error('Invalid receipt file identity');
    integer(row.size, 1, limit(row.mime));
    text(row.sha256, 64);
    if (!/^[0-9a-f]{64}$/.test(row.sha256))
        throw Error('Invalid receipt checksum');
    text(row.createdAt, 24);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.createdAt) || !Number.isFinite(Date.parse(row.createdAt)) || new Date(row.createdAt).toISOString() !== row.createdAt)
        throw Error('Invalid receipt creation time');
    if (recordIds && !recordIds.has(row.recordId) || userIds && !userIds.has(row.createdBy))
        throw Error('Unknown receipt parent/actor');
}
