import { createHash } from 'node:crypto';
import { object, keys, text } from '../../src/features/productivity/validation.js';
import { UserRole, type FamilyOrganizerDB } from '../../src/types.js';
import type { Actor, CommandContext } from '../../src/features/wallet/contracts.js';
import type { AppSnapshot, ValidatedAppSnapshot } from '../snapshotValidation.js';
import type { restoreAppSnapshot, getCommittedRestore, RestoreGuardReader, RestoreGuardPhase } from '../appSnapshot.js';
import { getAppCommandContext, withAppCommandContext } from '../commandContext.js';
import { AppStoreError } from '../appErrors.js';
import { assertWalletActor, type WalletReader } from './access.js';
import { inspectWalletStorage } from './integration.js';
import { walletStorageVersions } from './schemaRegistry.js';
import { convertLegacyReceiptBackup } from './receiptMigration.js';
import { parseReceiptUpload } from './receiptContract.js';
import { walletRestoreDatabaseIdentity, walletRestoreFilesIdentity, currentWalletRestoreDatabaseIdentity } from './restoreIdentity.js';
type Replacements = Record<string, {
    fileName: string;
    dataUrl: string;
}>;
export interface ReceiptRestoreInput {
    backupId: string;
    backupChecksum: string;
    runId: string;
    at: string;
    databaseIdentity: string;
    filesIdentity: string;
    targetChecksum: string;
    replacements?: Replacements;
}
export interface ReceiptRestorePreparation extends Omit<ReceiptRestoreInput, 'replacements'> {
    copied: number;
    remaining: number;
    converted: boolean;
}
const fail = (status: number, message: string): never => { throw new AppStoreError(message, status, 'wallet-receipt-restore'); };
function timestamp(value: unknown): string { text(value, 24); if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    fail(400, 'Thời điểm chuyển đổi không hợp lệ.'); return value; }
function replacements(raw: unknown): Replacements {
    if (raw === undefined)
        return {};
    try {
        const value = object(raw), result: Replacements = Object.create(null);
        let bytes = 0;
        for (const id of Object.keys(value).sort()) {
            text(id, 256);
            const upload = parseReceiptUpload(value[id]);
            bytes += upload.size;
            if (bytes > 256 * 1024 * 1024)
                throw Error();
            result[id] = structuredClone(value[id]) as Replacements[string];
        }
        return result;
    }
    catch {
        fail(400, 'Hóa đơn thay thế không hợp lệ.');
    }
}
function input(raw: unknown): ReceiptRestoreInput {
    try {
        const value = object(raw);
        keys(value, ['backupId', 'backupChecksum', 'runId', 'at', 'databaseIdentity', 'filesIdentity', 'targetChecksum', 'replacements']);
        if (typeof value.backupId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.backupId))
            throw Error();
        text(value.runId, 256);
        for (const key of ['backupChecksum', 'databaseIdentity', 'filesIdentity', 'targetChecksum'])
            if (typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key] as string))
                throw Error();
        return { backupId: value.backupId, backupChecksum: value.backupChecksum as string, runId: value.runId, at: timestamp(value.at), databaseIdentity: value.databaseIdentity as string, filesIdentity: value.filesIdentity as string, targetChecksum: value.targetChecksum as string, replacements: replacements(value.replacements) };
    }
    catch (error) {
        if (error instanceof AppStoreError)
            throw error;
        fail(400, 'Biên nhận xem trước hóa đơn không hợp lệ.');
    }
}
function admin(reader: WalletReader, actor: Actor): void { if (assertWalletActor(reader, actor).role !== UserRole.ADMIN)
    fail(403, 'Chỉ quản trị viên hiện tại được áp dụng di trú hóa đơn.'); }
function inactive(reader: WalletReader, actor: Actor): number {
    admin(reader, actor);
    const version = reader.get("SELECT max(version) AS n FROM app_migrations WHERE namespace='wallet'")?.n;
    if (!walletStorageVersions.includes(version) || version < 5 || reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value !== '0')
        fail(409, 'Cần kho Wallet hóa đơn đang tắt.');
    try {
        if (!inspectWalletStorage(reader))
            throw Error();
    }
    catch {
        fail(409, 'Schema Wallet không còn khớp.');
    }
    return version;
}
function identity(actor: Actor, value: ReceiptRestoreInput): string {
    const uploads = Object.entries(value.replacements ?? {}).map(([id, raw]) => { const upload = parseReceiptUpload(raw); return { id, fileName: upload.fileName, mime: upload.mime, size: upload.size, sha256: upload.sha256 }; });
    const { replacements: _replacements, ...receipt } = value;
    return createHash('sha256').update(JSON.stringify({ operation: 'wallet-private-receipt-restore-v1', actorId: actor.userId, receipt, uploads })).digest('hex');
}
/** Trusted live host binds persisted/read-back private safety backups, the
 * existing installation reader and real lifecycle maintenance. No connection,
 * file protocol, route, activation, job or external provider is created here. */
