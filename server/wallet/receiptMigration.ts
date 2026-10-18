import {walletStorageVersions} from './schemaRegistry.js';
import { createHash } from 'node:crypto';
import { object } from '../../src/features/productivity/validation.js';
import { UserRole, type FinancialTransaction } from '../../src/types.js';
import type { Actor } from '../../src/features/wallet/contracts.js';
import type { AppSnapshot, ValidatedAppSnapshot } from '../snapshotValidation.js';
import { checksum, mediaManifest } from '../snapshotValidation.js';
import { mediaPath } from '../mediaPolicy.js';
import { detectedMediaType } from '../mediaContent.js';
import { parseReceiptUpload, receiptTypes, receiptMediaPath, validateReceiptMetadata, type ReceiptUpload } from './receiptContract.js';
import { legacyReceiptPathDigest } from './legacyMedia.js';
import { legacyFinanceSource, legacySourceChecksum, legacyPilotChecksum } from './legacyMigrationData.js';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function derivedId(seed: string): string {
    const chars = hash(seed).slice(0, 32).split('');
    chars[12] = '4';
    chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
    const s = chars.join('');
    return [s.slice(0, 8), s.slice(8, 12), s.slice(12, 16), s.slice(16, 20), s.slice(20)].join('-');
}
export interface LegacyReceiptConversion {
    sourceChecksum: string;
    resultChecksum: string;
    runId: string;
    at: string;
    converted: boolean;
    copied: {
        legacyId: string;
        recordId: string;
        receiptId: string;
        sha256: string;
    }[];
    remaining: {
        legacyId: string;
        recordId: string | null;
        reason: string;
    }[];
}
/** Explicit offline preparation only. The host owns current Admin authority,
 * persisted safety backup, source fencing and maintenance/restore. No fetch,
 * filesystem/SQL mutation, activation or implicit waiver of pending media. */
