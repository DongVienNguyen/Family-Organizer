import type {Actor} from './contracts.js';
import type {SavingsGoal} from '../../types.js';
export type ContributionSourcePolicy=(linkId:string,goalId:string,entryId:string)=>boolean;
/** The old savings endpoint also serves Wallet history. Its source policy must
 * be supplied afresh for reads and mutation receipts; absence fails closed. */
export function projectLinkedGoals(actor:Actor,goals:readonly SavingsGoal[],canRead?:ContributionSourcePolicy):SavingsGoal[]{
 if(!['member','admin'].includes(actor.role))return [];
 return goals.filter(g=>g.isShared||g.creatorId===actor.userId).map(g=>({id:g.id,name:g.name,targetAmount:g.targetAmount,...(g.deadline===undefined?{}:{deadline:g.deadline}),...(g.color===undefined?{}:{color:g.color}),...(g.note===undefined?{}:{note:g.note}),isShared:g.isShared,creatorId:g.creatorId,createdAt:g.createdAt,updatedAt:g.updatedAt,contributions:(g.contributions===undefined?[]:g.contributions).filter(c=>{if(!c.walletLinkId)return true;try{return canRead?.(c.walletLinkId,g.id,c.id)===true;}catch{return false;}}).map(c=>structuredClone(c))}));
}
