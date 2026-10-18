import { createHash } from 'node:crypto';
import { utf8, parseError, maxImportRows } from './common.js';
export interface OfxRow {
    rowNumber: number;
    type: string;
    postedAt: string;
    amount: string;
    fitId: string;
    payee: string;
    note: string;
    errors: string[];
}
export interface OfxStatement {
    namespace: string;
    currency: string;
    rows: OfxRow[];
}
function decode(raw: string): string { return raw.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => { const known: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }; if (known[entity.toLowerCase()] !== undefined)
    return known[entity.toLowerCase()]; const n = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)); if (!Number.isInteger(n) || n < 1 || n > 0x10ffff || n >= 0xd800 && n <= 0xdfff)
    parseError('Mã ký tự OFX không hợp lệ.'); return String.fromCodePoint(n); }).trim(); }
const values = (source: string, tag: string) => [...source.matchAll(new RegExp('<' + tag + '\\s*>([^<]*)', 'gi'))].map(m => decode(m[1]));
function one(source: string, tag: string): string { const found = values(source, tag); if (found.length > 1 && new Set(found).size > 1)
    parseError('Thông tin nguồn OFX không nhất quán.'); return found[0] ?? ''; }
/** Local statement parsing only. No bank connection, XML entity resolution,
 * schema download, executable processing instruction or formula evaluation. */
export function parseOfx(bytes: Uint8Array): OfxStatement { let raw = utf8(bytes); raw = raw.replace(/<!--[\s\S]*?-->/g, ''); if (/<!|<\?(?!xml\s)/i.test(raw) || !/<OFX\s*>/i.test(raw) || !/<\/OFX\s*>/i.test(raw))
    parseError('Cấu trúc OFX không hỗ trợ.'); const accountBlocks = [...raw.matchAll(/<(BANKACCTFROM|CCACCTFROM)\s*>([\s\S]*?)<\/\1\s*>/gi)]; if (accountBlocks.length !== 1)
    parseError('Chọn một sao kê có đúng một tài khoản nguồn.'); const header = raw.slice(0, raw.search(/<STMTTRN\s*>/i)), account = accountBlocks[0], fid = one(header, 'FID'), bank = one(account[2], 'BANKID'), org = fid || bank ? '' : one(header, 'ORG'), id = one(account[2], 'ACCTID'), type = account[1].toUpperCase() === 'CCACCTFROM' ? 'CREDITCARD' : one(account[2], 'ACCTTYPE'); if (!id || !type || !(fid || bank || org) || [id, type, fid, bank, org].some(v => v.length > 1024))
    parseError('OFX thiếu định danh tổ chức/tài khoản ổn định.'); const namespace = createHash('sha256').update(JSON.stringify({ fid: fid.trim(), bank: bank.trim(), org: org.normalize('NFKC').toUpperCase(), id: id.trim(), type: type.toUpperCase() })).digest('hex'), currency = one(header, 'CURDEF').toUpperCase(); if (!['VND', 'USD'].includes(currency))
    parseError('Tiền tệ OFX không hỗ trợ.'); const blocks = [...raw.matchAll(/<STMTTRN\s*>([\s\S]*?)<\/STMTTRN\s*>/gi)], opened = [...raw.matchAll(/<STMTTRN\s*>/gi)].length; if (opened !== blocks.length || blocks.some(b => /<STMTTRN\s*>/i.test(b[1])))
    parseError('Giao dịch OFX chưa đóng hoặc bị lồng nhau.'); if (blocks.length > maxImportRows - 1)
    parseError('OFX vượt10.000 giao dịch.', 'LIMIT_EXCEEDED'); const rows = blocks.map((block, index): OfxRow => { const errors: string[] = [], field = (tag: string) => { const result = values(block[1], tag); if (result.length > 1 && !errors.includes('DUPLICATE_FIELD'))
    errors.push('DUPLICATE_FIELD'); const value = result[0] ?? ''; if (value.length > 100000)
    parseError('Một trường OFX vượt giới hạn.', 'LIMIT_EXCEEDED'); return value; }, fitId = field('FITID'), amount = field('TRNAMT'), postedAt = field('DTPOSTED'), kind = field('TRNTYPE'), payee = field('NAME'), note = field('MEMO'); if (!fitId || fitId.length > 255 || /[\x00-\x1f\x7f]/.test(fitId))
    errors.push('INVALID_SOURCE_ID'); if (!/^[+-]?\d+(?:\.\d+)?$/.test(amount))
    errors.push('INVALID_AMOUNT'); if (!/^\d{8}(?:\d{6}(?:\.\d{1,3})?(?:\[[+-]?\d+(?:\.\d+)?:[^\]]+\])?)?$/.test(postedAt))
    errors.push('INVALID_DATE'); return { rowNumber: index + 1, type: kind, postedAt, amount, fitId, payee, note, errors }; }); return { namespace, currency, rows }; }
