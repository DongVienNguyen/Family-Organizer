import { utf8, rangeInput, parseError, maxImportRows, maxImportColumns, type MatrixRange, type ImportMatrix, type RawImportRow } from './common.js';
/** Bounded RFC4180-style tokenization. No inference, formulas or evaluation.
 * Row numbers identify logical records, including quoted embedded newlines. */
export function parseCsv(bytes: Uint8Array, options: MatrixRange & {
    delimiter: string;
}): ImportMatrix {
    const raw = utf8(bytes), range = rangeInput(options), delimiter = options.delimiter;
    if (typeof delimiter !== 'string' || delimiter.length !== 1 || /["\r\n\0]/.test(delimiter))
        parseError('Chọn một ký tự phân cách hợp lệ.');
    const rows: RawImportRow[] = [];
    let cells: string[] = [], field = '', quoted = false, closed = false, started = false, totalRows = 0;
    const pushField = () => { cells.push(field); field = ''; closed = false; if (cells.length > maxImportColumns)
        parseError('Tệp vượt256 cột.', 'LIMIT_EXCEEDED'); };
    const pushRow = () => { pushField(); totalRows++; if (totalRows >= range.startRow && (range.endRow === undefined || totalRows <= range.endRow)) {
        if (rows.length >= maxImportRows)
            parseError('Chọn tối đa10.000 dòng dữ liệu và một dòng tiêu đề.', 'LIMIT_EXCEEDED');
        rows.push({ rowNumber: totalRows, cells: cells.slice(range.startColumn - 1, range.endColumn).map(value => ({ type: 'text', value })) });
    } cells = []; started = false; };
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (quoted) {
            if (ch === '"') {
                if (raw[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else
                field += ch;
        }
        else if (ch === delimiter) {
            pushField();
            started = true;
        }
        else if (ch === '\r' || ch === '\n') {
            pushRow();
            if (ch === '\r' && raw[i + 1] === '\n')
                i++;
        }
        else if (closed)
            parseError('Có ký tự sau dấu đóng ngoặc kép CSV.');
        else if (ch === '"') {
            if (field.length)
                parseError('Ngoặc kép CSV phải bắt đầu một ô.');
            quoted = true;
            started = true;
        }
        else {
            field += ch;
            started = true;
        }
        if (field.length > 100000)
            parseError('Một ô dữ liệu vượt giới hạn.', 'LIMIT_EXCEEDED');
    }
    if (quoted)
        parseError('Ô CSV chưa đóng ngoặc kép.');
    if (started || cells.length || field.length || closed)
        pushRow();
    if (!totalRows)
        parseError('Tệp CSV không có dòng dữ liệu.');
    if (range.startRow > totalRows || range.endRow !== undefined && range.endRow > totalRows)
        parseError('Phạm vi vượt số dòng nguồn.');
    return { rows, totalRows };
}
