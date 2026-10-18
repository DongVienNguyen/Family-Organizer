import {createHash} from 'node:crypto';
import type {RewardPointEntry} from '../src/types.js';
export const semanticCompletionPrefix='productivity:completion:',completionMarkerPrefix='productivity:completion:claim:';
export function completionMarker(value:string):{format:1;claimId:string|null} {
 let marker:any;try{marker=JSON.parse(value);}catch{throw new Error('Invalid completion marker');}
 if(!marker||Object.keys(marker).sort().join(',')!=='claimId,format'||marker.format!==1||!(marker.claimId===null||typeof marker.claimId==='string'&&marker.claimId.startsWith(semanticCompletionPrefix)))throw new Error('Invalid completion marker');
 return marker;
}
/** Pure shared validation: no SQLite import/open, no historical claim rewrite. */
export function semanticCompletionClaim(claim:any,rewards:ReadonlyMap<string,RewardPointEntry>):{taskId:string;revision:number;grant:RewardPointEntry;reverse:RewardPointEntry|null} {
 let identity:any;try{if(typeof claim?.claim_id!=='string'||!claim.claim_id.startsWith(semanticCompletionPrefix))throw Error();identity=JSON.parse(claim.claim_id.slice(semanticCompletionPrefix.length));}catch{throw new Error('Invalid semantic completion identity');}
 const grant=rewards.get(claim.grant_entry_id),reverse=claim.reverse_entry_id===null?null:rewards.get(claim.reverse_entry_id);
 if(!Array.isArray(identity)||identity.length!==2||typeof identity[0]!=='string'||!identity[0]||!Number.isSafeInteger(identity[1])||identity[1]<1||!grant||grant.taskId!==identity[0]||typeof grant.userId!=='string'||!grant.userId||!Number.isSafeInteger(grant.points)||grant.points<=0||typeof grant.createdById!=='string'||!grant.createdById||typeof grant.reason!=='string'||claim.payload_hash!==createHash('sha256').update(JSON.stringify([grant.taskId,grant.userId,grant.points,grant.createdById,grant.reason])).digest('hex'))throw new Error('Invalid semantic completion grant');
 if(claim.reverse_entry_id!==null&&(!reverse||reverse.id===grant.id||reverse.taskId!==grant.taskId||reverse.userId!==grant.userId||reverse.points!==-grant.points||reverse.reason!=='Reverse: '+grant.reason||typeof reverse.createdById!=='string'||!reverse.createdById))throw new Error('Invalid semantic completion reversal');
 return {taskId:identity[0],revision:identity[1],grant,reverse:reverse??null};
}
