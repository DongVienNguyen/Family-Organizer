import { object, keys, text, choice } from '../../src/features/productivity/validation.js';
import { AppStoreError } from '../appErrors.js';
import type { ImportFile } from './imports.js';
export function parseImportUpload(raw: unknown): ImportFile { try {
    const v = object(raw);
    keys(v, ['accountId', 'fileName', 'format', 'base64']);
    text(v.accountId, 256);
    text(v.fileName, 240);
    choice(v.format, ['csv', 'xls', 'xlsx', 'ofx']);
    if (typeof v.base64 !== 'string' || v.base64.length > Math.ceil(20 * 1024 * 1024 / 3) * 4 || !v.base64.length || v.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(v.base64))
        throw Error();
    const bytes = Buffer.from(v.base64, 'base64');
    if (bytes.length > 20 * 1024 * 1024 || bytes.toString('base64') !== v.base64)
        throw Error();
    return { accountId: v.accountId, fileName: v.fileName, format: v.format, bytes };
}
catch {
    throw new AppStoreError('Tệp nhập không hợp lệ hoặc vượt20MiB.', 400, 'INVALID_INPUT');
} }
