import {releaseRepository,releaseChecks,isReleaseVersion} from './release-evidence.mjs';
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
function requireFact(value){if(!value)throw new Error('RELEASE_METADATA_REJECTED');}
function list(value,key,count){requireFact(value?.total_count===count&&Array.isArray(value?.[key])&&value[key].length===count);return value[key];}
// This stage authenticates API identities through the supplied read-only transport.
// It is NOT a completed release receipt: download/report/asset checks follow.
export async function collectReleaseMetadata(request,authority){
 try{
  const r=request,s=authority?.source;
  requireFact(r?.repository===releaseRepository&&sha(r?.commitSha)&&positive(r?.runId)&&isReleaseVersion(r?.version)&&r?.tag===`v${r.version}`);
  requireFact(s?.repository===releaseRepository&&s?.commitSha===r.commitSha&&s?.mainAncestor===true&&s?.packageVersion===r.version&&typeof authority?.get==='function');
  const base=`/repos/${releaseRepository}`,get=authority.get;
  const run=await get(`${base}/actions/runs/${r.runId}`);
  requireFact(run?.id===r.runId&&run?.head_sha===r.commitSha&&run?.head_branch==='main'&&run?.event==='push'&&run?.run_attempt===1&&run?.workflow_id===381168350&&run?.status==='completed'&&run?.conclusion==='success'&&run?.repository?.full_name===releaseRepository&&run?.head_repository?.full_name===releaseRepository);
  const workflow=await get(`${base}/actions/workflows/381168350`);
  requireFact(workflow?.id===381168350&&workflow?.path==='.github/workflows/ci.yml'&&workflow?.state==='active');
  const rawChecks=await get(`${base}/commits/${r.commitSha}/check-runs?filter=all&per_page=100`);
  requireFact(positive(rawChecks?.total_count)&&rawChecks.total_count<=100&&Array.isArray(rawChecks?.check_runs)&&rawChecks.check_runs.length===rawChecks.total_count);
  const prefix=`https://github.com/${releaseRepository}/actions/runs/${r.runId}/job/`;
  const checks=rawChecks.check_runs.filter(c=>typeof c?.details_url==='string'&&c.details_url.startsWith(prefix));requireFact(checks.length===7);
  requireFact(new Set(checks.map(c=>c?.name)).size===7&&new Set(checks.map(c=>c?.id)).size===7);
  for(const name of releaseChecks){const c=checks.find(c=>c?.name===name),prefix=`https://github.com/${releaseRepository}/actions/runs/${r.runId}/job/`;requireFact(positive(c?.id)&&c?.head_sha===r.commitSha&&c?.app?.id===15368&&c?.status==='completed'&&c?.conclusion==='success'&&typeof c?.details_url==='string'&&c.details_url.startsWith(prefix)&&/^[0-9]+$/.test(c.details_url.slice(prefix.length)));}
  const jobs=list(await get(`${base}/actions/runs/${r.runId}/attempts/1/jobs?per_page=100`),'jobs',7);
  requireFact(new Set(jobs.map(j=>j?.name)).size===7&&new Set(jobs.map(j=>j?.id)).size===7);
  for(const name of releaseChecks){const j=jobs.find(j=>j?.name===name),c=checks.find(c=>c?.name===name);requireFact(positive(j?.id)&&j?.run_id===r.runId&&j?.status==='completed'&&j?.conclusion==='success'&&j?.check_run_url===`https://api.github.com/repos/${releaseRepository}/check-runs/${c.id}`&&c.details_url===`https://github.com/${releaseRepository}/actions/runs/${r.runId}/job/${j.id}`);}
  const artifacts=list(await get(`${base}/actions/runs/${r.runId}/artifacts?per_page=100`),'artifacts',7);
  const artifactNames=['windows-node22','windows-node24','windows-browsers','windows-package','windows-package-harness','windows-package-tests','windows-service-tests'].map(prefix=>`${prefix}-${r.commitSha}-1`);
  requireFact(new Set(artifacts.map(a=>a?.name)).size===7&&new Set(artifacts.map(a=>a?.id)).size===7);
  for(const name of artifactNames){const a=artifacts.find(a=>a?.name===name);requireFact(positive(a?.id)&&a?.expired===false&&typeof a?.digest==='string'&&/^sha256:[a-f0-9]{64}$/.test(a.digest)&&a?.workflow_run?.id===r.runId&&a?.workflow_run?.head_sha===r.commitSha&&a?.workflow_run?.head_branch==='main');}
  return {format:1,kind:'github-metadata-preflight',publicationAllowed:false,request:r,source:s,run,workflow,checks,jobs,artifacts,artifact:artifacts.find(a=>a.name===`windows-package-${r.commitSha}-1`)};
 }catch{throw new Error('RELEASE_METADATA_REJECTED');}
}

