import {validateReleaseEvidence,assertPublicationAllowed} from './release-evidence.mjs';
const reject=()=>{throw Error('RELEASE_CANDIDATE_HANDOFF_REJECTED');};
// An internal preparation record after authenticated collector readers. Neither
// synthetic facts nor an operator JSON file confer provenance/publication authority.
export function prepareCandidateHandoff(evidence){
 try{
  if(evidence?.format!==1||evidence.kind!=='authenticated-collector-release-evidence'||evidence.reportsVerified!==true||evidence.consumerFunctionalVerified!==true||evidence.publicationAllowed!==false||evidence.server2019Acceptance!=='not-run'||validateReleaseEvidence(evidence).length!==0)reject();
  let locked=false;try{assertPublicationAllowed();}catch(error){locked=error?.message==='RELEASE_PUBLICATION_DISABLED';}if(!locked)reject();
  const {request,package:pkg}=JSON.parse(JSON.stringify(evidence));
  return {format:1,kind:'publication-disabled-candidate-handoff',request,package:pkg,assets:{zip:{name:'family-organizer-'+request.version+'-'+request.commitSha+'-win-x64.zip',sha256:pkg.zipSha256,bytes:pkg.zipSize},manifest:{name:'release-manifest.json',sha256:pkg.manifestSha256}},candidatePublication:'blocked-source-lock',promotion:'blocked-source-lock-and-actual-server2019-acceptance',publicationAllowed:false,releaseCreated:false,tagCreated:false,server2019Acceptance:'not-run'};
 }catch{reject();}
}
