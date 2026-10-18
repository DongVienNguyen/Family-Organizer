import { AppStoreError } from '../../appErrors.js';
export const maxImportBytes = 20 * 1024 * 1024, maxImportRows = 10001, maxImportColumns = 256;
export interface RawImportCell {
    type: 'text' | 'number';
    value: string;
    error?: 'FORMULA' | 'UNSAFE_NUMBER' | 'UNSUPPORTED_CELL';
}
export interface RawImportRow {
    rowNumber: number;
    cells: RawImportCell[];
}
export interface ImportMatrix {
    rows: RawImportRow[];
    totalRows: number;
    date1904?: boolean;
}
export interface MatrixRange {
    startRow?: number;
    endRow?: number;
    startColumn?: number;
    endColumn?: number;
}
export const parseError = (message: string, code = 'INVALID_IMPORT_FILE'): never => { throw new AppStoreError(message, code === 'LIMIT_EXCEEDED' ? 413 : 400, code); };
export function inputBytes(value: Uint8Array): Buffer { if (!(value instanceof Uint8Array) || value.byteLength === 0)
    parseError('Tệp nhập trống.'); if (value.byteLength > maxImportBytes)
    parseError('Tệp nhập vượt20MiB.', 'LIMIT_EXCEEDED'); return Buffer.from(value.buffer, value.byteOffset, value.byteLength); }
export function utf8(value: Uint8Array): string { const raw = inputBytes(value); try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/^\ufeff/, '');
    if (decoded.includes('\0'))
        throw Error();
    return decoded;
}
catch {
    parseError('Tệp cần mã UTF-8 hợp lệ, không có ký tự NUL.');
} }
export function rangeInput(value: MatrixRange = {}) { const startRow = value.startRow ?? 1, endRow = value.endRow, startColumn = value.startColumn ?? 1, endColumn = value.endColumn; for (const n of [startRow, startColumn])
    if (!Number.isSafeInteger(n) || n < 1)
        parseError('Phạm vi dòng/cột không hợp lệ.'); for (const n of [endRow, endColumn])
    if (n !== undefined && (!Number.isSafeInteger(n) || n < 1))
        parseError('Phạm vi dòng/cột không hợp lệ.'); if (endRow !== undefined && (endRow < startRow || endRow - startRow + 1 > maxImportRows) || endColumn !== undefined && (endColumn < startColumn || endColumn - startColumn + 1 > maxImportColumns))
    parseError('Phạm vi nhập vượt giới hạn.', 'LIMIT_EXCEEDED'); return { startRow, endRow, startColumn, endColumn }; }
