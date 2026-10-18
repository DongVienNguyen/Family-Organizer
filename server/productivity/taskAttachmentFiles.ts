/** Task-specific20MiB/private namespace. Ownership/ordinary-file lifecycle follows Wallet receipts; Wallet caps and implementation stay unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { detectedMediaType } from '../mediaContent.js';
import {taskAttachmentTypes,taskAttachmentMediaPath,validateTaskAttachmentBlob,normalizeTaskAttachmentFileName,maxTaskAttachmentBytes,type TaskAttachmentUpload,type TaskAttachmentBlob} from './taskAttachmentContract.js';
export type StagedTaskAttachmentFile=TaskAttachmentBlob;
interface Ownership {
    dev: bigint;
    ino: bigint;
    size: number;
    sha256: string;
    fileKey: string;
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const samePath = (left: string, right: string) => process.platform === 'win32' ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right);
/** Explicit DATA_DIR, opaque private keys, no public upload metadata or import/
 * factory side effects. The caller owns Task ACL and I01 claim commits. */
export function createTaskAttachmentFiles(options: {
    dataRoot: string;
    newId?: () => string;
    onBoundary?: (phase: string) => void;
}) {
    if (typeof options.dataRoot !== 'string' || !path.isAbsolute(options.dataRoot))
        throw Error('Absolute task attachment data root required');
    const root = path.resolve(options.dataRoot), owned = new WeakMap<object, Ownership>();
    function directory(folder: string, create = false) {
        if (create) {
            try {
                fs.mkdirSync(folder, { mode: 0o700 });
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                    throw error;
            }
        }
        const stat = fs.lstatSync(folder);
        if (stat.isSymbolicLink() || !stat.isDirectory() || !samePath(fs.realpathSync(folder), folder))
            throw Error('Task attachment directory must be ordinary');
    }
    function location(key: string, create = false) {
        const relative = taskAttachmentMediaPath(key);
        directory(root);
        let folder = root;
        for (const part of ['uploads', ...relative.split('/').slice(0, -1)]) {
            folder = path.join(folder, part);
            directory(folder, create);
        }
        return path.join(root, 'uploads', relative);
    }
    function fileStat(file: string) { const stat = fs.lstatSync(file, { bigint: true }); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n)
        throw Error('Task attachment file must be ordinary'); return stat; }
    function readExpected(reference: Pick<StagedTaskAttachmentFile, 'fileKey' | 'size' | 'sha256' | 'mime'>, identity?: Ownership) {
        const file = location(reference.fileKey), before = fileStat(file);
        if (before.size !== BigInt(reference.size) || reference.size < 1 || reference.size > maxTaskAttachmentBytes)
            throw Error('Task attachment size mismatch');
        if (identity && (identity.dev !== before.dev || identity.ino !== before.ino))
            throw Error('Task attachment identity changed');
        const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
        try {
            const current = fs.fstatSync(fd, { bigint: true });
            if (!current.isFile() || current.nlink !== 1n || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size)
                throw Error('Task attachment file changed');
            const bytes = Buffer.alloc(reference.size);
            let count = 0;
            while (count < bytes.length) {
                const length = fs.readSync(fd, bytes, count, bytes.length - count, null);
                if (!length)
                    throw Error('Incomplete task attachment file');
                count += length;
            }
            const extra = Buffer.alloc(1);
            if (fs.readSync(fd, extra, 0, 1, null) !== 0)
                throw Error('Task attachment file grew');
            const after = fs.fstatSync(fd, { bigint: true });
            if (after.size !== before.size || after.nlink !== 1n || hash(bytes) !== reference.sha256 || detectedMediaType(bytes) !== reference.mime)
                throw Error('Task attachment integrity mismatch');
            location(reference.fileKey);
            return { bytes, mime: reference.mime };
        }
        finally {
            fs.closeSync(fd);
        }
    }
    function removeOwned(proof: Ownership): boolean {
        try {
            const file = location(proof.fileKey), stat = fileStat(file);
            if (stat.dev !== proof.dev || stat.ino !== proof.ino || stat.size !== BigInt(proof.size))
                return false;
            // Only our exact known bytes may be removed, including an empty newly
            // created file if a fault happened before its first write.
            const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
            let bytes: Buffer;
            try {
                const current = fs.fstatSync(fd, { bigint: true });
                if (current.dev !== proof.dev || current.ino !== proof.ino || current.nlink !== 1n || current.size !== BigInt(proof.size))
                    return false;
                bytes = Buffer.alloc(proof.size);
                let count = 0;
                while (count < bytes.length) {
                    const n = fs.readSync(fd, bytes, count, bytes.length - count, null);
                    if (!n)
                        return false;
                    count += n;
                }
                if (fs.readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0)
                    return false;
            }
            finally {
                fs.closeSync(fd);
            }
            if (hash(bytes) !== proof.sha256)
                return false;
            const last = fileStat(file);
            if (last.dev !== proof.dev || last.ino !== proof.ino)
                return false;
            fs.unlinkSync(file);
            return true;
        }
        catch {
            return false;
        }
    }
    return {
        stage(input: TaskAttachmentUpload): StagedTaskAttachmentFile {
            if (!input || !Buffer.isBuffer(input.bytes))
                throw Error('Invalid staged task attachment bytes');
            const bytes = Buffer.from(input.bytes), mime = input.mime;
            if (!Object.hasOwn(taskAttachmentTypes, mime) || input.extension !== taskAttachmentTypes[mime] || bytes.length !== input.size || bytes.length === 0 || bytes.length > maxTaskAttachmentBytes || hash(bytes) !== input.sha256 || detectedMediaType(bytes) !== mime || normalizeTaskAttachmentFileName(input.fileName, mime) !== input.fileName)
                throw Error('Invalid staged task attachment integrity');
            const id = (options.newId ?? randomUUID)(), reference: StagedTaskAttachmentFile = Object.freeze({ id, fileKey: id + '.' + taskAttachmentTypes[mime], fileName: input.fileName, mime, size: bytes.length, sha256: input.sha256 });
            taskAttachmentMediaPath(reference.fileKey);
            const file = location(reference.fileKey, true);
            let fd: number | undefined, proof: Ownership | undefined;
            try {
                fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
                const stat = fs.fstatSync(fd, { bigint: true });
                if (!stat.isFile() || stat.nlink !== 1n)
                    throw Error('Invalid new receipt file');
                proof = { dev: stat.dev, ino: stat.ino, size: 0, sha256: hash(Buffer.alloc(0)), fileKey: reference.fileKey };
                location(reference.fileKey);
                options.onBoundary?.('after-open');
                fs.writeFileSync(fd, bytes);
                proof = { ...proof, size: bytes.length, sha256: reference.sha256 };
                options.onBoundary?.('after-write');
                fs.fsyncSync(fd);
                options.onBoundary?.('after-sync');
                fs.closeSync(fd);
                fd = undefined;
                readExpected(reference, proof);
                owned.set(reference, proof);
                return reference;
            }
            catch (error) {
                if (fd !== undefined) {
                    try {
                        fs.closeSync(fd);
                    }
                    catch { }
                }
                if (proof)
                    removeOwned(proof);
                throw error;
            }
        },
        read(metadata: TaskAttachmentBlob) { validateTaskAttachmentBlob(metadata); return readExpected(metadata); },
        verify(stage:StagedTaskAttachmentFile){const proof=owned.get(stage);if(!proof)throw Error('Task attachment stage is not owned');readExpected(stage,proof);},
        remove(metadata:TaskAttachmentBlob){validateTaskAttachmentBlob(metadata);readExpected(metadata);const stat=fileStat(location(metadata.fileKey));return removeOwned({dev:stat.dev,ino:stat.ino,size:metadata.size,sha256:metadata.sha256,fileKey:metadata.fileKey});},
        commit(stage: StagedTaskAttachmentFile) { const proof = owned.get(stage); if (!proof)
            throw Error('Task attachment stage is not owned'); readExpected(stage, proof); owned.delete(stage); },
        rollback(stage: StagedTaskAttachmentFile) { const proof = owned.get(stage); if (!proof)
            return false; const removed = removeOwned(proof); if (removed)
            owned.delete(stage); return removed; },
    };
}
export type TaskAttachmentFiles=ReturnType<typeof createTaskAttachmentFiles>;
