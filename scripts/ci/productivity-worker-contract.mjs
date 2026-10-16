import{createHash}from'node:crypto';import{isDeepStrictEqual}from'node:util';
const digest=value=>createHash('sha256').update(value).digest('hex'),hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function productivityWorkerOrigin(value,index){
 const fail=()=>{throw Error('PRODUCTIVITY_WORKER_ORIGIN_REJECTED');};
 if(!Array.isArray(value)||value.length!==2||new Set(value).size!==2||!Number.isInteger(index)||index<0||index>1)fail();
 for(const origin of value){let u;try{u=new URL(origin);}catch{fail();}if(typeof origin!=='string'||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||origin!==u.origin||!/^\d+$/.test(u.port)||Number(u.port)<1024||Number(u.port)>65535)fail();}
 return value[index];
}
/** Two stores/processes are mandatory; aggregation never invents a healthy part. */
export function validateProductivityWorkers(input){
 try{
  const require=(v,message)=>{if(!v)throw Error(message);},m=input.manifest,parts=m?.workerFixtures;
  require(m?.workerFormat===1&&m.workerCount===2&&m.fixtureProject===m.project&&['chromium','firefox','webkit'].includes(m.project),'worker declaration/project');
  require(Array.isArray(parts)&&parts.length===2&&Array.isArray(input.workerLogs)&&input.workerLogs.length===2&&Array.isArray(input.workerRuntimes)&&input.workerRuntimes.length===2,'two complete worker proofs');
  require(new Set(parts.map(p=>p.fixtureId)).size===2&&new Set(parts.map(p=>p.port)).size===2,'independent stores/ports');
  for(let index=0;index<2;index++){
   const p=parts[index],log=input.workerLogs[index],runtime=input.workerRuntimes[index];require(p?.index===index&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.fixtureId??'')&&Number.isInteger(p.port)&&p.port>=1024&&p.port<=65535&&p.seedTasks===13,'worker identity/seed');
   require(hash(p.legacyFileBeforeSha256)&&p.legacyFileBeforeSha256===p.legacyFileAfterSha256&&p.integrity==='ok'&&p.databaseClosed===true&&p.nativeHandlesClosed===true&&p.fixtureRemoved===true&&p.error===null,'worker storage/cleanup');
   require(p.serverExitCode===0&&p.serverSignal===null&&Array.isArray(p.networkAttempts)&&p.networkAttempts.length===0,'worker native/offline');
   require(typeof log==='string'&&Buffer.byteLength(log)<=262144&&(log.match(/Server is running/g)??[]).length===1&&(log.match(/Shutdown complete/g)??[]).length===1&&p.serverLogSha256===digest(log),'worker lifecycle log');
   require(typeof runtime==='string'&&Buffer.byteLength(runtime)<=8192&&p.runtimeSha256===digest(runtime)&&runtime===input.workerRuntimes[0]&&isDeepStrictEqual(JSON.parse(runtime),input.engine),'actual shared pinned browser identity');
  }
  require(input.report?.config?.workers===2,'worker configuration');const groups=[new Set(),new Set()],workers=[new Set(),new Set()];
  function visit(suites){require(Array.isArray(suites),'worker cases');for(const s of suites){for(const spec of s.specs??[]){const match=spec.title?.match(/^P[0-9]{2} C([0-9]{2}) /);require(match&&Number(match[1])>0&&spec.tests?.length===1&&spec.tests[0].results?.length===1,'worker case identity');const r=spec.tests[0].results[0];require([0,1].includes(r.parallelIndex)&&[0,1].includes(r.workerIndex),'worker result identity');const group=Number(match[1])<=15?0:1;groups[group].add(r.parallelIndex);workers[group].add(r.workerIndex);}if(s.suites)visit(s.suites);}}
  visit(input.report.suites);require(groups.every(s=>s.size===1)&&workers.every(s=>s.size===1)&&[...groups[0]][0]!==[...groups[1]][0]&&[...workers[0]][0]!==[...workers[1]][0],'separate sequential case groups');return [];
 }catch(error){return['isolated productivity workers rejected: '+(error instanceof Error?error.message:'invalid data')];}
}
