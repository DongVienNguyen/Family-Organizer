import * as XLSX from 'xlsx';
import unzipper from 'unzipper';
import { inputBytes, rangeInput, parseError, maxImportColumns, maxImportRows, type MatrixRange, type ImportMatrix, type RawImportCell } from './common.js';
async function container(bytes: Uint8Array, kind: 'xls' | 'xlsx'): Promise<Buffer> { const raw = inputBytes(bytes); if (kind === 'xls') {
    if (!raw.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])))
        parseError('Tệp không phải XLS BIFF/CFB.');
}
else if (kind === 'xlsx') {
    if (!raw.subarray(0, 2).equals(Buffer.from('PK')))
        parseError('Tệp không phải XLSX.');
    let directory: Awaited<ReturnType<typeof unzipper.Open.buffer>>;
    try {
        directory = await unzipper.Open.buffer(raw);
    }
    catch {
        parseError('Cấu trúc ZIP XLSX không hợp lệ.');
    }
    if (directory.files.length > 2000 || directory.files.reduce((n, f) => n + f.uncompressedSize, 0) > 50 * 1024 * 1024)
        parseError('Dung lượng giải nén bảng tính vượt giới hạn.', 'LIMIT_EXCEEDED');
    // Central-directory sizes are untrusted. Bound actual expansion as well,
    // before SheetJS can allocate a workbook from any entry (including sheets
    // not selected for import). Nothing is extracted to the host filesystem.
    let expanded=0;
    for(const entry of directory.files){const stream=entry.stream();let size=0;try{for await(const chunk of stream){size+=chunk.length;expanded+=chunk.length;if(size>entry.uncompressedSize||expanded>50*1024*1024)parseError('Dung lượng ZIP thực tế không khớp giới hạn.','LIMIT_EXCEEDED');}if(size!==entry.uncompressedSize)parseError('Kích thước ZIP khai báo không khớp.');}catch(error){if(error instanceof Error&&'status' in error)throw error;parseError('Không xác minh được nội dung ZIP XLSX.');}finally{stream.destroy();}}
    const names = directory.files.map(f => f.path);
    if (names.some(name => /(?:^|\/)(?:vbaProject\.bin|macrosheets)(?:\/|$)/i.test(name)))
        parseError('Không nhập workbook chứa macro.');
    if (!names.includes('[Content_Types].xml') || !names.includes('xl/workbook.xml'))
        parseError('Tệp ZIP không có cấu trúc XLSX.');
}
else
    parseError('Định dạng bảng tính không hỗ trợ.'); return Buffer.from(raw); }
function read(raw: Buffer, options: XLSX.ParsingOptions): XLSX.WorkBook { try {
    return XLSX.read(raw, { type: 'buffer', raw: true, dense: true, cellFormula: true, cellHTML: false, cellDates: false, bookVBA: true, ...options });
}
catch {
    parseError('Không đọc được bảng tính.');
} }
function guard(book: XLSX.WorkBook) { if (book.vbaraw)
    parseError('Không nhập workbook chứa macro.'); if (!Array.isArray(book.SheetNames) || book.SheetNames.length === 0 || book.SheetNames.length > 64 || new Set(book.SheetNames).size!==book.SheetNames.length || book.SheetNames.some(name=>typeof name!=='string'||!name.trim()||name.length>256))
    parseError('Workbook cần có1–64 sheet.', 'LIMIT_EXCEEDED'); }
export async function inspectSpreadsheet(bytes: Uint8Array, kind: 'xls' | 'xlsx') { const raw = await container(bytes, kind), book = read(raw, { bookSheets: true, bookProps: true }); guard(book); return { sheetNames: [...book.SheetNames] }; }
export async function parseSpreadsheet(bytes: Uint8Array, options: MatrixRange & {
    kind: 'xls' | 'xlsx';
    sheet: string;
}): Promise<ImportMatrix> {
    const range = rangeInput(options);
    if (typeof options.sheet !== 'string' || !options.sheet.trim() || options.sheet.length > 256)
        parseError('Chọn một sheet.');
    if (range.endRow !== undefined && range.endRow > maxImportRows || range.startRow > maxImportRows)
        parseError('Bản nhập đầu hỗ trợ tối đa10.000 dòng dữ liệu và tiêu đề.', 'LIMIT_EXCEEDED');
    const raw = await container(bytes, options.kind), book = read(raw, { sheets: options.sheet, sheetRows: range.endRow ?? maxImportRows + 1 });
    guard(book);
    const sheet = book.Sheets[options.sheet];
    if (!book.SheetNames.includes(options.sheet) || !Object.hasOwn(book.Sheets, options.sheet) || !sheet)
        parseError('Không tìm thấy sheet đã chọn.');
    let dimensions: XLSX.Range;
    try {
        dimensions = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1:A1');
    }
    catch {
        parseError('Phạm vi bảng tính không hợp lệ.');
    }
    const totalRows = dimensions.e.r + 1, endRow = range.endRow ?? totalRows, endColumn = range.endColumn ?? dimensions.e.c + 1;
    if (endRow - range.startRow + 1 > maxImportRows || endColumn - range.startColumn + 1 > maxImportColumns)
        parseError('Chọn tối đa10.000 dòng dữ liệu và256 cột.', 'LIMIT_EXCEEDED');
    if (range.startRow > totalRows || endRow > totalRows)
        parseError('Phạm vi vượt số dòng nguồn.');
    const data = sheet['!data'] as XLSX.CellObject[][] | undefined;
    const cell = (raw: XLSX.CellObject | undefined): RawImportCell => { if (!raw)
        return { type: 'text', value: '' }; if (raw.f !== undefined || raw.F !== undefined)
        return { type: 'text', value: '', error: 'FORMULA' }; if (raw.t === 'n') {
        if (typeof raw.v !== 'number' || !Number.isFinite(raw.v) || Math.abs(raw.v) > Number.MAX_SAFE_INTEGER || Object.is(raw.v, -0))
            return { type: 'number', value: '', error: 'UNSAFE_NUMBER' };
        return { type: 'number', value: String(raw.v) };
    } if (['s', 'str', 'b', 'z'].includes(raw.t)) {
        const value = raw.v === undefined ? '' : String(raw.v);
        if (value.length > 100000)
            parseError('Một ô vượt giới hạn.', 'LIMIT_EXCEEDED');
        return { type: 'text', value };
    } return { type: 'text', value: '', error: 'UNSUPPORTED_CELL' }; };
    return { date1904: !!book.Workbook?.WBProps?.date1904, totalRows, rows: Array.from({ length: endRow - range.startRow + 1 }, (_, i) => { const rowNumber = range.startRow + i; return { rowNumber, cells: Array.from({ length: endColumn - range.startColumn + 1 }, (_, column) => cell(data?.[rowNumber - 1]?.[range.startColumn + column - 1] ?? sheet[XLSX.utils.encode_cell({ r: rowNumber - 1, c: range.startColumn + column - 1 })])) }; }) };
}
