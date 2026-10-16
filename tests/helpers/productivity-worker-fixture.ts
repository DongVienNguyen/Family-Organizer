import{createHash}from'node:crypto';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Synthetic contract records only; never a browser execution or qualification. */
export function withProductivityWorkers(shard:any){
 const runtime=JSON.stringify(shard.engine),log='Server is running\nShutdown complete\n';shard.workerLogs=[log,log];shard.workerRuntimes=[runtime,runtime];Object.assign(shard.manifest,{fixtureProject:shard.project,workerFormat:1,workerCount:2,workerFixtures:[0,1].map(index=>({index,fixtureId:'00000000-0000-4000-8000-00000000000'+index,port:44000+index,seedTasks:13,legacyFileBeforeSha256:'a'.repeat(64),legacyFileAfterSha256:'a'.repeat(64),integrity:'ok',databaseClosed:true,nativeHandlesClosed:true,fixtureRemoved:true,serverExitCode:0,serverSignal:null,networkAttempts:[],serverLogSha256:hash(log),runtimeSha256:hash(runtime),error:null}))});shard.serverLog=log+log;shard.report.config.workers=2;
 function visit(suites:any[]){for(const s of suites){for(const spec of s.specs??[]){const index=Number(spec.title.match(/^P\d{2} C(\d{2}) /)![1])<=19?0:1;for(const test of spec.tests)for(const result of test.results)Object.assign(result,{workerIndex:index,parallelIndex:index});}if(s.suites)visit(s.suites);}}visit(shard.report.suites);return shard;
}
