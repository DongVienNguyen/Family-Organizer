import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inputBytes, maxImportBytes } from './parsers/common.js';
import type { ImportFiles } from './imports.js';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
interface Proof {
    dev: bigint;
    ino: bigint;
    size: number;
    sha256: string;
}
/** Private staging, outside public media and release directories. No IO until an
 * explicit command; opaque UUID filenames never use the supplied file name. */
export function createImportFiles(options: {
    dataRoot: string;
    newId?: () => string;
}): ImportFiles {
    if (!path.isAbsolute(options.dataRoot))
        throw Error('Absolute import data root required');
    const root = path.resolve(options.dataRoot), owned = new Map<string, Proof>();
    const ordinary = (folder: string, create = false) => { if (create)
        try {
            fs.mkdirSync(folder, { mode: 0o700 });
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error;
        } const stat = fs.lstatSync(folder), real = fs.realpathSync(folder), equal = process.platform === 'win32' ? real.toLowerCase() === folder.toLowerCase() : real === folder; if (!stat.isDirectory() || stat.isSymbolicLink() || !equal)
        throw Error('Import staging directory must be ordinary'); };
    const location = (key: string, create = false) => { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key))
        throw Error('Invalid opaque import key'); ordinary(root); let folder = root; for (const part of ['private', 'wallet-imports']) {
        folder = path.join(folder, part);
        ordinary(folder, create);
    } return path.join(folder, key); };
    const stat = (file: string,allowEmpty=false) => { const value = fs.lstatSync(file, { bigint: true }); if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1n || value.size < (allowEmpty?0n:1n) || value.size > BigInt(maxImportBytes))
        throw Error('Import file must be ordinary and bounded'); return value; };
    const read = (key: string,allowEmpty=false) => { const file = location(key), before = stat(file,allowEmpty), fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)); try {
        const opened = fs.fstatSync(fd, { bigint: true });
        if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size)
            throw Error('Import identity changed');
        const bytes = Buffer.alloc(Number(before.size));
        let offset = 0;
        while (offset < bytes.length) {
            const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
            if (!count)
                throw Error('Incomplete import file');
            offset += count;
        }
        if (fs.readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0)
            throw Error('Import file grew');
        const after = fs.fstatSync(fd, { bigint: true });
        if (after.size !== before.size || after.nlink !== 1n)
            throw Error('Import changed during read');
        location(key);
        return { bytes, proof: { dev: before.dev, ino: before.ino, size: bytes.length, sha256: sha(bytes) } };
    }
    finally {
        fs.closeSync(fd);
    } };
    const api:ImportFiles={
        stage(raw: Uint8Array) { const bytes = Buffer.from(inputBytes(raw)), key = (options.newId ?? randomUUID)(), file = location(key, true), fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);let failed=false,failure:unknown;try {
            fs.writeFileSync(fd, bytes);
            fs.fsyncSync(fd);
            const value = fs.fstatSync(fd, { bigint: true });
            if (!value.isFile() || value.nlink !== 1n || value.size !== BigInt(bytes.length))
                throw Error('Import write integrity mismatch');
            owned.set(key, { dev: value.dev, ino: value.ino, size: bytes.length, sha256: sha(bytes) });
        }
        catch(error){failed=true;failure=error;try{const value=fs.fstatSync(fd,{bigint:true});if(value.isFile()&&value.nlink===1n&&value.size>=0n&&value.size<=BigInt(bytes.length)){const partial=Buffer.alloc(Number(value.size));let offset=0;while(offset<partial.length){const n=fs.readSync(fd,partial,offset,partial.length-offset,offset);if(!n)throw Error('Incomplete staged rollback proof');offset+=n;}if(bytes.subarray(0,partial.length).equals(partial))owned.set(key,{dev:value.dev,ino:value.ino,size:partial.length,sha256:sha(partial)});}}catch{/* Preserve the original failure; never delete unproven bytes. */}}
        finally {
            fs.closeSync(fd);
        }if(failed){api.remove(key);throw failure;} return key; },
        read(key) { return read(key).bytes; },
        remove(key, expected) { const reference = owned.get(key) ?? expected; if (!reference)
            return false; try {
            const current = read(key,true), file = location(key);
            if (current.proof.size !== reference.size || current.proof.sha256 !== reference.sha256 || 'dev' in reference && 'ino' in reference && (current.proof.dev !== reference.dev || current.proof.ino !== reference.ino))
                return false;
            const last = stat(file,true);
            if (last.dev !== current.proof.dev || last.ino !== current.proof.ino || last.size !== BigInt(reference.size))
                return false;
            fs.unlinkSync(file);
            owned.delete(key);
            return true;
        }
        catch (error) {
            return (error as NodeJS.ErrnoException).code === 'ENOENT';
        } }
    };
    return api;
}