export function convertLegacyReceiptBackup(input: unknown, ports: {
    validate: (value: unknown) => ValidatedAppSnapshot;
}, options: {
    actor: Actor;
    at: string;
    newId?: (seed: string) => string;
    replacements?: Record<string, {
        fileName: string;
        dataUrl: string;
    }>;
}): {
    snapshot: ValidatedAppSnapshot;
    conversion: LegacyReceiptConversion;
} {
    const source = ports.validate(input), actor = options.actor, user = source.legacy.users.find(user => user.id === actor?.userId);
    if (actor?.role !== UserRole.ADMIN || user?.role !== UserRole.ADMIN || user.isDeleted)
        throw Error('Receipt conversion requires an active administrator');
    if ((source.manifest.domains.wallet<5||!walletStorageVersions.includes(source.manifest.domains.wallet)) || source.tables.app_meta.some(row => row.key === 'wallet_active' && row.value !== '0'))
        throw Error('Receipt conversion requires an inactive supported receipt schema');
    const at = options.at;
    if (typeof at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at)
        throw Error('Invalid receipt conversion time');
    if (source.tables.wallet_legacy_runs.length !== 1)
        throw Error('Receipt conversion requires one reviewed pilot');
    const target = structuredClone(source), run = target.tables.wallet_legacy_runs[0], originalSource = legacyFinanceSource(target.legacy);
    if (run.source_checksum !== legacySourceChecksum({ version: 2, timezone: run.timezone, source: originalSource }) || run.wallet_checksum !== legacyPilotChecksum(target.tables))
        throw Error('Receipt conversion source/pilot changed; reconcile before copying');
    const conversion: LegacyReceiptConversion = { sourceChecksum: source.manifest.checksum, resultChecksum: source.manifest.checksum, runId: String(run.id), at, converted: false, copied: [], remaining: [] }, newId = options.newId ?? derivedId, knownUsers = new Set<string>(target.legacy.users.map((user: {
        id: string;
    }) => user.id)), records = new Set<string>(target.tables.wallet_records.map(row => String(row.id))), originals = new Map<string, FinancialTransaction>(target.legacy.transactions.map((row: FinancialTransaction) => [row.id, row] as const));
    const recordLinks = target.tables.wallet_legacy_links.filter(row => row.source_kind === 'record'), linksByLegacyId = new Map(recordLinks.map(row => [String(row.legacy_id), row])), receiptIds = new Set(target.tables.wallet_receipts.map(row => row.id)), receiptKeys = new Set(target.tables.wallet_receipts.map(row => row.file_key)), existingReceipts = new Map(target.tables.wallet_receipts.map(row => [row.id, row])), auditIds = new Set(target.tables.wallet_audit.map(row => row.id));
    const replacements = new Map<string, ReceiptUpload>();
    if (options.replacements !== undefined) {
        const supplied = object(options.replacements);
        let replacementBytes = 0;
        for (const [id, value] of Object.entries(supplied)) {
            const link = linksByLegacyId.get(id), detail = link ? JSON.parse(String(link.detail_json)) : undefined, original = originals.get(id);
            if (!link || link.state !== 'mapped' || !original?.receiptImage)
                throw Error('Replacement requires a mapped original receipt');
            const upload = parseReceiptUpload(value);
            replacementBytes += upload.size;
            if (replacementBytes > 256 * 1024 * 1024)
                throw Error('Receipt replacements exceed snapshot capacity');
            if (detail.receiptPending !== true) {
                const existing = existingReceipts.get(detail.receiptId);
                if (detail.receiptReplacement !== true || !existing || existing.record_id !== link.target_id || existing.sha256 !== upload.sha256 || existing.file_name !== upload.fileName || existing.mime !== upload.mime)
                    throw Error('Receipt replacement is no longer pending');
            }
            replacements.set(id, upload);
        }
    }
    const media = new Map(Object.entries(target.media).map(([name, encoded]) => [name.toLowerCase(), { name, encoded }]));
    const audit = (link: any, action: string, state: Record<string, unknown>) => {
        const id = newId(JSON.stringify(['wallet-legacy-receipt-audit-v1', run.id, link.legacy_id, action, state]));
        if (auditIds.has(id))
            throw Error('Receipt conversion audit identity collision');
        auditIds.add(id);
        target.tables.wallet_audit.push({ id, record_id: link.target_id, actor_id: actor.userId, action: 'wallet:legacy:receipt:' + action });
        target.tables.wallet_audit_metadata.push({ audit_id: id, occurred_at: at, before_json: null, after_json: JSON.stringify(state) });
    };
    const prepare = (ref: string): {
        upload: ReceiptUpload;
    } | {
        reason: string;
    } => {
        if (/^https?:\/\//i.test(ref))
            return { reason: 'remote-reference' };
        let dataUrl = ref;
        if (ref.startsWith('/uploads/')) {
            let relative: string;
            try {
                relative = mediaPath(ref);
            }
            catch {
                return { reason: 'invalid-reference' };
            }
            const file = media.get(relative.toLowerCase());
            if (!file)
                return { reason: 'missing-file' };
            const bytes = Buffer.from(file.encoded, 'base64'), mime = detectedMediaType(bytes);
            if (!mime || !Object.hasOwn(receiptTypes, mime))
                return { reason: 'invalid-content' };
            dataUrl = 'data:' + mime + ';base64,' + file.encoded;
        }
        const declared = /^data:([^;,]+);base64,/.exec(dataUrl)?.[1]?.toLowerCase(), mime = declared === 'image/jpg' ? 'image/jpeg' : declared;
        if (!mime || !Object.hasOwn(receiptTypes, mime))
            return { reason: 'invalid-reference' };
        try {
            return { upload: parseReceiptUpload({ fileName: 'Legacy receipt.' + receiptTypes[mime as keyof typeof receiptTypes], dataUrl }) };
        }
        catch {
            return { reason: 'invalid-content' };
        }
    };
    for (const link of recordLinks) {
        const detail = JSON.parse(String(link.detail_json)), original = originals.get(String(link.legacy_id));
        if (!original || detail.sourceDigest !== legacySourceChecksum(original))
            throw Error('Receipt conversion legacy identity changed');
        const reference = original.receiptImage;
        if (!reference)
            continue;
        if (typeof reference !== 'string' || detail.receiptDigest !== hash(reference))
            throw Error('Receipt conversion reference changed');
        let marked = false, pathDigest: string | undefined;
        if (reference.startsWith('/uploads/')) {
            try {
                pathDigest = legacyReceiptPathDigest(reference);
            }
            catch { }
            if (pathDigest && detail.legacyMediaPathDigest !== pathDigest) {
                detail.legacyMediaPathDigest = pathDigest;
                marked = true;
            }
        }
        if (detail.receiptPending === true) {
            const replacement = replacements.get(String(link.legacy_id)), prepared = replacement ? { upload: replacement } : prepare(reference);
            if (link.state !== 'mapped' || !link.target_id)
                conversion.remaining.push({ legacyId: String(link.legacy_id), recordId: null, reason: 'quarantined-record' });
            else if ('reason' in prepared)
                conversion.remaining.push({ legacyId: String(link.legacy_id), recordId: String(link.target_id), reason: prepared.reason });
            else {
                const upload = prepared.upload, id = newId(JSON.stringify(['wallet-legacy-receipt-v1', run.id, link.legacy_id, detail.receiptDigest, upload.sha256])), metadata = { id, recordId: String(link.target_id), fileKey: id + '.' + upload.extension, fileName: replacement ? upload.fileName : 'Legacy receipt ' + id + '.' + upload.extension, mime: upload.mime, size: upload.size, sha256: upload.sha256, createdAt: at, createdBy: actor.userId };
                validateReceiptMetadata(metadata, records, knownUsers);
                const relative = receiptMediaPath(metadata.fileKey);
                if ((receiptIds.has(id) || receiptKeys.has(metadata.fileKey)) || media.has(relative.toLowerCase()))
                    throw Error('Receipt conversion file identity collision');
                receiptIds.add(id);
                receiptKeys.add(metadata.fileKey);
                target.tables.wallet_receipts.push({ id, record_id: metadata.recordId, file_key: metadata.fileKey, file_name: metadata.fileName, mime: metadata.mime, size: metadata.size, sha256: metadata.sha256, created_at: metadata.createdAt, created_by: metadata.createdBy });
                target.media[relative] = upload.bytes.toString('base64');
                media.set(relative.toLowerCase(), { name: relative, encoded: target.media[relative] });
                detail.receiptPending = false;
                detail.receiptId = id;
                detail.receiptSha256 = upload.sha256;
                detail.receiptConversionVersion = 1;
                if (replacement)
                    detail.receiptReplacement = true;
                conversion.copied.push({ legacyId: String(link.legacy_id), recordId: metadata.recordId, receiptId: id, sha256: upload.sha256 });
                audit(link, 'copy', { recordId: metadata.recordId, receiptId: id, sha256: upload.sha256, size: upload.size, mime: upload.mime, fileNameSha256: hash(metadata.fileName), replacement: !!replacement, legacyReceiptDigest: detail.receiptDigest, ...(pathDigest ? { legacyMediaPathDigest: pathDigest } : {}) });
                conversion.converted = true;
                marked = false;
            }
        }
        if (marked) {
            audit(link, 'protect-url', { legacyId: link.legacy_id, legacyMediaPathDigest: pathDigest });
            conversion.converted = true;
        }
        link.detail_json = JSON.stringify(detail);
    }
    if (!conversion.converted)
        return { snapshot: source, conversion };
    run.receipts_pending_count = target.tables.wallet_legacy_links.filter(row => row.source_kind === 'record' && row.state === 'mapped' && JSON.parse(String(row.detail_json)).receiptPending === true).length;
    run.status = Number(run.quarantined_count) > 0 ? 'quarantined' : Number(run.receipts_pending_count) > 0 ? 'pending_receipts' : 'ready';
    run.wallet_checksum = legacyPilotChecksum(target.tables);
    target.manifest.createdAt = at;
    target.manifest.mediaManifest = mediaManifest(target.media);
    target.manifest.checksum = checksum(target);
    const result = ports.validate(target);
    conversion.resultChecksum = result.manifest.checksum;
    return { snapshot: result, conversion };
}
