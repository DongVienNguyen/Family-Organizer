import type {AppJobs} from '../appJobs.js';import type {createTaskImports,TaskImportJob} from './imports.js';import {object,keys,text,integer,choice} from '../../src/features/productivity/validation.js';
/** One shared registry/lease owner. Payloads contain only owned batch references;
 * commands yield between50-row transactions and respect shutdown cancellation. */
export function registerTaskImportJobs(jobs:AppJobs,engine:ReturnType<typeof createTaskImports>,events:{changed?(actorId:string,taskIds:string[]):void;progress?(actorId:string):void}={}):void {
 if(!jobs.durableEnabled||!engine.enabled())return;
 jobs.registerAppJob('productivity','task-import',async(signal,lease)=>{if(!lease)throw Error('Durable Task import lease required');const value=object(lease.payload);keys(value,['actorId','batchId','mode','queuedRevision']);text(value.actorId,256);text(value.batchId,256);choice(value.mode,['commit','undo']);integer(value.queuedRevision,1);const job=value as unknown as TaskImportJob;try{await engine.runImportJob(job,signal,ids=>events.changed?.(job.actorId,ids));}finally{events.progress?.(job.actorId);}});
 jobs.registerAppJob('productivity','task-import-expire',signal=>{if(!signal.aborted)engine.expireImports();},{everyMs:3600000,initialMs:60000,kind:'command'});
}
