import {completionMarkerPrefix,semanticCompletionPrefix,completionMarker,semanticCompletionClaim} from './completionClaims.js';
import type {AppWriteTx} from './appStore.js';
import {AppStoreError} from './appErrors.js';
import {RewardStoreTx} from './rewardStore.js';
import type {RewardPointEntry} from '../src/types.js';
interface Policy {taskId:string;revision:number;operation:'complete'|'reopen'}
const policies=new WeakMap<AppWriteTx,Readonly<Policy>>();
export const completionClaimKey=(id:string)=>completionMarkerPrefix+id;
/** Trusted synchronous semantic calls only; never derived from a Task payload. */
export function withCompletionPolicy<T>(tx:AppWriteTx,policy:Policy,work:()=>T):T {
 if(policies.has(tx)||!Number.isSafeInteger(policy.revision)||policy.revision<1)throw new AppStoreError('Invalid completion policy scope',409);
 policies.set(tx,Object.freeze({...policy}));try{return work();}finally{policies.delete(tx);}
}
export function completionPolicy(tx:AppWriteTx,taskId:string):Readonly<Policy>|undefined {const p=policies.get(tx);return p?.taskId===taskId?p:undefined;}
function hasOutstandingGrant(tx:AppWriteTx,taskId:string):boolean {
 const rewards=new Map(tx.legacy.rewardLedger.map(e=>[e.id,e]));return tx.all('SELECT grant_entry_id FROM app_reward_claims WHERE reverse_entry_id IS NULL AND substr(claim_id,1,?)=?',semanticCompletionPrefix.length,semanticCompletionPrefix).some(claim=>rewards.get(claim.grant_entry_id)?.taskId===taskId);
}
export function markAcceptedCompletion(tx:AppWriteTx,taskId:string):void {
 const p=completionPolicy(tx,taskId);if(p?.operation==='complete'&&hasOutstandingGrant(tx,taskId))throw new AppStoreError('Cần xử lý lần thưởng trước khi chuyển sang chính sách mở lại mới.',409,'completion-policy-cutover');tx.run('DELETE FROM app_meta WHERE key=?',completionClaimKey(taskId));
 if(p?.operation==='complete')tx.run('INSERT INTO app_meta VALUES(?,?)',completionClaimKey(taskId),JSON.stringify({format:1,claimId:null}));
}
export function linkedCompletionGrant(tx:AppWriteTx,input:{taskId:string;userId:string;points:number;actorId:string;reason:string}):RewardPointEntry|undefined {
 const p=completionPolicy(tx,input.taskId);if(p?.operation!=='complete')return;
 const claimId=semanticCompletionPrefix+JSON.stringify([input.taskId,p.revision]),grant=new RewardStoreTx(tx).applyCompletionGrant({...input,claimId});
 tx.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({format:1,claimId}),completionClaimKey(input.taskId));return grant;
}
export function reverseAcceptedCompletion(tx:AppWriteTx,taskId:string,actorId:string):void {
 const raw=tx.get('SELECT value FROM app_meta WHERE key=?',completionClaimKey(taskId));
 if(!raw){if(tx.legacy.rewardLedger.some(e=>e.taskId===taskId&&e.points>0))throw new AppStoreError('Cần di trú liên kết điểm của lần hoàn thành cũ trước khi mở lại.',409,'completion-claim-migration');return;}
 let marker:ReturnType<typeof completionMarker>;try{marker=completionMarker(raw.value);}catch{throw new AppStoreError('Invalid completion claim marker',409);}
 if(marker.claimId===null&&hasOutstandingGrant(tx,taskId))throw new AppStoreError('Completion marker conflicts with outstanding grant',409);
 if(marker.claimId!==null){
  const claim=tx.get('SELECT * FROM app_reward_claims WHERE claim_id=?',marker.claimId);let identity:ReturnType<typeof semanticCompletionClaim>;
  try{identity=semanticCompletionClaim(claim,new Map(tx.legacy.rewardLedger.map(e=>[e.id,e])));}catch{throw new AppStoreError('Invalid active completion claim',409);}
  if(identity.taskId!==taskId||identity.reverse!==null)throw new AppStoreError('Invalid active completion claim',409);
  new RewardStoreTx(tx).applyCompletionReverse(marker.claimId,actorId);
 }
 tx.run('DELETE FROM app_meta WHERE key=?',completionClaimKey(taskId));
}
