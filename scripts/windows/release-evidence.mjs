// Pure policy over authenticated API/download receipts. Callers supply facts, never approvals.
export const releaseRepository='DongVienNguyen/Family-Organizer';
export const releaseChecks=Object.freeze(['Windows Node22 baseline','Windows Node24 baseline','Windows production browsers','Windows package producer','Windows package clean consumer','Windows disposable service','ci-gate','Windows productivity browsers']);
export const releaseArtifactPrefixes=Object.freeze(['windows-node22','windows-node24','windows-browsers','windows-package','windows-package-harness','windows-package-tests','windows-service-tests','windows-productivity-browsers']);
const hex=(value,size)=>typeof value==='string'&&new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
export function isReleaseVersion(value){
 if(typeof value!=='string'||value.length>128)return false;
 const match=value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
 return !!match&&(!match[4]||match[4].split('.').every(part=>!/^\d+$/.test(part)||part==='0'||!part.startsWith('0')));
}
export function validateReleaseEvidence(value){
 const errors=[],require=(ok,name)=>{if(!ok)errors.push(name);};
 const {request:r,source:s,run,checks,artifact:a,download:d,package:p,reports:e}=value??{};
 require(r?.repository===releaseRepository&&s?.repository===releaseRepository&&run?.repository?.full_name===releaseRepository,'repository mismatch');
 require(hex(r?.commitSha,40)&&s?.commitSha===r.commitSha&&run?.head_sha===r.commitSha,'source mismatch');
 require(s?.mainAncestor===true&&run?.head_branch==='main'&&run?.event==='push','trusted main required');
 require(isReleaseVersion(r?.version)&&r?.tag===`v${r?.version}`&&s?.packageVersion===r?.version&&p?.appVersion===r?.version,'version/tag mismatch');
 require(positive(r?.runId)&&run?.id===r?.runId&&run?.workflow_id===381168350&&run?.run_attempt===1&&run?.status==='completed'&&run?.conclusion==='success','exact first-attempt CI required');
 require(Array.isArray(checks)&&checks.length===releaseChecks.length&&new Set(checks.map(c=>c?.name)).size===releaseChecks.length,'missing/duplicate checks');
 for(const name of releaseChecks){const c=Array.isArray(checks)?checks.find(c=>c?.name===name):null;require(c?.head_sha===r?.commitSha&&c?.status==='completed'&&c?.conclusion==='success'&&c?.app?.id===15368&&positive(r?.runId)&&typeof c?.details_url==='string'&&c.details_url.startsWith(`https://github.com/${releaseRepository}/actions/runs/${r.runId}/job/`)&&/^[0-9]+$/.test(c.details_url.slice(`https://github.com/${releaseRepository}/actions/runs/${r.runId}/job/`.length)),`untrusted or unsuccessful check: ${name}`);}
 require(positive(a?.id)&&a?.name===`windows-package-${r?.commitSha}-1`&&a?.expired===false&&a?.workflow_run?.id===r?.runId&&a?.workflow_run?.head_sha===r?.commitSha,'artifact identity mismatch');
 require(d?.artifactId===a?.id&&hex(d?.archiveSha256,64)&&a?.digest===`sha256:${d?.archiveSha256}`,'artifact digest mismatch');
 require(p?.commitSha===r?.commitSha&&hex(p?.zipSha256,64)&&positive(p?.zipSize)&&hex(p?.manifestSha256,64),'package receipt mismatch');
 require(e?.commitSha===r?.commitSha&&e?.runId===r?.runId&&e?.zipSha256===p?.zipSha256&&Array.isArray(e?.errors)&&e.errors.length===0,'report identity/errors');
 const quality=Array.isArray(e?.quality)?e.quality:[];
 require(quality.length===2&&new Set(quality.map(q=>q?.major)).size===2,'runtime reports missing/duplicate');
 for(const major of [22,24]){const q=quality.find(q=>q?.major===major);require(positive(q?.tests)&&q?.passed===q?.tests&&positive(q?.files)&&q?.failed===0&&q?.pending===0&&q?.todo===0,`Node${major} incomplete tests`);}
 require(positive(e?.browsers?.passed)&&e?.browsers?.failed===0&&e?.browsers?.skipped===0&&e?.browsers?.retries===0,'browser incomplete tests');
 require(e?.consumer?.passed===true&&e?.consumer?.fixtureCleanup===true,'consumer incomplete');
 require(e?.service?.passed===true&&e?.service?.serviceRemoved===true&&e?.service?.fixtureCleanup===true,'service incomplete');
 return errors;
}
export function validatePromotion(value,acceptance){
 const errors=validateReleaseEvidence(value),p=value?.package;
 if(acceptance?.os!=='Windows Server 2019'||acceptance?.build!==17763||acceptance?.architecture!=='x64'||acceptance?.runtime!=='v24.21.0'||acceptance?.commitSha!==p?.commitSha||acceptance?.zipSha256!==p?.zipSha256||acceptance?.operatorApproved!==true)errors.push('actual bound Server2019 approval required');
 for(const name of ['reboot','tls','restore','rollback'])if(acceptance?.checks?.[name]!==true)errors.push(`Server2019 ${name} not accepted`);
 return errors;
}
// No input/environment/variable can enable publication. Future authorization requires reviewed source.
export function assertPublicationAllowed(){throw new Error('RELEASE_PUBLICATION_DISABLED');}