export function createGithubReader(token,{fetchImpl=globalThis.fetch,maxBytes=1024*1024}={}){
 requireFact(typeof token==='string'&&token.length>0&&!/[\r\n]/.test(token)&&typeof fetchImpl==='function'&&positive(maxBytes)&&maxBytes<=1024*1024);
 const allowed=/^\/repos\/DongVienNguyen\/Family-Organizer\/(?:actions\/runs\/[1-9][0-9]*(?:\/attempts\/1\/jobs\?per_page=100|\/artifacts\?per_page=100)?|actions\/workflows\/381168350|commits\/[a-f0-9]{40}\/check-runs\?filter=all&per_page=100)$/;
 return async apiPath=>{
  let reader;
  try{
   requireFact(typeof apiPath==='string'&&apiPath.length<=256&&allowed.test(apiPath));
   const response=await fetchImpl(`https://api.github.com${apiPath}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
   if(!response.ok){await response.body?.cancel();throw new Error('RELEASE_METADATA_REJECTED');}
   const declared=response.headers.get('content-length');requireFact(declared===null||(/^\d+$/.test(declared)&&Number(declared)<=maxBytes));
   requireFact(response.body&&typeof response.body.getReader==='function');reader=response.body.getReader();let size=0;const chunks=[];
   for(;;){const part=await reader.read();if(part.done)break;requireFact(part.value instanceof Uint8Array);size+=part.value.length;requireFact(size<=maxBytes);chunks.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{throw new Error('RELEASE_METADATA_REJECTED');}
  finally{if(reader){try{await reader.cancel();}catch{}reader.releaseLock();}}
 };
}

export function readTrustedSourceFacts(request,authority){
 try{
  const r=request,a=authority;
  requireFact(r?.repository===releaseRepository&&sha(r?.commitSha)&&isReleaseVersion(r?.version)&&a?.repository===releaseRepository&&a?.ref==='refs/heads/main'&&a?.event==='workflow_dispatch'&&sha(a?.workflowSha)&&typeof a?.git==='function');
  const git=args=>{const result=a.git(args);requireFact(result?.status===0&&result?.signal===null&&!result?.error);const bytes=typeof result.stdout==='string'?new TextEncoder().encode(result.stdout):result.stdout;requireFact(bytes instanceof Uint8Array&&bytes.length<=1024*1024);return new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim();};
  requireFact(git(['rev-parse','HEAD'])===a.workflowSha);
  requireFact([`https://github.com/${releaseRepository}`,`https://github.com/${releaseRepository}.git`].includes(git(['remote','get-url','origin'])));
  git(['merge-base','--is-ancestor',r.commitSha,'origin/main']);
  const version=JSON.parse(git(['show',r.commitSha+':package.json']))?.version;requireFact(version===r.version);
  return {repository:releaseRepository,commitSha:r.commitSha,mainAncestor:true,packageVersion:version};
 }catch{throw new Error('RELEASE_METADATA_REJECTED');}
}
