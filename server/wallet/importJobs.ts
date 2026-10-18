import type { AppJobs } from '../appJobs.js';
import type { createWalletImports } from './imports.js';
import { object, keys, text, integer } from '../../src/features/productivity/validation.js';
/** Registered only by explicit runtime composition. Shared jobs own leases,
 * cancellation and shutdown drain; no second scheduler or installation writer. */
export function registerWalletImportJobs(jobs: AppJobs, imports: ReturnType<typeof createWalletImports>, changed: (batchId: string) => void) {
    jobs.registerAppJob('wallet', 'import-commit', (signal, job) => { if (!job)
        throw Error('Durable import lease required'); const v = object(job.payload); keys(v, ['actorId', 'batchId', 'revision']); text(v.actorId, 256); text(v.batchId, 256); integer(v.revision, 1); imports.applyQueuedImport(v.actorId, v.batchId, v.revision, signal, () => changed(v.batchId as string)); });
    jobs.registerAppJob('wallet', 'import-expire', signal => { if (!signal.aborted)
        imports.expireImports(); }, { everyMs: 3600000, initialMs: 60000, kind: 'command' });
}