export function createWalletReceiptRestore(ports: {
    reader: WalletReader;
    readLegacy: () => FamilyOrganizerDB;
    readFiles: () => Pick<AppSnapshot, 'settings' | 'media'>;
    backup: (actor: Actor) => Promise<{
        id: string;
        snapshot: AppSnapshot;
    }>;
    readBackup: (id: string) => Promise<AppSnapshot>;
    validate: (value: unknown) => ValidatedAppSnapshot;
    restore: typeof restoreAppSnapshot;
    committed: typeof getCommittedRestore;
    maintenance: <T>(work: () => Promise<T>) => Promise<T>;
    now?: () => number;
}) {
    const live = (): RestoreGuardReader => ({ get: ports.reader.get, all: ports.reader.all, legacy: ports.readLegacy() });
    const validate = (raw: unknown) => { try {
        const value = ports.validate(raw);
        if (value.manifest.credentials !== undefined)
            throw Error();
        return value;
    }
    catch {
        fail(422, 'Backup an toàn đầy đủ không hợp lệ.');
    } };
    function guard(actor: Actor, source: AppSnapshot, expected: {
        databaseIdentity: string;
        filesIdentity: string;
    }, phase: RestoreGuardPhase, reader: RestoreGuardReader) {
        admin(reader, actor);
        if (phase === 'replay')
            return;
        if (inactive(reader, actor) !== source.manifest.domains.wallet)
            fail(409, 'Schema thay đổi sau bản xem trước.');
        if (currentWalletRestoreDatabaseIdentity(source, reader) !== expected.databaseIdentity)
            fail(409, 'Dữ liệu thay đổi sau backup; hãy tạo bản xem trước mới.');
        // The coordinator has promoted the planned files before its final SQL
        // fence. File comparisons therefore run only before file promotion.
        if (phase !== 'before-sql' && walletRestoreFilesIdentity(ports.readFiles()) !== expected.filesIdentity)
            fail(409, 'Tệp hoặc cấu hình thay đổi sau backup.');
    }
    return {
        async prepare(rawActor: Actor, rawOptions: {
            replacements?: Replacements;
        } = {}): Promise<ReceiptRestorePreparation> {
            const actor = structuredClone(rawActor), version = inactive(ports.reader, actor);
            let supplied: Replacements;
            try {
                const options = object(rawOptions);
                keys(options, ['replacements']);
                supplied = replacements(options.replacements);
            }
            catch {
                fail(400, 'Tùy chọn chuyển đổi không hợp lệ.');
            }
            const backup = await ports.backup({ ...actor });
            if (inactive(ports.reader, actor) !== version)
                fail(409, 'Schema thay đổi trong lúc backup.');
            if (!/^[A-Za-z0-9_-]{1,128}$/.test(backup.id))
                fail(422, 'Mã backup an toàn không hợp lệ.');
            const source = validate(backup.snapshot);
            if (source.manifest.domains.wallet !== version)
                fail(409, 'Backup không khớp schema hiện tại.');
            const expected = { databaseIdentity: walletRestoreDatabaseIdentity(source), filesIdentity: walletRestoreFilesIdentity(source) };
            guard(actor, source, expected, 'before-files', live());
            const at = timestamp(new Date((ports.now ?? Date.now)()).toISOString()), converted = convertLegacyReceiptBackup(source, { validate: ports.validate }, { actor, at, replacements: supplied });
            return { backupId: backup.id, backupChecksum: source.manifest.checksum, runId: converted.conversion.runId, at, ...expected, targetChecksum: converted.snapshot.manifest.checksum, copied: converted.conversion.copied.length, remaining: converted.conversion.remaining.length, converted: converted.conversion.converted };
        },
        async apply(rawContext: CommandContext, rawInput: ReceiptRestoreInput) {
            const ctx = structuredClone(rawContext);
            admin(ports.reader, ctx?.actor);
            if (typeof ctx.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(ctx.idempotencyKey) || ctx.expectedRevision !== undefined && ctx.expectedRevision !== 0)
                fail(400, 'Lệnh áp dụng hóa đơn không hợp lệ.');
            const value = input(rawInput), requestIdentity = identity(ctx.actor, value), parent = getAppCommandContext();
            if (parent && (parent.actorId !== ctx.actor.userId || parent.requestId !== ctx.idempotencyKey))
                fail(400, 'Lệnh không khớp chủ sở hữu yêu cầu.');
            return withAppCommandContext({ ...parent, actorId: ctx.actor.userId, requestId: ctx.idempotencyKey }, async () => {
                // Only this current Admin's compact original acknowledgement is
                // replayed. Source/files may have legitimately changed since it.
                const ack = (result: {
                    restoredFiles: number;
                }) => ({ ...result, sessionsRevoked:true as const, runId: value.runId, safetyBackup: { id: value.backupId, checksum: value.backupChecksum } });
                const prior = ports.committed(requestIdentity);
                if (prior)
                    return ack(prior);
                const version = inactive(ports.reader, ctx.actor), source = validate(await ports.readBackup(value.backupId));
                if (source.manifest.checksum !== value.backupChecksum || source.manifest.domains.wallet !== version || walletRestoreDatabaseIdentity(source) !== value.databaseIdentity || walletRestoreFilesIdentity(source) !== value.filesIdentity)
                    fail(409, 'Backup không khớp bản xem trước đã xác nhận.');
                guard(ctx.actor, source, value, 'before-files', live());
                const converted = convertLegacyReceiptBackup(source, { validate: ports.validate }, { actor: ctx.actor, at: value.at, replacements: value.replacements });
                if (converted.conversion.runId !== value.runId || converted.snapshot.manifest.checksum !== value.targetChecksum)
                    fail(409, 'Kết quả chuyển đổi không khớp bản xem trước.');
                if (!converted.conversion.converted)
                    fail(409, 'Không có thay đổi hóa đơn để áp dụng.');
                const result = await ports.restore(converted.snapshot, { maintenance: ports.maintenance, identity: requestIdentity, assertCurrent: (phase, reader) => guard(ctx.actor, source, value, phase, reader) });
                return ack(result);
            });
        },
    };
}
